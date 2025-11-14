import { VercelRequest, VercelResponse } from '@vercel/node';
import { createAgoraSession } from '../../lib/agora';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const session = await createAgoraSession();
    return res.status(200).json({ token: session.token, uid: session.uid, channelName: session.channel });
  } catch (err: any) {
    console.error('api/voice/start error:', err);
    return res.status(500).json({ error: err?.message ?? 'Internal Server Error' });
  }
}
