import { NextRequest, NextResponse } from "next/server";
import { MongoClient } from "mongodb";
import { callAgent } from "@/lib/agent";

let cachedClient: MongoClient | null = null;

async function getMongoClient() {
  if (cachedClient) return cachedClient;
  cachedClient = new MongoClient(process.env.MONGODB_ATLAS_URI as string);
  await cachedClient.connect();
  return cachedClient;
}

// 👇 key change: 'params' is a Promise and must be awaited
type ThreadParams = Promise<{ threadId: string }>;

export async function POST(
  req: NextRequest,
  context: { params: ThreadParams }
) {
  try {
    const { threadId } = await context.params; // ← await the promise
    const { message } = await req.json();

    if (!threadId) {
      return NextResponse.json({ error: "Missing threadId" }, { status: 400 });
    }

    const client = await getMongoClient();
    const response = await callAgent(client, message, threadId);

    return NextResponse.json({ response });
  } catch (error) {
    console.error("Error in chat:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
