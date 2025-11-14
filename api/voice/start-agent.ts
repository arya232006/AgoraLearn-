import { VercelRequest, VercelResponse } from '@vercel/node';
import { startAgoraAgent } from '../lib/agora';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const body = req.body || {};

    // Call helper to start agent. Body may include agent config (llm, tts, asr, etc.)
    const result = await startAgoraAgent(body);
    return res.status(200).json(result);
  } catch (err: any) {
    console.error('api/voice/start-agent error:', err);
    return res.status(500).json({ error: err?.message ?? 'Internal Server Error' });
  }
}
