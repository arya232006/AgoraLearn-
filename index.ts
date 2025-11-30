// ...existing code...
require('dotenv').config();
//console.log('ENV DEBUG:', process.env);
//console.log('SUPABASE_URL:', process.env.SUPABASE_URL);
//console.log('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY);
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
app.use(cors());
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
app.all('/api/upload', importHandler(path.join(__dirname, 'api', 'upload.js')));
app.all('/api/upload-file', importHandler(path.join(__dirname, 'api', 'upload-file.js')));
app.all('/api/upload-binary', importHandler(path.join(__dirname, 'api', 'upload-binary.js')));
app.all('/api/voice/token-debug', importHandler(path.join(__dirname, 'api', 'voice', 'token-debug.js')));
app.all('/api/voice-query', importHandler(path.join(__dirname, 'api', 'voice-query.js')));
// Add other routes here following the same pattern

app.get('/', (_req, res) => {
  res.send('AgoraLearn Express server is running!');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
