"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = handler;
const supabase_js_1 = require("@supabase/supabase-js");
const supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    const { provider } = req.query;
    if (!provider || !['google', 'github'].includes(provider)) {
        return res.status(400).json({ error: 'Invalid provider' });
    }
    // Get OAuth URL from Supabase
    const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
            redirectTo: process.env.OAUTH_REDIRECT_URL || 'http://localhost:3000/auth/callback'
        }
    });
    if (error) {
        return res.status(400).json({ error: error.message });
    }
    // Redirect user to OAuth URL
    return res.status(200).json({ url: data.url });
}
