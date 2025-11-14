import { embedText } from './embeddings';
import { supabase } from './supabase';
import { buildRagPrompt } from '../utils/prompt';
import { groqChat } from './groq';

export async function runRAG(query: string, topK = 5): Promise<{ answer: string; chunks: Array<{ id: string; text: string; doc_id?: string }> }> {
  const qEmbedding = await embedText(query);

  // Call a supabase RPC to match vectors (see README schema for `match_chunks` function)
  const { data, error } = await supabase.rpc('match_chunks', { query_embedding: qEmbedding, match_count: topK });
  if (error) throw error;

  const chunks = (data ?? []).map((r: any) => ({ id: r.id, text: r.text, doc_id: r.doc_id }));

  const prompt = buildRagPrompt(query, chunks.slice(0, topK));

  const messages = [
    { role: 'system', content: 'You are a helpful assistant specialized in study material.' },
    { role: 'user', content: prompt }
  ];

  const answer = await groqChat(messages, 0.2);

  return { answer, chunks };
}
