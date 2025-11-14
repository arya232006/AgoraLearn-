import type { VercelRequest, VercelResponse } from '@vercel/node';
import Busboy from 'busboy';
import mammoth from 'mammoth';
import { randomUUID } from 'crypto';
import { chunkText } from '../lib/chunk';
import { embedText } from '../lib/embeddings';
import { supabase } from '../lib/supabase';

const MAX_TEXT_LENGTH = 500_000;
const MIN_CHUNK_LENGTH = 100;

function normalizeEmbedding(raw: unknown): number[] {
  if (Array.isArray(raw)) {
    if (raw.length === 0) return [];
    if (Array.isArray(raw[0])) {
      const first = raw[0] as unknown;
      if (Array.isArray(first)) return (first as unknown[]).map(Number);
    }
    if (typeof raw[0] === 'number') return (raw as unknown[]).map(Number);
  }
  if (raw && typeof raw === 'object' && 'embedding' in (raw as any)) {
    const emb = (raw as any).embedding;
    if (Array.isArray(emb)) return emb.map(Number);
  }
  throw new Error('Unexpected embedding format');
}

function isNoisyChunk(text: string): boolean {
  if (!text) return true;
  const trimmed = text.trim();
  if (trimmed.length < MIN_CHUNK_LENGTH) return true;
  const letters = (trimmed.match(/[A-Za-z]/g) ?? []).length;
  if (letters === 0) return true;
  const letterRatio = letters / trimmed.length;
  if (letterRatio < 0.6) return true;
  return false;
}

function guessMimeFromFilename(filename: string) {
  const lower = (filename || '').toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.bmp')) return 'image/bmp';
  if (lower.endsWith('.tif') || lower.endsWith('.tiff')) return 'image/tiff';
  if (lower.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  return 'application/octet-stream';
}

function stripHtml(html: string): string {
  const withoutScripts = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
                             .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ');
  const withoutTags = withoutScripts.replace(/<[^>]+>/g, ' ');
  return withoutTags.replace(/\s+/g, ' ').trim();
}

function parseMultipart(req: VercelRequest): Promise<{ fileBuffer?: Buffer; filename?: string; mimeType?: string; fields: Record<string,string> }> {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: req.headers as any });
    const fields: Record<string,string> = {};
    let fileBuffer: Buffer | undefined;
    let filename: string | undefined;
    let mimeType: string | undefined;

    busboy.on('file', (_fieldname, file, info) => {
      filename = info.filename;
      mimeType = info.mimeType || info.mime || '';
      const chunks: Buffer[] = [];
      file.on('data', (d: Buffer) => chunks.push(d));
      file.on('end', () => { fileBuffer = Buffer.concat(chunks); });
    });

    busboy.on('field', (name, val) => { fields[name] = String(val); });
    busboy.on('error', (err) => reject(err));
    busboy.on('finish', () => resolve({ fileBuffer, filename, mimeType, fields }));
    req.pipe(busboy as any);
  });
}

async function extractTextFromBuffer(fileBuffer: Buffer, filename: string | undefined, mimeType: string | undefined): Promise<string> {
  const lower = (filename || '').toLowerCase();
  const mt = (mimeType || '').toLowerCase();

  if (lower.endsWith('.docx') || mt === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const result = await mammoth.extractRawText({ buffer: fileBuffer });
    return (result.value || '').replace(/\s+/g, ' ').trim();
  }

  // Images are not supported in this prototype — reject to keep prototype simple.
  if (mt.startsWith('image/') || lower.match(/\.(png|jpe?g|gif|bmp|tiff?)$/)) {
    throw new Error('Images are not supported in this prototype. Please upload a .docx file or provide text/URL.');
  }

  throw new Error('Unsupported file type. Please upload a DOCX or image file.');
}

async function ingestTextAndStore(text: string, providedDocId?: string) {
  if (!text || !text.trim()) throw new Error('No text to ingest');
  if (text.length > MAX_TEXT_LENGTH) throw new Error(`Text too large. Max ${MAX_TEXT_LENGTH} characters allowed.`);
  const docId = providedDocId || randomUUID();
  const chunks = chunkText(text).filter((c) => c && c.trim().length > 0);
  const filtered = chunks.filter((c) => !isNoisyChunk(c));
  if (!filtered.length) throw new Error('All chunks were filtered out as noise');
  const rows = await Promise.all(filtered.map(async (chunk) => {
    const raw = await embedText(chunk);
    const embedding = normalizeEmbedding(raw);
    return { doc_id: docId, text: chunk, embedding };
  }));
  const { error } = await supabase.from('chunks').insert(rows as any);
  if (error) throw error;
  return { docId, chunksInserted: rows.length };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const contentType = String(req.headers['content-type'] || '').toLowerCase();

    // JSON mode
    if (contentType.includes('application/json')) {
      const body = req.body ?? {};
      // text upload
      if (typeof body.text === 'string' && body.text.trim()) {
        const result = await ingestTextAndStore(body.text, body.docId);
        return res.status(200).json({ ok: true, ...result });
      }

      // URL upload
      if (typeof body.url === 'string' && body.url.trim()) {
        const url = body.url.trim();
        const resp = await fetch(url);
        if (!resp.ok) return res.status(400).json({ error: `Failed to fetch URL: ${resp.status}` });
        const html = await resp.text();
        const text = stripHtml(html);
        const result = await ingestTextAndStore(text, body.docId);
        return res.status(200).json({ ok: true, sourceUrl: url, ...result });
      }

      // base64 file upload (docx or image)
      const fileBase64 = body.fileBase64 || body.file || body.data;
      if (fileBase64) {
        const filename: string = body.filename || 'upload.bin';
        const mimeType: string = body.mimeType || guessMimeFromFilename(filename);
        const buf = Buffer.from(String(fileBase64).replace(/^data:[^;]+;base64,/, ''), 'base64');
        const text = await extractTextFromBuffer(buf, filename, mimeType);
        const result = await ingestTextAndStore(text, body.docId);
        return res.status(200).json({ ok: true, filename, ...result });
      }

      return res.status(400).json({ error: 'Missing action in JSON body (text | url | fileBase64)' });
    }

    // multipart/form-data mode
    if (contentType.includes('multipart/form-data')) {
      const parsed = await parseMultipart(req);
      const fields = parsed.fields || {};
      // text field
      if (typeof fields.text === 'string' && fields.text.trim()) {
        const result = await ingestTextAndStore(fields.text, fields.docId);
        return res.status(200).json({ ok: true, ...result });
      }

      // url field
      if (typeof fields.url === 'string' && fields.url.trim()) {
        const url = fields.url.trim();
        const resp = await fetch(url);
        if (!resp.ok) return res.status(400).json({ error: `Failed to fetch URL: ${resp.status}` });
        const html = await resp.text();
        const text = stripHtml(html);
        const result = await ingestTextAndStore(text, fields.docId);
        return res.status(200).json({ ok: true, sourceUrl: url, ...result });
      }

      // file upload
      if (parsed.fileBuffer) {
        const filename = parsed.filename || 'upload.bin';
        const mimeType = parsed.mimeType || guessMimeFromFilename(filename);
        const text = await extractTextFromBuffer(parsed.fileBuffer, filename, mimeType);
        const result = await ingestTextAndStore(text, fields.docId);
        return res.status(200).json({ ok: true, filename, ...result });
      }

      return res.status(400).json({ error: 'No file or actionable fields found in multipart body' });
    }

    return res.status(400).json({ error: 'Unsupported Content-Type. Send JSON or multipart/form-data' });
  } catch (err: any) {
    console.error('api/upload consolidated error:', err);
    return res.status(400).json({ error: err?.message || 'Failed to process upload' });
  }
}

