import { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Message, Participant } from '@/types/trpg';

interface ChatPanelProps {
  messages: Message[];
  participant: Participant | null;
  onSendMessage: (text: string) => void;
}

export function ChatPanel({ messages, participant, onSendMessage }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !participant) return;
    onSendMessage(input.trim());
    setInput('');
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="h-full flex flex-col">
      <ScrollArea className="flex-1 p-3">
        <div className="space-y-3">
          {messages.map((msg) => (
            <div key={msg.id} className="animate-fade-in">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium text-primary">{msg.speaker_name}</span>
                <span className="text-xs text-muted-foreground">{formatTime(msg.created_at)}</span>
              </div>
              <p className="text-sm text-foreground pl-2 border-l-2 border-border">
                {msg.text}
              </p>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            チャットメッセージはここに表示されます
          </p>
        )}
      </ScrollArea>

      <form onSubmit={handleSubmit} className="p-3 border-t border-sidebar-border flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="メッセージを入力..."
          className="flex-1 bg-sidebar-accent border-sidebar-border"
          disabled={!participant}
        />
        <Button type="submit" size="icon" disabled={!participant}>
          <Send className="w-4 h-4" />
        </Button>
      </form>
    </div>
  );
}
