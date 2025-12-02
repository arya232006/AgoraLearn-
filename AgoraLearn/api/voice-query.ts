const detectLanguage = require('./detect-language');
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { runRAG } from '../lib/rag';
import formidable from 'formidable';
import fs from 'fs';
import fetch from 'node-fetch';
import FormData from 'form-data';
const { LingoDotDevEngine } = require('@lingo.dev/_sdk');
const lingo = new LingoDotDevEngine({ apiKey: process.env.LINGO_API_KEY });

export const config = {
  api: {
    bodyParser: false,
  },
};

async function transcribeAudio(filePath: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  const formData = new FormData();
  formData.append('file', fs.createReadStream(filePath), { filename: 'audio.webm' });
  formData.append('model', 'whisper-1');
  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
    body: formData as any,
  });
  const data = await response.json();
  return data.text || '';
}

async function translateLingo(text, source, target, context) {
  if (source === target) return text;
  // Use context-aware translation if available
  const result = await lingo._localizeRaw(context ? { text, context } : { text }, { sourceLocale: source, targetLocale: target });
  return result?.text || '';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const form = formidable({ multiples: false });
  form.parse(req, async (err, fields, files) => {
    if (err || !files.audio) {
      return res.status(400).json({ error: 'Audio file required' });
    }
    const audioFile = Array.isArray(files.audio) ? files.audio[0] : files.audio;
    const filePath = audioFile.filepath || audioFile.path;
    try {
      const question = await transcribeAudio(filePath);
      console.log('Transcribed question:', question);
      // Detect language of transcribed question
      const detectedLang = detectLanguage(question);
      console.log('Detected language:', detectedLang);
      // Translate to English if needed
      let queryInEnglish = question;
      if (detectedLang !== 'en') {
        queryInEnglish = await translateLingo(question, detectedLang, 'en', null);
      }
      // Ensure docId is a string, not array
      let docId = fields.docId;
      // Normalize docId to string if array or other type
      if (Array.isArray(docId)) {
        docId = docId.length > 0 ? String(docId[0]) : undefined;
      } else if (typeof docId !== 'string') {
        docId = docId !== undefined && docId !== null ? String(docId) : undefined;
      }
      if (docId && docId.startsWith('[') && docId.endsWith(']')) {
        // If docId is a stringified array, parse and use first element
        try {
          const arr = JSON.parse(docId);
          if (Array.isArray(arr) && arr.length > 0) docId = String(arr[0]);
        } catch {}
      }
      console.log('[VOICE-QUERY DEBUG] Final docId before runRAG:', docId);
      // runRAG expects: query, topK, docId
      const answerObj = await runRAG(queryInEnglish, 10, docId);
      console.log('RAG answer:', answerObj);
      // Translate answer back to user's language with context
      let answerInUserLang = answerObj?.answer;
      if (detectedLang !== 'en' && answerInUserLang) {
        answerInUserLang = await translateLingo(answerObj.answer, 'en', detectedLang, queryInEnglish);
      }
      // Always return answer in user's language
      return res.status(200).json({ question, answer: answerInUserLang, debug: { question, answerObj, detectedLang } });
    } catch (e) {
      console.error('Voice query error:', e);
      return res.status(500).json({ error: 'Failed to process audio', details: typeof e === 'object' && e !== null && 'message' in e ? (e as any).message : String(e) });
    }
  });
}