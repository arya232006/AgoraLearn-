"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// ...existing code...
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
const PORT = process.env.PORT || 3000;
// Helper to import compiled handler
function importHandler(handlerPath) {
    // For CommonJS compiled output
    return require(handlerPath).default;
}
// Map API routes to handlers
app.use(express_1.default.json());
// Example routes (add more as needed)
app.all('/api/converse', importHandler(path_1.default.join(__dirname, 'api', 'converse.js')));
app.all('/api/health', importHandler(path_1.default.join(__dirname, 'api', 'health.js')));
app.all('/api/upload', importHandler(path_1.default.join(__dirname, 'api', 'upload.js')));
app.all('/api/upload-file', importHandler(path_1.default.join(__dirname, 'api', 'upload-file.js')));
app.all('/api/upload-binary', importHandler(path_1.default.join(__dirname, 'api', 'upload-binary.js')));
app.all('/api/voice/token-debug', importHandler(path_1.default.join(__dirname, 'api', 'voice', 'token-debug.js')));
app.all('/api/voice-query', importHandler(path_1.default.join(__dirname, 'api', 'voice-query.js')));
// Add other routes here following the same pattern
app.get('/', (_req, res) => {
    res.send('AgoraLearn Express server is running!');
});
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
