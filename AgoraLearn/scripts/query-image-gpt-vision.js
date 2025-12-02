#!/usr/bin/env node
// Usage: node scripts/query-image-gpt-vision.js <path-to-image>
// Loads OPENAI_API_KEY from .env and calls the OpenAI Responses API with a data URL image.

const fs = require('fs');
const path = require('path');

// Lightweight .env loader (no external dependency) - reads key=value pairs
function loadDotEnv(envPath) {
  try {
    const txt = fs.readFileSync(envPath, 'utf8');
    const lines = txt.split(/\r?\n/);
    const out = {};
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const k = trimmed.slice(0, eq).trim();
      let v = trimmed.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      out[k] = v;
    }
    return out;
  } catch (e) {
    return {};
  }
}

const localEnv = loadDotEnv(path.resolve(__dirname, '..', '.env'));
for (const k of Object.keys(localEnv)) if (!(k in process.env)) process.env[k] = localEnv[k];

const OPENAI_RESPONSES_ENDPOINT = 'https://api.openai.com/v1/responses';

async function run(filePath) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    console.error('Missing OPENAI_API_KEY in .env');
    process.exit(2);
  }

  const envModel = process.env.OPENAI_VISION_MODEL;
  const candidateModels = [];
  if (envModel) candidateModels.push(envModel);
  candidateModels.push('gpt-4o-mini-vision-preview');
  candidateModels.push('gpt-4o-mini-vision');
  candidateModels.push('gpt-4o-mini');
  const timeoutMs = Number(process.env.OPENAI_REQUEST_TIMEOUT_MS || process.env.OPENAI_TIMEOUT_MS || 60000);

  const mime = (() => {
    const l = filePath.toLowerCase();
    if (l.endsWith('.png')) return 'image/png';
    if (l.endsWith('.jpg') || l.endsWith('.jpeg')) return 'image/jpeg';
    if (l.endsWith('.gif')) return 'image/gif';
    if (l.endsWith('.bmp')) return 'image/bmp';
    if (l.endsWith('.tiff') || l.endsWith('.tif')) return 'image/tiff';
    return 'application/octet-stream';
  })();

  const buf = fs.readFileSync(filePath);
  const base64 = buf.toString('base64');
  const dataUrl = `data:${mime};base64,${base64}`;

  // Try candidate models in order until one works or all fail with model_not_found
  for (const model of candidateModels) {
    const body = {
      model,
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: 'Extract all readable text from the provided image. Return only the extracted plain text.' },
            { type: 'input_image', image_url: dataUrl }
          ]
        }
      ]
    };

    console.log('Trying GPT Vision model:', model);

    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(OPENAI_RESPONSES_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body),
        signal: ac.signal
      });
      clearTimeout(to);

      const txt = await res.text();
      let json;
      try { json = JSON.parse(txt); } catch (e) { json = txt; }

      console.log('HTTP status:', res.status);
      console.log('Raw response (first 500 chars):', typeof txt === 'string' ? txt.slice(0, 500) : JSON.stringify(json).slice(0, 500));

      if (res.ok) {
        if (typeof json?.output_text === 'string') {
          console.log('\nExtracted text:\n', json.output_text);
          return;
        } else if (Array.isArray(json?.output) && json.output[0]) {
          const out = json.output[0];
          if (typeof out?.content === 'string') { console.log('\nExtracted text:\n', out.content); return; }
          if (Array.isArray(out?.content)) { console.log('\nExtracted text:\n', out.content.map(c => c.text || '').join('\n')); return; }
        }
        console.log('\nResponse ok but no extracted text was found.');
        return;
      } else {
        // If model not found, try next candidate; otherwise exit with error
        if (json && json.error && json.error.code === 'model_not_found') {
          console.warn('Model not found:', model, '; trying next candidate');
          continue;
        }
        console.error('API error:', typeof json === 'string' ? json : JSON.stringify(json, null, 2));
        process.exit(3);
      }
    } catch (err) {
      clearTimeout(to);
      if (err.name === 'AbortError') {
        console.error('Request timed out after', timeoutMs, 'ms for model', model);
        // on timeout, stop trying further models
        process.exit(4);
      }
      console.error('Fetch error for model', model, err);
      process.exit(4);
    }
  }

  console.error('No candidate GPT Vision models succeeded. Please set OPENAI_VISION_MODEL in .env to a valid model.');
  process.exit(5);
}

if (require.main === module) {
  const p = process.argv[2];
  if (!p) {
    console.error('Usage: node scripts/query-image-gpt-vision.js <path-to-image>');
    process.exit(1);
  }
  run(p).catch((e) => { console.error(e); process.exit(5); });
}
