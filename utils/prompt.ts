export function buildRagPrompt(
  query: string,
  chunks: Array<{ text: string; doc_id?: string }>
) {
  const context = chunks
    .map(
      (c, i) =>
        `Source ${i + 1}${c.doc_id ? ` (doc: ${c.doc_id})` : ''}:\n${c.text}`
    )
    .join('\n\n');

  return (
    'You are a study assistant. Answer ONLY using the provided context. ' +
    "If the answer is not in the context, say you don't know.\n\n" +
    `CONTEXT:\n${context}\n\n` +
    `QUESTION: ${query}\n\n` +
    'Answer in 2-4 concise sentences based only on the context.'
  );
}