import { VercelRequest, VercelResponse } from '@vercel/node';
import { agoraTTS } from '../../lib/agora';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const body = req.body ?? {};
    const text = typeof body.text === 'string' ? body.text : undefined;
    if (!text) return res.status(400).json({ error: 'Missing required field: text' });

    try {
      const result = await agoraTTS(text);
      const audioBuffer = result.buffer;
      const contentType = result.contentType || 'audio/wav';
      return res.status(200).json({ audioBase64: audioBuffer.toString('base64'), contentType });
    } catch (err: any) {
      console.error('Upstream Agora TTS error:', err);
      return res.status(502).json({ error: 'Upstream TTS error', details: err?.message ?? String(err) });
    }
  } catch (err: any) {
    console.error('api/voice/tts error:', err);
    return res.status(500).json({ error: err?.message ?? 'Internal Server Error' });
  }
}
