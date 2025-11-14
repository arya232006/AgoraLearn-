# AgoraLearn Backend

This repository contains a Vercel + TypeScript backend for a RAG + Voice demo using:

- Supabase with pgvector
- Hugging Face embeddings (all-MiniLM-L6-v2)
- Groq LLaMA-3.1-8B-Instant for generation
- Agora Conversational AI for STT and TTS

See `.env.example` for required environment variables.

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
create or replace function match_chunks(query_embedding vector(384), match_count int)
returns table(id uuid, doc_id text, text text, embedding vector(384), created_at timestamptz, distance float)
language sql as $$
  select id, doc_id, text, embedding, created_at, (embedding <-> query_embedding) as distance
  from chunks
  order by distance
  limit match_count;
$$;
```
