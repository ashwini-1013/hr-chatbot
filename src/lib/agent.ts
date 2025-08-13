import { ChatGroq } from "@langchain/groq";
import { AIMessage, BaseMessage, HumanMessage } from "@langchain/core/messages";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { StateGraph } from "@langchain/langgraph";
import { Annotation } from "@langchain/langgraph";
import { tool } from "@langchain/core/tools";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import { MongoDBAtlasVectorSearch } from "@langchain/mongodb";
import { MongoClient } from "mongodb";
import { z } from "zod";
import "dotenv/config";
import { HuggingFaceEmbeddings } from "./HuggingFaceEmbeddings";

export async function callAgent(client: MongoClient, query: string, thread_id: string) {
  // Define the MongoDB database and collection
  const dbName = "hr_database";
  const db = client.db(dbName);
  const collection = db.collection("employees");

  // Define the graph state
  const GraphState = Annotation.Root({
    messages: Annotation<BaseMessage[]>({
      reducer: (x, y) => x.concat(y),
    }),
  });

  // Define the tools for the agent to use
  const employeeLookupTool = tool(
    async ({ query, n = 3 }) => { // Reduced from 10 to 3
      console.log("Employee lookup tool called");

      const dbConfig = {
        collection: collection,
        indexName: "vector_index",
        textKey: "embedding_text",
        embeddingKey: "embedding",
      };

      // Initialize vector store
      const vectorStore = new MongoDBAtlasVectorSearch(
        new HuggingFaceEmbeddings({
          apiKey: process.env.HUGGINGFACE_API_KEY!,
          model: 'sentence-transformers/all-MiniLM-L6-v2'
        }),
        dbConfig
      );

      const result = await vectorStore.similaritySearchWithScore(query, n);
      
      // Optimize the returned data - only return essential fields
      const optimizedResult = result.map(([doc, score]) => ({
        score: score,
        employee_id: doc.metadata.employee_id,
        name: `${doc.metadata.first_name} ${doc.metadata.last_name}`,
        job_title: doc.metadata.job_details?.job_title,
        department: doc.metadata.job_details?.department,
        skills: doc.metadata.skills?.slice(0, 5), // Limit skills to first 5
        hire_date: doc.metadata.job_details?.hire_date,
        salary: doc.metadata.job_details?.salary,
        is_remote: doc.metadata.work_location?.is_remote,
        office: doc.metadata.work_location?.nearest_office,
        summary: doc.pageContent?.substring(0, 200) + "..." // Truncate summary
      }));
      
      return JSON.stringify(optimizedResult);
    },
    {
      name: "employee_lookup",
      description: "Search for employee details from the HR database. Returns essential employee information.",
      schema: z.object({
        query: z.string().describe("The search query"),
        n: z
          .number()
          .optional()
          .default(3) // Changed default from 10 to 3
          .describe("Number of results to return (max 5)"),
      }),
    }
  );

  const tools = [employeeLookupTool];
  
  // We can extract the state typing via `GraphState.State`
  const toolNode = new ToolNode<typeof GraphState.State>(tools);

  const model = new ChatGroq({
    model: "llama-3.1-8b-instant", // Smaller model with higher rate limits
    temperature: 0,
  }).bindTools(tools);

  // Define the function that determines whether to continue or not
  function shouldContinue(state: typeof GraphState.State) {
    const messages = state.messages;
    const lastMessage = messages[messages.length - 1] as AIMessage;

    // If the LLM makes a tool call, then we route to the "tools" node
    if (lastMessage.tool_calls?.length) {
      return "tools";
    }
    // Otherwise, we stop (reply to the user)
    return "__end__";
  }

  // Define the function that calls the model
  async function callModel(state: typeof GraphState.State) {
    // Trim conversation history to prevent token buildup
    const messages = state.messages;
    const maxMessages = 8; // Keep only last 8 messages (4 exchanges)
    const trimmedMessages = messages.length > maxMessages 
      ? messages.slice(-maxMessages)
      : messages;

    // Shorter, more concise system prompt
    const prompt = ChatPromptTemplate.fromMessages([
      [
        "system",
        `You are an HR assistant. Use the employee_lookup tool to search for employee information. Keep responses concise and helpful.`,
      ],
      new MessagesPlaceholder("messages"),
    ]);

    const formattedPrompt = await prompt.formatMessages({
      messages: trimmedMessages,
    });

    const result = await model.invoke(formattedPrompt);

    return { messages: [result] };
  }

  // Define a new graph
  const workflow = new StateGraph(GraphState)
    .addNode("agent", callModel)
    .addNode("tools", toolNode)
    .addEdge("__start__", "agent")
    .addConditionalEdges("agent", shouldContinue)
    .addEdge("tools", "agent");

  // Initialize the MongoDB memory to persist state between graph runs
  const checkpointer = new MongoDBSaver({ client, dbName });

  // This compiles it into a LangChain Runnable.
  // Note that we're passing the memory when compiling the graph
  const app = workflow.compile({ checkpointer });

  // Use the Runnable
  const finalState = await app.invoke(
    {
      messages: [new HumanMessage(query)],
    },
    { recursionLimit: 10, configurable: { thread_id: thread_id } } // Reduced from 15 to 10
  );

  if (!finalState.messages || finalState.messages.length === 0) {
    throw new Error("No messages returned from agent.");
  }

  const lastMessage = finalState.messages[finalState.messages.length - 1];
  console.log(lastMessage);
  return lastMessage;
}