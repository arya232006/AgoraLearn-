import React from "react";
import { Button } from "./components/ui/button";
import { Card, CardHeader, CardTitle } from "./components/ui/card";

export default function LandingPage() {
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
        </div>
        <div className="text-sm text-muted-foreground text-center">
          Built with React, Vite, shadcn/ui, Tailwind CSS, and GPT-4.1
        </div>
      </Card>
    </div>
  );
}
