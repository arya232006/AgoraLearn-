import { embedText } from './embeddings';
import { supabase } from './supabase';
import { buildRagPrompt } from '../utils/prompt';
import { groqChat } from './groq';

export async function runRAG(
  query: string,
  topK = 10,
  docId?: string,
  history?: Array<{ role: string; content: string }>,
  rawChunks?: string[]
): Promise<{ answer: string; chunks: Array<{ id: string; text: string; doc_id?: string }> }> {
  let chunks: Array<{ id: string; text: string; doc_id?: string }> = [];
  // If rawChunks is provided (extension mode), use it directly
  if (rawChunks && Array.isArray(rawChunks) && rawChunks.length > 0) {
    chunks = rawChunks.map((text, i) => ({ id: `raw-${i}`, text }));
  } else {
    const qEmbedding = await embedText(query);
    // Call a supabase RPC to match vectors (see README schema for `match_chunks` function)
    const { data, error } = await supabase.rpc('match_chunks', {
      query_embedding: qEmbedding,
      match_count: topK,
      doc_filter: docId ?? null,
    });
    if (error) throw error;
    const rows = (data ?? []) as any[];
    chunks = rows
      .map((r) => ({ id: r.id, text: r.text, doc_id: r.doc_id }))
      .filter((c) => c.text && c.text.trim().length > 0);
    // Patch: If no chunks retrieved, fetch the first chunk for the docId
    if (chunks.length === 0 && docId) {
      const { data: fallbackRows } = await supabase
        .from('chunks')
        .select('id, text, doc_id')
        .eq('doc_id', docId)
        .limit(1);
      if (fallbackRows && fallbackRows.length > 0) {
        chunks = [{ id: fallbackRows[0].id, text: fallbackRows[0].text, doc_id: fallbackRows[0].doc_id }];
      }
    }
  }

  const prompt = buildRagPrompt(query, chunks.slice(0, topK));

  // Build messages array with history
  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: 'You are a helpful assistant specialized in study material.' }
  ];
  if (history && Array.isArray(history)) {
    messages.push(...history);
  }
  messages.push({ role: 'user', content: prompt });

  const answer = await groqChat(messages, 0.2);

  return { answer, chunks };
}
