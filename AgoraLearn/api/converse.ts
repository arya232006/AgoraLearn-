import type { VercelRequest, VercelResponse } from '@vercel/node';
import { runRAG } from '../lib/rag';
import { safeParseJson } from '../utils/safeParse';
import { supabase } from '../lib/supabase';
import { franc } from 'franc'; // Language detection
import fetch from 'node-fetch'; // For Lingo.dev API calls

async function detectLanguage(text: string): Promise<string> {
  // Use franc to detect language code (ISO 639-1)
  const lang = franc(text);
  // Map franc codes to ISO 639-1 if needed
  if (lang === 'und') return 'en';
  return lang;
}

async function lingoTranslate(text: string, targetLang: string): Promise<string> {
  // Replace with actual Lingo.dev API endpoint and key
  const apiKey = process.env.LINGO_API_KEY;
  const response = await fetch('https://api.lingo.dev/translate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ text, targetLang }),
  });
  const data = await response.json();
  return data.translatedText || text;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers for local dev
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Filename,X-DocId');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
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

    // Parse request
    const parsed = (await safeParseJson(req)) ?? (req.body as { query?: string; docId?: string; conversationId?: string; context?: string; translate?: { text: string; targetLang: string } } | undefined);
    const query = parsed?.query;
    let docId = parsed?.docId;
    let conversationId = parsed?.conversationId;
    // Normalize docId to string if array or stringified array
    if (Array.isArray(docId)) {
      docId = docId.length > 0 ? String(docId[0]) : undefined;
    } else if (typeof docId !== 'string') {
      docId = docId !== undefined && docId !== null ? String(docId) : undefined;
    }
    if (docId && docId.startsWith('[') && docId.endsWith(']')) {
      try {
        const arr = JSON.parse(docId);
        if (Array.isArray(arr) && arr.length > 0) docId = String(arr[0]);
      } catch {}
    }

    // Translation is disabled
    // if (translate && translate.text && translate.targetLang) {
    //   const translated = await lingoTranslate(translate.text, translate.targetLang);
    //   return res.status(200).json({ translated });
    // }

    if (!query) {
      return res.status(400).json({ error: 'Missing query' });
    }

    // Detect input language (optional, but translation is disabled)
    // const inputLang = await detectLanguage(query);

    // Run RAG pipeline
    const { answer, chunks } = await runRAG(query, 5, docId, []);

    // No translation of answer
    let finalAnswer = answer;

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
        content: finalAnswer
      });
    }

    return res.status(200).json({ answer: finalAnswer, chunks });
  } catch (err: any) {
    console.error('api/converse error:', err);
    return res.status(500).json({ error: err?.message ?? 'Internal Server Error' });
  }
}
