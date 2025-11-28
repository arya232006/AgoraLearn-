import type { VercelRequest, VercelResponse } from '@vercel/node';
import { runRAG } from '../lib/rag';
import formidable from 'formidable';
import fs from 'fs';
import fetch from 'node-fetch';
import FormData from 'form-data';

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
      // Use your existing chunking and RAG logic
      const answerObj = await runRAG(question, fields.docId);
      console.log('RAG answer:', answerObj);
      return res.status(200).json({ question, answer: answerObj?.answer, debug: { question, answerObj } });
    } catch (e) {
      console.error('Voice query error:', e);
      return res.status(500).json({ error: 'Failed to process audio', details: typeof e === 'object' && e !== null && 'message' in e ? (e as any).message : String(e) });
    }
  });
}
