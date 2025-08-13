import { Embeddings } from "@langchain/core/embeddings";
import { HfInference } from "@huggingface/inference";

export interface HuggingFaceEmbeddingsParams {
  apiKey: string;
  model?: string;
}

export class HuggingFaceEmbeddings extends Embeddings {
  private hf: HfInference;
  private model: string;

  constructor(params: HuggingFaceEmbeddingsParams) {
    super({});
    this.hf = new HfInference(params.apiKey);
    this.model = params.model ?? "sentence-transformers/all-MiniLM-L6-v2";
  }

  async embedQuery(text: string): Promise<number[]> {
    return await this.embed(text);
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((text) => this.embed(text)));
  }

  private async embed(text: string): Promise<number[]> {
    const response = await this.hf.featureExtraction({
      model: this.model,
      inputs: text,
    });

    if (!Array.isArray(response)) {
      throw new Error("Unexpected response from Hugging Face Inference API");
    }

    return response as number[];
  }
}
