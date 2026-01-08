import { useState, useRef, useEffect, useMemo } from 'react';
import { Send, Plus, Pencil, Circle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { parseDiceCommand, formatDiceResult } from '@/lib/dice';
import { supabase } from '@/integrations/supabase/client';
import type { Message, Participant } from '@/types/trpg';

interface ChatPanelProps {
  roomId: string;
  messages: Message[];
  participant: Participant | null;
  onSendMessage: (text: string, options?: { dicePayload?: any; threadId?: string | null }) => void;
}

export function ChatPanel({ roomId, messages, participant, onSendMessage }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [threads, setThreads] = useState<any[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [memberProfiles, setMemberProfiles] = useState<Record<string, any>>({});
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [threadName, setThreadName] = useState('');
  const [threadColor, setThreadColor] = useState('#7c3aed');
  const [threadMembers, setThreadMembers] = useState<string[]>([]);
  const [lastSeenByThread, setLastSeenByThread] = useState<Record<string, number>>({});

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeMessages]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? null);
    });
  }, []);

  const loadThreads = async () => {
    if (!roomId) return;
    const { data } = await supabase
      .from('chat_threads')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true });
    setThreads(data || []);
  };

  const loadMemberProfiles = async () => {
    if (!roomId) return;
    const { data: members } = await supabase
      .from('room_members')
      .select('user_id')
      .eq('room_id', roomId);
    const ids = (members || [])
      .map((m: any) => m.user_id)
      .filter((id: string | null) => !!id) as string[];
    if (!ids.length) return;
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name, handle, avatar_url')
      .in('id', ids);
    const map: Record<string, any> = {};
    (profiles || []).forEach((p: any) => {
      map[p.id] = p;
    });
    setMemberProfiles(map);
  };

  useEffect(() => {
    loadThreads();
    loadMemberProfiles();
  }, [roomId]);

  const publicMessages = useMemo(
    () => messages.filter((m) => m.channel === 'chat' && !m.thread_id),
    [messages]
  );
  const privateMessages = useMemo(
    () => messages.filter((m) => m.channel === 'chat' && m.thread_id),
    [messages]
  );

  const activeMessages = useMemo(() => {
    if (!activeThreadId) return publicMessages;
    return privateMessages.filter((m) => m.thread_id === activeThreadId);
  }, [activeThreadId, publicMessages, privateMessages]);

  useEffect(() => {
    const key = activeThreadId || 'public';
    const lastMessage = activeMessages[activeMessages.length - 1];
    if (!lastMessage) return;
    const ts = new Date(lastMessage.created_at).getTime();
    setLastSeenByThread((prev) => ({ ...prev, [key]: ts }));
  }, [activeThreadId, activeMessages]);

  const unreadByThread = useMemo(() => {
    const map: Record<string, boolean> = {};
    const publicLast = publicMessages[publicMessages.length - 1];
    if (publicLast) {
      const lastSeen = lastSeenByThread.public ?? 0;
      map.public = new Date(publicLast.created_at).getTime() > lastSeen && activeThreadId !== null;
    }
    threads.forEach((thread) => {
      const last = privateMessages.filter((m) => m.thread_id === thread.id).slice(-1)[0];
      if (!last) return;
      const lastSeen = lastSeenByThread[thread.id] ?? 0;
      map[thread.id] = new Date(last.created_at).getTime() > lastSeen && activeThreadId !== thread.id;
    });
    return map;
  }, [publicMessages, privateMessages, threads, lastSeenByThread, activeThreadId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !participant) return;
    const trimmed = input.trim();
    const diceResult = parseDiceCommand(trimmed);
    if (diceResult) {
      const formattedText = formatDiceResult(diceResult);
      onSendMessage(formattedText, { dicePayload: diceResult, threadId: activeThreadId });
    } else {
      onSendMessage(trimmed, { threadId: activeThreadId });
    }
    setInput('');
  };

  const openCreate = () => {
    if (!currentUserId) return;
    setThreadName('');
    setThreadColor('#7c3aed');
    setThreadMembers([currentUserId]);
    setCreateOpen(true);
  };

  const handleCreateThread = async () => {
    if (!roomId || !currentUserId) return;
    if (!threadName.trim()) return;
    const memberIds = Array.from(new Set(threadMembers.concat(currentUserId)));
    const { data, error } = await supabase
      .from('chat_threads')
      .insert({
        room_id: roomId,
        title: threadName.trim(),
        color: threadColor,
        member_user_ids: memberIds,
        created_by: currentUserId,
      })
      .select('*')
      .single();
    if (error || !data) return;
    setThreads((prev) => [...prev, data]);
    setActiveThreadId(data.id);
    setCreateOpen(false);
  };

  const openEdit = () => {
    if (!activeThreadId) return;
    const thread = threads.find((t) => t.id === activeThreadId);
    if (!thread) return;
    setThreadName(thread.title);
    setThreadColor(thread.color || '#7c3aed');
    setThreadMembers(thread.member_user_ids || []);
    setEditOpen(true);
  };

  const handleEditThread = async () => {
    if (!activeThreadId || !currentUserId) return;
    if (!threadName.trim()) return;
    const memberIds = Array.from(new Set(threadMembers.concat(currentUserId)));
    const { data, error } = await supabase
      .from('chat_threads')
      .update({
        title: threadName.trim(),
        color: threadColor,
        member_user_ids: memberIds,
        updated_at: new Date().toISOString(),
      } as any)
      .eq('id', activeThreadId)
      .select('*')
      .single();
    if (error || !data) return;
    setThreads((prev) => prev.map((t) => (t.id === activeThreadId ? data : t)));
    setEditOpen(false);
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-sidebar-border px-3 py-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>インデックス</span>
          <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={openCreate}>
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          <button
            type="button"
            className={`flex items-center gap-2 px-2 py-1 rounded border text-xs ${
              activeThreadId === null ? 'bg-secondary/60' : 'bg-transparent'
            }`}
            onClick={() => setActiveThreadId(null)}
          >
            <Circle className="w-2 h-2" style={{ color: '#7c3aed' }} />
            全体チャット
            {unreadByThread.public && <span className="ml-1 h-2 w-2 rounded-full bg-red-500" />}
          </button>
          {threads.map((thread) => (
            <button
              key={thread.id}
              type="button"
              className={`flex items-center gap-2 px-2 py-1 rounded border text-xs ${
                activeThreadId === thread.id ? 'bg-secondary/60' : 'bg-transparent'
              }`}
              onClick={() => setActiveThreadId(thread.id)}
            >
              <Circle className="w-2 h-2" style={{ color: thread.color || '#7c3aed' }} />
              {thread.title}
              {unreadByThread[thread.id] && <span className="ml-1 h-2 w-2 rounded-full bg-red-500" />}
            </button>
          ))}
          {activeThreadId && (
            <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={openEdit}>
              <Pencil className="w-3 h-3" />
            </Button>
          )}
        </div>
      </div>
      <ScrollArea className="flex-1 p-3">
        <div className="space-y-3">
          {activeMessages.map((msg) => (
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

        {activeMessages.length === 0 && (
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
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>個別チャットを作成</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>名前</Label>
              <Input value={threadName} onChange={(e) => setThreadName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>色</Label>
              <Input type="color" value={threadColor} onChange={(e) => setThreadColor(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>参加者</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[200px] overflow-auto border rounded-md p-2">
                {Object.values(memberProfiles).map((p: any) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={threadMembers.includes(p.id)}
                      disabled={p.id === currentUserId}
                      onCheckedChange={(checked) => {
                        setThreadMembers((prev) => {
                          if (checked) return [...prev, p.id];
                          return prev.filter((id) => id !== p.id);
                        });
                      }}
                    />
                    <span>{p.display_name} {p.handle ? `@${p.handle}` : ''}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>キャンセル</Button>
            <Button onClick={handleCreateThread}>作成</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>チャットを編集</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>名前</Label>
              <Input value={threadName} onChange={(e) => setThreadName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>色</Label>
              <Input type="color" value={threadColor} onChange={(e) => setThreadColor(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>参加者</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[200px] overflow-auto border rounded-md p-2">
                {Object.values(memberProfiles).map((p: any) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={threadMembers.includes(p.id)}
                      disabled={p.id === currentUserId}
                      onCheckedChange={(checked) => {
                        setThreadMembers((prev) => {
                          if (checked) return [...prev, p.id];
                          return prev.filter((id) => id !== p.id);
                        });
                      }}
                    />
                    <span>{p.display_name} {p.handle ? `@${p.handle}` : ''}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditOpen(false)}>キャンセル</Button>
            <Button onClick={handleEditThread}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
