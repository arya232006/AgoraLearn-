"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = handler;
const supabase_js_1 = require("@supabase/supabase-js");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function handler(req, res) {
    // Example protected endpoint
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Missing token' });
    }
    try {
        // Verify Supabase JWT
        const decoded = jsonwebtoken_1.default.verify(token, process.env.SUPABASE_JWT_SECRET);
        // ...proceed with protected logic...
        return res.status(200).json({ message: 'Access granted', user: decoded });
    }
    catch (err) {
        return res.status(401).json({ error: 'Invalid token' });
    }
}
