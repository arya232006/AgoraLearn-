// GPT Vision helper disabled for prototype
export async function ocrWithGptVision(_fileBuffer: Buffer, _mimeType: string): Promise<string> {
  throw new Error('GPT Vision is disabled in this prototype.');
}

export default { ocrWithGptVision };
