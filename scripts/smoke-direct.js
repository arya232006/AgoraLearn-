let fetch = global.fetch;
const fs = require('fs');
// fallback to node-fetch when running in older Node or CommonJS environment
if (!fetch) {
  try {
    // node-fetch v3 is ESM; when required in CJS it may be under .default
    const nf = require('node-fetch');
    fetch = nf && nf.default ? nf.default : nf;
  } catch (e) {
    // leave fetch undefined; caller will report error
  }
}

// Try to load local .env file if present (simple parser)
try {
  const envPath = './.env';
  if (require('fs').existsSync(envPath)) {
    const raw = require('fs').readFileSync(envPath, 'utf8');
    raw.split(/\r?\n/).forEach(line => {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) {
        const key = m[1];
        let val = m[2] || '';
        // strip surrounding quotes
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) process.env[key] = val;
      }
    });
  }
} catch (e) {
  // ignore
}

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
    const uid = Math.floor(Math.random()*1e9).toString();
    const channel = `smoke_${Math.random().toString(36).slice(2,8)}`;
    const expireTs = Math.floor(Date.now()/1000) + 4*60*60;
    const token = buildRtcToken(APP_ID, APP_CERT, channel, uid, expireTs);
    console.log('Generated token, uid, channel:', { token: token.slice(0,20)+'...', uid, channel });

    // Call Agora TTS
    console.log('Calling Agora TTS...');
    // Use explicit AGORA_TTS_URL or compose speak URL from APP_ID + AGENT_ID
    let ttsUrl = process.env.AGORA_TTS_URL;
    if (!ttsUrl) {
      const appId = process.env.AGORA_APP_ID;
      const agentId = process.env.AGORA_AGENT_ID;
      if (!appId || !agentId) {
        console.error('AGORA_TTS_URL not set and AGORA_APP_ID/AGORA_AGENT_ID missing; cannot call speak');
      }
      ttsUrl = `https://api.agora.io/api/conversational-ai-agent/v2/projects/${appId}/agents/${agentId}/speak`;
    }
    const b64 = Buffer.from(`${CUSTOMER_ID}:${CUSTOMER_SECRET}`).toString('base64');
    const ttsRes = await fetch(ttsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-agora-customer-id': CUSTOMER_ID,
        'x-agora-customer-secret': CUSTOMER_SECRET,
        Authorization: `Basic ${b64}`
      },
      body: JSON.stringify({ text: 'Hello from AgoraLearn (smoke test)', priority: 'INTERRUPT', interruptable: false })
    });
    if (!ttsRes.ok) {
      const t = await ttsRes.text();
      console.error('TTS failed:', ttsRes.status, t);
    } else {
      const arrayBuffer = await ttsRes.arrayBuffer();
      const buf = Buffer.from(arrayBuffer);
      console.log('TTS returned', buf.length, 'bytes');
      try { fs.writeFileSync('./.smoke_tts.wav', buf); console.log('Wrote ./.smoke_tts.wav'); } catch(e){console.warn('Write failed',e)}
    }

    // Optional STT: skipped unless SAMPLE_BASE64 env provided
    const SAMPLE_BASE64 = process.env.SMOKE_SAMPLE_BASE64 || '';
    if (SAMPLE_BASE64) {
      console.log('Calling Agora STT with SAMPLE_BASE64...');
      const sttUrl = process.env.AGORA_STT_URL || 'https://api.agora.io/v1/conversation/stt';
      const sttRes = await fetch(sttUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'x-agora-customer-id': CUSTOMER_ID,
          'x-agora-customer-secret': CUSTOMER_SECRET
        },
        body: Buffer.from(SAMPLE_BASE64, 'base64')
      });
      if (!sttRes.ok) {
        console.error('STT failed:', sttRes.status, await sttRes.text());
      } else {
        const j = await sttRes.json();
        console.log('STT response:', j);
      }
    } else {
      console.log('No SAMPLE_BASE64 provided; skipping STT test.');
    }

    process.exit(0);
  } catch (err) {
    console.error('Smoke direct error:', err);
    process.exit(2);
  }
})();
