import React from 'react';

export interface ChatMessage {
  role: string;
  text: string;
}

export interface ChatBubbleProps {
  msg: ChatMessage;
}

export function ChatBubble({ msg }: ChatBubbleProps) {
  return (
    <div className={`p-3 rounded-lg ${
      msg.role === 'user' ? 'bg-[#161B22] ml-12 border border-[#D4AF37]/20' : 
      msg.role === 'status' ? 'bg-transparent text-[#D4AF37] italic text-xs animate-pulse' :
      'bg-[#D4AF37]/10 mr-12 border-l-2 border-[#D4AF37]'
    }`}>
      <span className="text-sm font-mono whitespace-pre-wrap">{msg.text}</span>
    </div>
  );
}
