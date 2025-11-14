import crypto from 'crypto';

const APP_ID = process.env.AGORA_APP_ID as string;
const APP_CERT = process.env.AGORA_APP_CERTIFICATE as string;
const CUSTOMER_ID = process.env.AGORA_CUSTOMER_ID as string;
const CUSTOMER_SECRET = process.env.AGORA_CUSTOMER_SECRET as string;
const AGORA_AGENT_ID = process.env.AGORA_AGENT_ID as string | undefined;

if (!APP_ID || !APP_CERT) {
  // Token generation requires these env vars
}

export async function agoraSTT(audioBuffer: Buffer): Promise<string> {
  if (!CUSTOMER_ID || !CUSTOMER_SECRET) throw new Error('Missing Agora customer credentials');
  const url = process.env.AGORA_STT_URL ?? 'https://api.agora.io/v1/conversation/stt';
  console.debug('agoraSTT: POST', url, 'bytes=', audioBuffer.length);
  // prepare Basic auth header
  const basic = Buffer.from(`${CUSTOMER_ID}:${CUSTOMER_SECRET}`).toString('base64');
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'x-agora-customer-id': CUSTOMER_ID,
      'x-agora-customer-secret': CUSTOMER_SECRET,
      Authorization: `Basic ${basic}`
    },
    body: audioBuffer as any
  });

  const status = res.status;
  const text = await res.text();
  console.debug('agoraSTT response status=', status, 'body=', text);

  if (!res.ok) {
    throw new Error(`Agora STT error: ${status} ${text}`);
  }

  try {
    const json = JSON.parse(text);
    return json.transcript ?? json.text ?? JSON.stringify(json);
  } catch (e) {
    return text;
  }
}

export async function agoraTTS(text: string, opts?: { priority?: string; interruptable?: boolean }): Promise<{ buffer: Buffer; contentType: string }> {
  if (!CUSTOMER_ID || !CUSTOMER_SECRET) throw new Error('Missing Agora customer credentials');
  // Compose speak URL if not provided explicitly
  let url = process.env.AGORA_TTS_URL;
  if (!url) {
    if (!APP_ID) throw new Error('AGORA_APP_ID required to compose speak URL');
    if (!AGORA_AGENT_ID && !process.env.AGORA_AGENT_ID) throw new Error('AGORA_AGENT_ID required to compose speak URL');
    const agentId = AGORA_AGENT_ID ?? process.env.AGORA_AGENT_ID!;
    url = `https://api.agora.io/api/conversational-ai-agent/v2/projects/${APP_ID}/agents/${agentId}/speak`;
  }
  console.debug('agoraTTS: POST', url, 'textLen=', text.length);
  const basic = Buffer.from(`${CUSTOMER_ID}:${CUSTOMER_SECRET}`).toString('base64');

  const body: any = { text };
  if (opts?.priority) body.priority = opts.priority;
  if (typeof opts?.interruptable === 'boolean') body.interruptable = opts.interruptable;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-agora-customer-id': CUSTOMER_ID,
      'x-agora-customer-secret': CUSTOMER_SECRET,
      Authorization: `Basic ${basic}`
    },
    body: JSON.stringify(body)
  });

  const status = res.status;
  const contentType = res.headers.get('content-type') || 'application/octet-stream';
  const textResp = await res.text();
  if (!res.ok) {
    console.debug('agoraTTS error response:', status, textResp);
    throw new Error(`Agora TTS error: ${status} ${textResp}`);
  }

  // The speak endpoint returns empty body on success; return empty buffer
  if (!textResp) return { buffer: Buffer.alloc(0), contentType };

  // Otherwise, try to parse as binary base64 or return raw
  try {
    // If it's JSON with a field containing audio, attempt to extract
    const j = JSON.parse(textResp);
    if (j && j.audio) {
      return { buffer: Buffer.from(j.audio, 'base64'), contentType };
    }
  } catch (e) {
    // not JSON
  }

  return { buffer: Buffer.from(textResp), contentType };
}

export async function createAgoraSession(): Promise<{ token: string; uid: number; channel: string }> {
  const uid = Math.floor(Math.random() * 1e9);
  const channel = `agora_${Math.random().toString(36).slice(2, 9)}`;
  if (!APP_ID || !APP_CERT) {
    throw new Error('Missing AGORA_APP_ID or AGORA_APP_CERTIFICATE');
  }
  // 4-hour expiry as requested
  const ttlSeconds = 4 * 60 * 60;
  const expireTs = Math.floor(Date.now() / 1000) + ttlSeconds;

  const token = buildRtcToken(APP_ID, APP_CERT, channel, uid.toString(), expireTs);
  return { token, uid, channel };
}

// Create and start a Conversational AI agent instance by calling the /join endpoint.
export async function startAgoraAgent(opts?: {
  name?: string;
  channel?: string;
  agent_rtc_uid?: string | number;
  remote_rtc_uids?: Array<string | number>;
  idle_timeout?: number;
  llm?: any;
  tts?: any;
  asr?: any;
  advanced_features?: any;
}) {
  if (!CUSTOMER_ID || !CUSTOMER_SECRET) throw new Error('Missing Agora customer credentials');
  if (!APP_ID) throw new Error('Missing AGORA_APP_ID');

  const name = opts?.name ?? `agent_${Math.random().toString(36).slice(2, 9)}`;
  const channel = opts?.channel ?? `agent_channel_${Math.random().toString(36).slice(2, 9)}`;
  const agentUid = (opts?.agent_rtc_uid ?? Math.floor(Math.random() * 1e9)).toString();

  // Build an rtc token for the agent to join using the same internal token builder
  // Use a short TTL for agent join (e.g., 1 hour)
  const ttlSeconds = 60 * 60;
  const expireTs = Math.floor(Date.now() / 1000) + ttlSeconds;
  const agentToken = buildRtcToken(APP_ID, APP_CERT, channel, agentUid, expireTs);

  const body: any = {
    name,
    properties: {
      channel,
      token: agentToken,
      agent_rtc_uid: agentUid,
      remote_rtc_uids: opts?.remote_rtc_uids ?? ['*'],
      idle_timeout: typeof opts?.idle_timeout === 'number' ? opts!.idle_timeout : 120,
      advanced_features: opts?.advanced_features ?? { enable_aivad: false },
      llm: opts?.llm,
      tts: opts?.tts,
      asr: opts?.asr
    }
  };

  const url = `https://api.agora.io/api/conversational-ai-agent/v2/projects/${APP_ID}/join`;
  const basic = Buffer.from(`${CUSTOMER_ID}:${CUSTOMER_SECRET}`).toString('base64');

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-agora-customer-id': CUSTOMER_ID,
      'x-agora-customer-secret': CUSTOMER_SECRET,
      Authorization: `Basic ${basic}`
    },
    body: JSON.stringify(body)
  });

  const text = await res.text();
  if (!res.ok) {
    let err = `startAgoraAgent failed: ${res.status} ${text}`;
    try {
      const j = JSON.parse(text);
      err = `${res.status} ${JSON.stringify(j)}`;
    } catch (e) {}
    throw new Error(err);
  }

  try {
    const json = JSON.parse(text);
    return json;
  } catch (e) {
    return { raw: text };
  }
}

// Internal RTC token builder (compatible with Agora AccessToken format)
function buildRtcToken(appId: string, appCertificate: string, channelName: string, uid: string, expireTimestamp: number) {
  // Version prefix used by Agora tokens
  const version = '006';

  // Privilege map: only allow join channel; other privileges can be added if needed
  const privileges: { [k: number]: number } = {};
  // kJoinChannel = 1 (common convention)
  privileges[1] = expireTimestamp;

  // Generate salt (32-bit unsigned)
  const salt = Math.floor(Math.random() * 0xffffffff) >>> 0;

  // Serialize the body
  const channelBuf = Buffer.from(channelName, 'utf8');
  const uidBuf = Buffer.from(uid, 'utf8');

  // helper to write uint16/32 little-endian
  const writeUint16LE = (n: number) => { const b = Buffer.allocUnsafe(2); b.writeUInt16LE(n, 0); return b; };
  const writeUint32LE = (n: number) => { const b = Buffer.allocUnsafe(4); b.writeUInt32LE(n, 0); return b; };

  // pack string with length prefix (uint16)
  const packString = (buf: Buffer) => Buffer.concat([writeUint16LE(buf.length), buf]);

  // pack privileges: map length (uint16) then repeated (uint16 key + uint32 value)
  const privEntries: Buffer[] = [];
  const privKeys = Object.keys(privileges).map(k => parseInt(k, 10));
  privEntries.push(writeUint16LE(privKeys.length));
  for (const k of privKeys) {
    privEntries.push(writeUint16LE(k));
    privEntries.push(writeUint32LE(privileges[k]));
  }

  const bodyParts = [
    packString(Buffer.from(appId, 'utf8')),
    packString(channelBuf),
    packString(uidBuf),
    writeUint32LE(salt),
    writeUint32LE(expireTimestamp),
    ...privEntries
  ];

  const body = Buffer.concat(bodyParts);

  // signature = HMAC-SHA256(appCertificate, body)
  const signature = crypto.createHmac('sha256', appCertificate).update(body).digest();

  const content = Buffer.concat([signature, body]);
  const encoded = content.toString('base64');

  return `${version}${appId}${encoded}`;
}
