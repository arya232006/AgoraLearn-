import fetch from 'node-fetch';

const OPENAI_EMBEDDING_ENDPOINT = 'https://api.openai.com/v1/embeddings';
const OPENAI_EMBEDDING_MODEL =
  process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';

type OpenAIEmbeddingResponse = {
  data: { embedding: number[] }[];
};

export async function embedText(text: string): Promise<number[]> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('Missing OPENAI_API_KEY');

  const res = await fetch(OPENAI_EMBEDDING_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: OPENAI_EMBEDDING_MODEL,
      input: text
    })
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`OpenAI embedding error: ${res.status} ${txt}`);
  }

  const data = (await res.json()) as OpenAIEmbeddingResponse;

  if (!data || !Array.isArray(data.data) || !data.data[0] || !Array.isArray(data.data[0].embedding)) {
    throw new Error('Unexpected OpenAI embedding response');
  }

  return data.data[0].embedding;
}
