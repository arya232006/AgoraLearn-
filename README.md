
# AgoraLearn Backend & Chrome Extension

This repository contains:
- A Vercel + TypeScript backend for a RAG + Voice demo
- A Chrome extension that lets you ask questions about any web page using visible text as context

**Tech Stack:**
- Supabase with pgvector
- Hugging Face embeddings (all-MiniLM-L6-v2)
- Groq LLaMA-3.1-8B-Instant for generation
- Agora Conversational AI for STT and TTS

See `.env.example` for required environment variables.

---

## Chrome Extension Usage

1. Load the extension from the `extension/` folder in Chrome (Developer mode > Load unpacked).
2. Click the extension icon on any page, type your question, and hit Send.
3. The extension extracts visible text and sends it to the backend as context.
4. Answers are generated using only the current page text (direct context mode).

**Note:** The extension sets the `x-extension` header so the backend uses direct context mode, bypassing RAG retrieval.

---

## Main App Usage

The main app (frontend) uses the full RAG pipeline:
- Questions are answered using retrieved chunks from the vector database.
- No direct context override unless the extension is used.

---

## Vultr Cloud Deployment (Quick Start)

1. Create a Vultr account and deploy an Ubuntu 22.04 instance (1–2 vCPU, 2–4GB RAM recommended).
2. Add your SSH key and connect via SSH.
3. Update and install dependencies:
  ```sh
  sudo apt update && sudo apt upgrade
  sudo apt install nodejs npm git nginx
  ```
4. Clone your repo:
  ```sh
  git clone <your-repo-url>
  cd AgoraLearn
  ```
5. Copy your `.env` file (do not commit to git).
6. Install dependencies and build:
  ```sh
  npm install
  cd frontend && npm install && npm run build
  ```
7. (Optional) Use PM2 to run backend and frontend servers.
8. Configure Nginx as a reverse proxy and set up SSL with Let's Encrypt.

---


---

## Vercel Deployment Protection

If your Vercel project has Deployment Protection enabled, automated POSTs to your `api` endpoints will receive a Vercel auth page (401) unless you provide a protection bypass token. You can:
- Disable Deployment Protection in the Vercel project settings (less secure).
- Create a Protection Bypass Token in Vercel and use it in your upload scripts.

Set the token in an environment variable named `VERCEL_BYPASS_TOKEN` or pass it as an extra CLI argument to the upload scripts. The scripts will append the required query parameters automatically.

Example (PowerShell) — `.docx` upload using the `upload-docx` script:
```powershell
$env:VERCEL_BYPASS_TOKEN = 'your-token-here'
node .\scripts\upload-docx.js 'C:\path\to\notes.docx' my-doc-id
Remove-Item Env:\VERCEL_BYPASS_TOKEN
```
Or pass token as CLI arg (last parameter):
```powershell
node .\scripts\upload-docx.js 'C:\path\to\notes.docx' my-doc-id 'your-token-here'
```

---

## Supported uploads (prototype)

- Plain text (JSON): POST `{ "text": "...", "docId": "optional" }` to `/api/upload`
- URL: POST `{ "url": "https://...", "docId": "optional" }` to `/api/upload` (server will fetch and extract text)
- Microsoft Word `.docx`: use `scripts/upload-docx.js` or multipart file upload to `/api/upload`

Not supported in this prototype: PDF files and image OCR. Those features are planned for a later rollout.

---

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
