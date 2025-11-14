export function chunkText(text: string, chunkSize = 1000, overlap = 200) {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const piece = text.slice(start, end).trim();
    if (piece.length) chunks.push(piece);
    if (end === text.length) break;
    start = Math.max(0, end - overlap);
  }
  return chunks;
}
