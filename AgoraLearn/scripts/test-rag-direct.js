const { runRAG } = require('../lib/rag');

async function main() {
  const query = "What are Newton's laws of motion?";
  try {
    const { answer, chunks } = await runRAG(query);
    console.log('Answer:\n', answer);
    console.log('\nChunks used:\n', chunks);
  } catch (err) {
    console.error('RAG test failed:', err);
    process.exit(1);
  }
}

main();
