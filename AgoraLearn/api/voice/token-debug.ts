import { VercelRequest, VercelResponse } from '@vercel/node';
import { createAgoraSession } from '../../lib/agora';

/**
 * Server-only debug endpoint to generate an Agora RTC token and
 * return a decoded view of its payload. DOES NOT expose the app certificate.
 *
 * GET /api/voice/token-debug
 *
 * Response:
 * { token, decoded: { version, appId, channel, uid, salt, expireTs, privileges } }
 */

function readUint16LE(buf: Buffer, offset: number) {
  return buf.readUInt16LE(offset);
}
function readUint32LE(buf: Buffer, offset: number) {
  return buf.readUInt32LE(offset);
}

function decodeToken(token: string) {
  // Token format produced by our builder: <version(3)><appId><base64(payload)>
  const version = token.slice(0, 3);
  const envAppId = process.env.AGORA_APP_ID;
  if (!envAppId) throw new Error('AGORA_APP_ID not set in environment');

  const prefixAppId = token.slice(3, 3 + envAppId.length);
  if (prefixAppId !== envAppId) {
    throw new Error('Token appId does not match server AGORA_APP_ID');
  }

  const encoded = token.slice(3 + envAppId.length);
  const content = Buffer.from(encoded, 'base64');

  // First 32 bytes = HMAC-SHA256 signature; remaining = body
  if (content.length <= 32) throw new Error('Token payload too short');
  const body = content.slice(32);

  let offset = 0;
  // read packed string (uint16 len + bytes)
  const readPackedString = () => {
    const len = readUint16LE(body, offset);
    offset += 2;
    const str = body.slice(offset, offset + len).toString('utf8');
    offset += len;
    return str;
  };

  const appId = readPackedString();
  const channel = readPackedString();
  const uid = readPackedString();

  const salt = readUint32LE(body, offset);
  offset += 4;

  const expireTs = readUint32LE(body, offset);
  offset += 4;

  // privileges: first read count (uint16), then repeated (uint16 key + uint32 value)
  const privCount = readUint16LE(body, offset);
  offset += 2;
  const privileges: Record<string, number> = {};
  for (let i = 0; i < privCount; i++) {
    const key = readUint16LE(body, offset);
    offset += 2;
    const value = readUint32LE(body, offset);
    offset += 4;
    privileges[String(key)] = value;
  }

  return {
    version,
    appId,
    channel,
    uid,
    salt,
    expireTs,
    privileges
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const session = await createAgoraSession();
    const { token } = session;

    // Decode payload for server-side testing only
    const decoded = decodeToken(token);

    return res.status(200).json({ token, decoded });
  } catch (err: any) {
    console.error('token-debug error:', err);
    return res.status(500).json({ error: err?.message ?? 'Internal Server Error' });
  }
}
