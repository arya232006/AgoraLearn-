-- Conversations table
create table if not exists conversations (
    id uuid primary key default gen_random_uuid(),
    doc_id text not null,
    created_at timestamptz not null default now()
);

-- Messages table
create table if not exists messages (
    id uuid primary key default gen_random_uuid(),
    conversation_id uuid references conversations(id) on delete cascade,
    role text check (role in ('user', 'assistant')) not null,
    content text not null,
    created_at timestamptz not null default now()
);
