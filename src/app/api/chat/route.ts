import { NextRequest, NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';
import { callAgent } from '@/lib/agent';

// Create a global connection to reuse (important for serverless)
let cachedClient: MongoClient | null = null;

async function getMongoClient() {
  if (cachedClient) {
    return cachedClient;
  }
  
  cachedClient = new MongoClient(process.env.MONGODB_ATLAS_URI as string);
  await cachedClient.connect();
  return cachedClient;
}

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json();
    const threadId = Date.now().toString();

    const client = await getMongoClient();
    const response = await callAgent(client, message, threadId);
    
    return NextResponse.json({ threadId, response });
  } catch (error) {
    console.error('Error starting conversation:', error);
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
}