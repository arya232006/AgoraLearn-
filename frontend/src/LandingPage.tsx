import AgoraRTC from 'agora-rtc-sdk-ng';
import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Button } from "./components/ui/button";
import { Card, CardHeader, CardTitle } from "./components/ui/card";

const APP_ID = "50a2a99cc1f14798aeca772e5e69844f"; // Your Agora App ID
const CHANNEL = "agora_bicilhe"; // Use your channel name
const supabase = createClient('https://fxawtshfqyrjejtdopvk.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4YXd0c2hmcXlyamVqdGRvcHZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMwNTgwNDMsImV4cCI6MjA3ODYzNDA0M30.UZEbHl1a5NiRONnjlGZr9g4IEkTJJV5kGbOayD2TpKI'); // Replace with your actual anon key

export default function LandingPage() {
  const [joined, setJoined] = useState(false);

  async function startVoiceCall() {
    // Fetch token from backend
    const res = await fetch("http://localhost:3000/api/voice/token-debug");
    const data = await res.json();
    const token = data.token;
    const uid = data.decoded.uid;

    // Create Agora client
    const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
    await client.join(APP_ID, CHANNEL, token, uid);

    // Create and publish local audio track
    const localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
    await client.publish([localAudioTrack]);

    setJoined(true);
    alert("Joined voice channel!");
  }

  function signInWithGoogle() {
    supabase.auth.signInWithOAuth({ provider: 'google' });
  }

  function signInWithGitHub() {
    supabase.auth.signInWithOAuth({ provider: 'github' });
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-linear-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <Card className="max-w-xl w-full mx-auto p-8 shadow-2xl rounded-2xl flex flex-col items-center">
        <CardHeader>
          <CardTitle className="text-3xl font-bold mb-2 text-center">Welcome to AgoraLearn</CardTitle>
        </CardHeader>
        <p className="text-lg text-muted-foreground mb-6 text-center">
          Your AI-powered learning assistant. Upload files, chat, and get instant answers with context-aware retrieval and modern UI.
        </p>
        <div className="flex gap-4 mb-6">
          <Button size="lg" className="px-8 py-3 text-lg" onClick={() => window.location.href = '/chat'}>
            Start Chatting
          </Button>
          <Button size="lg" variant="secondary" className="px-8 py-3 text-lg" onClick={() => window.location.href = 'https://github.com/arya232006/AgoraLearn'}>
            GitHub
          </Button>
          <button onClick={signInWithGoogle} style={{ padding: '10px 20px', fontSize: '16px', background: '#4285F4', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            Sign in with Google
          </button>
          <button onClick={signInWithGitHub} style={{ padding: '10px 20px', fontSize: '16px', background: '#333', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            Sign in with GitHub
          </button>
          <button onClick={startVoiceCall} style={{ padding: '10px 20px', fontSize: '16px', background: '#00BFFF', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            Start Voice Call
          </button>
        </div>
        {joined && <div>Voice channel joined!</div>}
        <div className="text-sm text-muted-foreground text-center">
          Built with React, Vite, shadcn/ui, Tailwind CSS, and GPT-4.1
        </div>
      </Card>
    </div>
  );
}
