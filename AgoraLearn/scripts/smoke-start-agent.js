let fetch = global.fetch;
const fs = require('fs');
// fallback to node-fetch when running in older Node or CommonJS environment
if (!fetch) {
  try {
    const nf = require('node-fetch');
    fetch = nf && nf.default ? nf.default : nf;
  } catch (e) {
    // leave fetch undefined; caller will report error
  }
}

// Load simple .env if present
try {
  const envPath = './.env';
  if (fs.existsSync(envPath)) {
    const raw = fs.readFileSync(envPath, 'utf8');
    raw.split(/\r?\n/).forEach(line => {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) {
        const key = m[1];
        let val = m[2] || '';
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) process.env[key] = val;
      }
    });
  }
} catch (e) {}

const APP_ID = process.env.AGORA_APP_ID;
const APP_CERT = process.env.AGORA_APP_CERTIFICATE;
const CUSTOMER_ID = process.env.AGORA_CUSTOMER_ID;
const CUSTOMER_SECRET = process.env.AGORA_CUSTOMER_SECRET;

if (!APP_ID || !APP_CERT) {
  console.error('AGORA_APP_ID or AGORA_APP_CERTIFICATE missing in env');
  process.exit(1);
}
if (!CUSTOMER_ID || !CUSTOMER_SECRET) {
  console.error('AGORA_CUSTOMER_ID or AGORA_CUSTOMER_SECRET missing in env');
  process.exit(1);
}

function writeUint16LE(n) { const b = Buffer.allocUnsafe(2); b.writeUInt16LE(n,0); return b; }
function writeUint32LE(n) { const b = Buffer.allocUnsafe(4); b.writeUInt32LE(n,0); return b; }
function packString(buf) { return Buffer.concat([writeUint16LE(buf.length), buf]); }

function buildRtcToken(appId, appCertificate, channelName, uid, expireTimestamp) {
  const version = '006';
  const privileges = {};
  privileges[1] = expireTimestamp;
  const salt = Math.floor(Math.random() * 0xffffffff) >>> 0;
  const channelBuf = Buffer.from(channelName, 'utf8');
  const uidBuf = Buffer.from(uid, 'utf8');
  const privKeys = Object.keys(privileges).map(k => parseInt(k,10));
  const privEntries = [writeUint16LE(privKeys.length)];
  for (const k of privKeys) {
    privEntries.push(writeUint16LE(k));
    privEntries.push(writeUint32LE(privileges[k]));
  }
  const bodyParts = [
    packString(Buffer.from(appId,'utf8')),
    packString(channelBuf),
    packString(uidBuf),
    writeUint32LE(salt),
    writeUint32LE(expireTimestamp),
    ...privEntries
  ];
  const body = Buffer.concat(bodyParts);
  const crypto = require('crypto');
  const signature = crypto.createHmac('sha256', appCertificate).update(body).digest();
  const content = Buffer.concat([signature, body]);
  const encoded = content.toString('base64');
  return `${version}${appId}${encoded}`;
}

(async function main(){
  try {
    const name = process.env.SMOKE_AGENT_NAME || `smoke_agent_${Math.random().toString(36).slice(2,8)}`;
    const channel = process.env.SMOKE_AGENT_CHANNEL || `smoke_channel_${Math.random().toString(36).slice(2,8)}`;
    const agentUid = (Math.floor(Math.random()*1e9)).toString();
    const ttl = parseInt(process.env.SMOKE_AGENT_TTL || '', 10) || 60*60; // 1 hour default
    const expireTs = Math.floor(Date.now()/1000) + ttl;
    const token = buildRtcToken(APP_ID, APP_CERT, channel, agentUid, expireTs);

    console.log('Starting agent', { name, channel, agentUid, ttl });

    // Allow overriding the entire join body via SMOKE_AGENT_BODY (JSON string)
    let body = null;
    if (process.env.SMOKE_AGENT_BODY) {
      try {
        body = JSON.parse(process.env.SMOKE_AGENT_BODY);
      } catch (e) {
        console.warn('Failed to parse SMOKE_AGENT_BODY as JSON, ignoring override');
      }
    }

    // Default body: use OpenAI-style LLM as configured for Conversational AI.
    if (!body) {
      body = {
        name,
        properties: {
          channel,
          token,
          agent_rtc_uid: agentUid,
          remote_rtc_uids: ['*'],
          idle_timeout: 120,
          llm: {
            // Match Console "LLM Style: OpenAI" and include required fields.
            style: 'openai',
            url: process.env.OPENAI_LLM_URL || 'https://api.openai.com/v1/chat/completions',
            api_key: process.env.OPENAI_API_KEY || '',
            system_messages: [
              { role: 'system', content: 'You are a helpful chatbot.' }
            ],
            params: {
              model: process.env.OPENAI_LLM_MODEL || 'gpt-4o-mini'
            },
            input_modalities: ['text'],
            output_modalities: ['text', 'audio']
          }
        }
      };
    }

    const url = `https://api.agora.io/api/conversational-ai-agent/v2/projects/${APP_ID}/join`;
    const basic = Buffer.from(`${CUSTOMER_ID}:${CUSTOMER_SECRET}`).toString('base64');


    const headers = {
      'Content-Type': 'application/json',
      'x-agora-customer-id': CUSTOMER_ID,
      'x-agora-customer-secret': CUSTOMER_SECRET,
      Authorization: `Basic ${basic}`
    };

    if (process.env.DEBUG_SMOKE_AGENT) {
      console.log('DEBUG: Agora /join URL =>', url);
      console.log('DEBUG: Request headers =>', JSON.stringify(headers, null, 2));
      try { console.log('DEBUG: Request body =>', JSON.stringify(body, null, 2)); } catch (e) { console.log('DEBUG: Request body (unserializable)'); }
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    const rawText = await res.text();

    if (process.env.DEBUG_SMOKE_AGENT) {
      console.log('DEBUG: Response status =>', res.status);
      console.log('DEBUG: Response headers =>', JSON.stringify(Object.fromEntries(res.headers.entries()), null, 2));
      console.log('DEBUG: Response body =>', rawText);
    }

    if (!res.ok) {
      console.error('Agent start failed:', res.status, rawText);
      process.exit(2);
    }

    let json;
    try { json = JSON.parse(rawText); } catch(e){ json = { raw: rawText }; }

    console.log('Agent started:', json);
    try { fs.writeFileSync('./.smoke_agent.json', JSON.stringify(json, null, 2)); console.log('Wrote ./.smoke_agent.json'); } catch(e){ console.warn('Write failed', e); }

    process.exit(0);
  } catch (err) {
    console.error('smoke-start-agent error:', err);
    process.exit(3);
  }
})();
