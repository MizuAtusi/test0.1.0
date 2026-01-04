import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, LogIn, Skull } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { getSession, saveSession, hashGMKey, generateSessionId } from '@/lib/session';
import { useToast } from '@/hooks/use-toast';

export function LobbyView() {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  // Create room state
  const [roomName, setRoomName] = useState('');
  const [gmKey, setGmKey] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [creating, setCreating] = useState(false);
  
  // Join room state
  const [joinRoomId, setJoinRoomId] = useState('');
  const [joinPlayerName, setJoinPlayerName] = useState('');
  const [joinGmKey, setJoinGmKey] = useState('');
  const [joining, setJoining] = useState(false);

  const handleCreateRoom = async () => {
    if (!roomName.trim() || !gmKey.trim() || !playerName.trim()) {
      toast({ title: '全ての項目を入力してください', variant: 'destructive' });
      return;
    }

    setCreating(true);

    try {
      // Create room
      const { data: room, error: roomError } = await supabase
        .from('rooms')
        .insert({
          name: roomName.trim(),
          gm_key_hash: hashGMKey(gmKey),
        })
        .select()
        .single();

      if (roomError) throw roomError;

      // Get or create session
      let session = getSession();
      if (!session.sessionId) {
        session = { sessionId: generateSessionId() };
      }

      // Join as GM
      const { data: participant, error: partError } = await supabase
        .from('participants')
        .insert({
          room_id: room.id,
          name: playerName.trim(),
          role: 'GM',
          session_id: session.sessionId,
        })
        .select()
        .single();

      if (partError) throw partError;

      // Create initial stage state
      await supabase.from('stage_states').insert({
        room_id: room.id,
        active_portraits: [],
      });

      // Save session
      saveSession({
        ...session,
        participantId: participant.id,
        roomId: room.id,
        role: 'GM',
        name: playerName.trim(),
      });

      toast({ title: 'ルームを作成しました' });
      navigate(`/room/${room.id}`);
    } catch (error) {
      console.error('Error creating room:', error);
      toast({ title: 'ルーム作成に失敗しました', variant: 'destructive' });
    }

    setCreating(false);
  };

  const handleJoinRoom = async () => {
    if (!joinRoomId.trim() || !joinPlayerName.trim()) {
      toast({ title: 'ルームIDと名前を入力してください', variant: 'destructive' });
      return;
    }

    setJoining(true);

    try {
      // Check if room exists
      const { data: room, error: roomError } = await supabase
        .from('rooms')
        .select()
        .eq('id', joinRoomId.trim())
        .single();

      if (roomError || !room) {
        toast({ title: 'ルームが見つかりません', variant: 'destructive' });
        setJoining(false);
        return;
      }

      // Determine role
      let role: 'PL' | 'GM' = 'PL';
      if (joinGmKey.trim()) {
        const keyHash = hashGMKey(joinGmKey);
        if (keyHash === room.gm_key_hash) {
          role = 'GM';
        } else {
          toast({ title: 'GMキーが正しくありません', variant: 'destructive' });
          setJoining(false);
          return;
        }
      }

      // Get or create session
      let session = getSession();
      if (!session.sessionId) {
        session = { sessionId: generateSessionId() };
      }

      // Check if already in room
      const { data: existingPart } = await supabase
        .from('participants')
        .select()
        .eq('room_id', room.id)
        .eq('session_id', session.sessionId)
        .single();

      if (existingPart) {
        // Already joined, just navigate
        saveSession({
          ...session,
          participantId: existingPart.id,
          roomId: room.id,
          role: existingPart.role as 'PL' | 'GM',
          name: existingPart.name,
        });
        navigate(`/room/${room.id}`);
        setJoining(false);
        return;
      }

      // Join room
      const { data: participant, error: partError } = await supabase
        .from('participants')
        .insert({
          room_id: room.id,
          name: joinPlayerName.trim(),
          role,
          session_id: session.sessionId,
        })
        .select()
        .single();

      if (partError) throw partError;

      // Save session
      saveSession({
        ...session,
        participantId: participant.id,
        roomId: room.id,
        role,
        name: joinPlayerName.trim(),
      });

      toast({ title: 'ルームに参加しました' });
      navigate(`/room/${room.id}`);
    } catch (error) {
      console.error('Error joining room:', error);
      toast({ title: '参加に失敗しました', variant: 'destructive' });
    }

    setJoining(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center animate-pulse-glow">
              <Skull className="w-10 h-10 text-primary" />
            </div>
          </div>
          <h1 className="font-display text-3xl text-foreground glow-text">
            Eldritch Table
          </h1>
          <p className="text-muted-foreground mt-2">
            オンラインTRPGセッションツール
          </p>
        </div>

        {/* Main Card */}
        <Card className="bg-card border-border shadow-stage">
          <Tabs defaultValue="create">
            <TabsList className="w-full rounded-t-lg rounded-b-none border-b border-border">
              <TabsTrigger value="create" className="flex-1 tab-gothic">
                <Plus className="w-4 h-4 mr-2" />
                ルーム作成
              </TabsTrigger>
              <TabsTrigger value="join" className="flex-1 tab-gothic">
                <LogIn className="w-4 h-4 mr-2" />
                参加
              </TabsTrigger>
            </TabsList>

            <TabsContent value="create" className="p-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="roomName">ルーム名</Label>
                <Input
                  id="roomName"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  placeholder="例: クトゥルフ卓 第1回"
                  className="bg-input border-border"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="gmKey">GMキー</Label>
                <Input
                  id="gmKey"
                  type="password"
                  value={gmKey}
                  onChange={(e) => setGmKey(e.target.value)}
                  placeholder="GM権限用のパスワード"
                  className="bg-input border-border"
                />
                <p className="text-xs text-muted-foreground">
                  他のプレイヤーがGMになる際に必要です
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="playerName">あなたの名前</Label>
                <Input
                  id="playerName"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="表示名"
                  className="bg-input border-border"
                />
              </div>

              <Button 
                onClick={handleCreateRoom} 
                disabled={creating}
                className="w-full bg-primary hover:bg-primary/80"
              >
                {creating ? '作成中...' : 'ルームを作成'}
              </Button>
            </TabsContent>

            <TabsContent value="join" className="p-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="joinRoomId">ルームID</Label>
                <Input
                  id="joinRoomId"
                  value={joinRoomId}
                  onChange={(e) => setJoinRoomId(e.target.value)}
                  placeholder="ルームIDを入力"
                  className="bg-input border-border"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="joinPlayerName">あなたの名前</Label>
                <Input
                  id="joinPlayerName"
                  value={joinPlayerName}
                  onChange={(e) => setJoinPlayerName(e.target.value)}
                  placeholder="表示名"
                  className="bg-input border-border"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="joinGmKey">GMキー（任意）</Label>
                <Input
                  id="joinGmKey"
                  type="password"
                  value={joinGmKey}
                  onChange={(e) => setJoinGmKey(e.target.value)}
                  placeholder="GM権限が必要な場合のみ"
                  className="bg-input border-border"
                />
              </div>

              <Button 
                onClick={handleJoinRoom} 
                disabled={joining}
                className="w-full bg-primary hover:bg-primary/80"
              >
                {joining ? '参加中...' : 'ルームに参加'}
              </Button>
            </TabsContent>
          </Tabs>
        </Card>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground mt-6">
          クトゥルフ神話TRPG 6版対応
        </p>
      </div>
    </div>
  );
}
