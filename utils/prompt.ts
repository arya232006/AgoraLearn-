export function buildRagPrompt(query: string, chunks: Array<{ text: string; doc_id?: string }>) {
  const context = chunks.map((c, i) => `Source ${i + 1}:\n${c.text}`).join('\n\n');

  return `You are a helpful tutor. Use the following context to answer the question. If the answer is not contained, say you don't know.\n\nCONTEXT:\n${context}\n\nQUESTION: ${query}\n\nAnswer:`;
}
