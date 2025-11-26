import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const PORT = process.env.PORT || 3000;

// Helper to import compiled handler
function importHandler(handlerPath) {
  // For CommonJS compiled output
  return require(handlerPath).default;
}

// Map API routes to handlers
app.use(express.json());

// Example routes (add more as needed)
app.all('/api/converse', importHandler(path.join(__dirname, 'api', 'converse.js')));
app.all('/api/health', importHandler(path.join(__dirname, 'api', 'health.js')));
app.all('/api/upload-file', importHandler(path.join(__dirname, 'api', 'upload-file.js')));
// Add other routes here following the same pattern

app.get('/', (_req, res) => {
  res.send('AgoraLearn Express server is running!');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
