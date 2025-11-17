import type { VercelRequest, VercelResponse } from '@vercel/node';
import { runRAG } from '../lib/rag';
import { safeParseJson } from '../utils/safeParse';
import { supabase } from '../lib/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Diagnostic logs: headers and body preview to help debug parsing issues
  try {
    console.debug('api/converse headers=', req.headers);
    console.debug('api/converse content-type=', String(req.headers['content-type'] || ''));
    try {
      const preview = typeof req.body === 'object' ? JSON.stringify(req.body).slice(0, 1000) : String(req.body).slice(0, 1000);
      console.debug('api/converse body preview=', preview);
    } catch (e) {
      console.debug('api/converse body preview: <unavailable>');
    }
  } catch (e) {
    console.debug('api/converse logging error', String(e));
  }

  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const parsed = (await safeParseJson(req)) ?? (req.body as { query?: string; docId?: string; conversationId?: string } | undefined);
    const query = parsed?.query;
    const docId = parsed?.docId;
    const conversationId = parsed?.conversationId;

    if (!query) {
      return res.status(400).json({ error: 'Missing query' });
    }

    // Fetch conversation history if conversationId is provided
    let history: Array<{ role: string; content: string }> = [];
    if (conversationId) {
      const { data: messages, error } = await supabase
        .from('messages')
        .select('role,content')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });
      if (error) {
        console.error('Supabase fetch messages error:', error);
      } else if (messages) {
        history = messages.map((m: any) => ({ role: m.role, content: m.content }));
      }
    }

    // Run RAG with history
    const { answer, chunks } = await runRAG(query, 5, docId, history);

    // Store user query and assistant reply in messages table if conversationId is provided
    if (conversationId) {
      // Store user message
      await supabase.from('messages').insert({
        conversation_id: conversationId,
        role: 'user',
        content: query
      });
      // Store assistant reply
      await supabase.from('messages').insert({
        conversation_id: conversationId,
        role: 'assistant',
        content: answer
      });
    }

    return res.status(200).json({ answer, chunks });
  } catch (err: any) {
    console.error('api/converse error:', err);
    return res.status(500).json({ error: err?.message ?? 'Internal Server Error' });
  }
}
