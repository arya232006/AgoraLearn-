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
    "You are a study assistant. The following sources come from the student's own notes. " +
    'Base your answer only on this context. If the context truly does not contain the answer, say you do not know.\n\n' +
    `CONTEXT:\n${context}\n\n` +
    `QUESTION: ${query}\n\n` +
    'If the question asks to summarize notes, write a clear 2-4 sentence summary using only the information in the context.'
  );
}