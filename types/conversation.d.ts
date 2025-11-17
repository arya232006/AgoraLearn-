export type Conversation = {
  id: string;
  doc_id: string;
  created_at: string;
};

export type Message = {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
};
