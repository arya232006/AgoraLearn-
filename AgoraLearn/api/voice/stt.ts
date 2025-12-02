import { VercelRequest, VercelResponse } from '@vercel/node';
import { agoraSTT } from '../../lib/agora';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const body = req.body ?? {};
    const audioBase64 = typeof body.audioBase64 === 'string' ? body.audioBase64 : undefined;
    if (!audioBase64) return res.status(400).json({ error: 'Missing audioBase64 in request body' });

    let audioBuffer: Buffer;
    try {
      audioBuffer = Buffer.from(audioBase64, 'base64');
    } catch (e: any) {
      return res.status(400).json({ error: 'Invalid base64 audio' });
    }

    try {
      const transcript = await agoraSTT(audioBuffer);
      return res.status(200).json({ transcript });
    } catch (err: any) {
      console.error('Upstream Agora STT error:', err);
      return res.status(502).json({ error: 'Upstream STT error', details: err?.message ?? String(err) });
    }
  } catch (err: any) {
    console.error('api/voice/stt error:', err);
    return res.status(500).json({ error: err?.message ?? 'Internal Server Error' });
  }
}
