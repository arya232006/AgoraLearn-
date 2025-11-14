import { VercelRequest, VercelResponse } from '@vercel/node';
import { agoraSTT, agoraTTS } from '../../lib/agora';
import { runRAG } from '../../lib/rag';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const body = req.body ?? {};
    const audioBase64 = typeof body.audioBase64 === 'string' ? body.audioBase64 : undefined;
    if (!audioBase64) return res.status(400).json({ error: 'Missing audioBase64' });
    const audioBuffer = Buffer.from(audioBase64, 'base64');

    try {
      const transcript = await agoraSTT(audioBuffer);
      const { answer } = await runRAG(transcript);
      const ttsResult = await agoraTTS(answer);
      return res.status(200).json({ textAnswer: answer, audioBase64: ttsResult.buffer.toString('base64'), contentType: ttsResult.contentType });
    } catch (err: any) {
      console.error('api/voice/converse upstream error:', err);
      return res.status(502).json({ error: 'Upstream error', details: err?.message ?? String(err) });
    }
  } catch (err: any) {
    console.error('api/voice/converse error:', err);
    return res.status(500).json({ error: err?.message ?? 'Internal Server Error' });
  }
}
