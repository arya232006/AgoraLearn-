# AgoraLearn Backend

This repository contains a Vercel + TypeScript backend for a RAG + Voice demo using:

- Supabase with pgvector
- Hugging Face embeddings (all-MiniLM-L6-v2)
- Groq LLaMA-3.1-8B-Instant for generation
- Agora Conversational AI for STT and TTS

See `.env.example` for required environment variables.

Vercel Deployment Protection
----------------------------

If your Vercel project has Deployment Protection enabled, automated POSTs to your `api` endpoints will receive a Vercel auth page (401) unless you provide a protection bypass token. You can:

- Disable Deployment Protection in the Vercel project settings (less secure).
- Create a Protection Bypass Token in Vercel and use it in your upload scripts.

Usage with scripts
------------------

Set the token in an environment variable named `VERCEL_BYPASS_TOKEN` or pass it as an extra CLI argument to the upload scripts. The scripts will append the required query parameters automatically.

Example (PowerShell) — `.docx` upload using the `upload-docx` script:

```
$env:VERCEL_BYPASS_TOKEN = 'your-token-here'
node .\scripts\upload-docx.js 'C:\path\to\notes.docx' my-doc-id
Remove-Item Env:\VERCEL_BYPASS_TOKEN
```

Or pass token as CLI arg (last parameter):

```
node .\scripts\upload-docx.js 'C:\path\to\notes.docx' my-doc-id 'your-token-here'
```

Supported uploads (prototype)
-----------------------------

- Plain text (JSON): POST `{ "text": "...", "docId": "optional" }` to `/api/upload`
- URL: POST `{ "url": "https://...", "docId": "optional" }` to `/api/upload` (server will fetch and extract text)
- Microsoft Word `.docx`: use `scripts/upload-docx.js` or multipart file upload to `/api/upload`

Not supported in this prototype: PDF files and image OCR. Those features are planned for a later rollout.

Supabase schema (run in your DB):

```sql
create extension if not exists vector;

create table chunks (
  id uuid primary key default gen_random_uuid(),
  doc_id text,
  text text,
  embedding vector(384),
  created_at timestamptz default now()
);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  user_id text,
  amount numeric,
  category text,
  created_at timestamptz default now()
);

-- helper function for pgvector similarity
create or replace function match_chunks(
  query_embedding vector(384),
  match_count int,
  doc_filter text default null
)
returns table(id uuid, doc_id text, text text, embedding vector(384), created_at timestamptz, distance float)
language sql as $$
  select id, doc_id, text, embedding, created_at, (embedding <-> query_embedding) as distance
  from chunks
  where doc_filter is null or doc_id = doc_filter
  order by distance
  limit match_count;
$$;
```
