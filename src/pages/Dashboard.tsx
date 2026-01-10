import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { Room } from '@/types/trpg';
import { MainNav } from '@/components/navigation/MainNav';

type JoinedRoom = {
  room_id: string;
  role: 'PL' | 'GM';
  rooms: Room | null;
};

const ROOM_LAST_SEEN_STORAGE_KEY = 'trpg:lastSeenRoomMessages';

export default function DashboardPage() {
  const { user, isDevAuth } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [rooms, setRooms] = useState<JoinedRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [joinRoomId, setJoinRoomId] = useState('');
  const [joining, setJoining] = useState(false);
  const [deletingRoomId, setDeletingRoomId] = useState<string | null>(null);
  const [lastMessageMap, setLastMessageMap] = useState<Record<string, number>>({});
  const [lastSeenMap, setLastSeenMap] = useState<Record<string, number>>({});

  const myId = user?.id ?? '';

  useEffect(() => {
    if (!myId || isDevAuth) {
      if (isDevAuth) {
        setRooms([]);
        setLoading(false);
      }
      return;
    }
    let canceled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('room_members')
        .select('room_id,role,rooms(*)')
        .eq('user_id', myId)
        .order('created_at', { ascending: false });
      if (canceled) return;
      setLoading(false);
      if (error) {
        toast({ title: 'ルーム一覧の取得に失敗しました', description: error.message, variant: 'destructive' });
        return;
      }
      setRooms((data as any) || []);
    })();
    return () => {
      canceled = true;
    };
  }, [myId, isDevAuth]);

  const roomCards = useMemo(() => {
    return rooms
      .map((r) => ({
        id: r.rooms?.id ?? r.room_id,
        name: r.rooms?.name ?? '(名前不明)',
        role: r.role,
        ownerUserId: (r.rooms as any)?.owner_user_id ?? null,
        createdAt: r.rooms?.created_at ?? '',
      }))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [rooms]);

  const createdRooms = useMemo(() => {
    return roomCards.filter((r) => {
      // Prefer explicit owner; for legacy rooms owner can be null, treat own GM role as "created" per request.
      if (r.ownerUserId) return r.ownerUserId === myId;
      return r.role === 'GM';
    });
  }, [roomCards, myId]);

  const joinedRooms = useMemo(() => {
    const createdIds = new Set(createdRooms.map((r) => r.id));
    return roomCards.filter((r) => !createdIds.has(r.id));
  }, [roomCards, createdRooms]);

  useEffect(() => {
    if (!roomCards.length) {
      setLastMessageMap({});
      return;
    }
    if (isDevAuth) return;
    let canceled = false;
    (async () => {
      const roomIds = roomCards.map((r) => r.id);
      const { data, error } = await supabase
        .from('messages')
        .select('room_id, created_at')
        .in('room_id', roomIds)
        .order('created_at', { ascending: false });
      if (canceled) return;
      if (error) {
        toast({ title: '通知の取得に失敗しました', description: error.message, variant: 'destructive' });
        return;
      }
      const map: Record<string, number> = {};
      (data as any[] | null)?.forEach((row) => {
        if (!map[row.room_id]) {
          map[row.room_id] = new Date(row.created_at).getTime();
        }
      });
      setLastMessageMap(map);
    })();
    return () => {
      canceled = true;
    };
  }, [roomCards, isDevAuth, toast]);

  useEffect(() => {
    if (!roomCards.length) {
      setLastSeenMap({});
      return;
    }
    const now = Date.now();
    let stored: Record<string, number> = {};
    try {
      const raw = localStorage.getItem(ROOM_LAST_SEEN_STORAGE_KEY);
      if (raw) stored = JSON.parse(raw);
    } catch {
      stored = {};
    }
    let changed = false;
    roomCards.forEach((room) => {
      if (!stored[room.id]) {
        stored[room.id] = now;
        changed = true;
      }
    });
    if (changed) {
      try {
        localStorage.setItem(ROOM_LAST_SEEN_STORAGE_KEY, JSON.stringify(stored));
      } catch {
        // ignore
      }
    }
    setLastSeenMap(stored);
  }, [roomCards]);

  const hasUnread = (roomId: string) => {
    const lastMessageAt = lastMessageMap[roomId];
    const lastSeenAt = lastSeenMap[roomId];
    if (!lastMessageAt || !lastSeenAt) return false;
    return lastMessageAt > lastSeenAt;
  };

  const createRoom = async () => {
    if (!myId) return;
    if (isDevAuth) {
      toast({ title: 'テストログイン中は作成できません', variant: 'destructive' });
      return;
    }
    if (!roomName.trim()) {
      toast({ title: 'ルーム名を入力してください', variant: 'destructive' });
      return;
    }
    setCreating(true);
    try {
      const { data: room, error: roomError } = await supabase
        .from('rooms')
        .insert({
          name: roomName.trim(),
          gm_key_hash: '',
          owner_user_id: myId,
        } as any)
        .select('*')
        .single();
      if (roomError) throw roomError;

      const { error: memberError } = await supabase.from('room_members').insert({
        room_id: room.id,
        user_id: myId,
        role: 'GM',
      } as any);
      if (memberError) throw memberError;

      await supabase.from('stage_states').insert({
        room_id: room.id,
        active_portraits: [],
      } as any);

      toast({ title: 'ルームを作成しました' });
      setRoomName('');
      navigate(`/room/${room.id}`);
    } catch (e: any) {
      toast({ title: 'ルーム作成に失敗しました', description: String(e?.message || e), variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const joinRoom = async () => {
    if (!myId) return;
    if (isDevAuth) {
      toast({ title: 'テストログイン中は参加できません', variant: 'destructive' });
      return;
    }
    if (!joinRoomId.trim()) {
      toast({ title: 'ルームIDを入力してください', variant: 'destructive' });
      return;
    }
    setJoining(true);
    try {
      const roomId = joinRoomId.trim();
      // Ensure room exists (gives nicer error than insert failing)
      const { data: room, error: roomError } = await supabase.from('rooms').select('id').eq('id', roomId).single();
      if (roomError || !room) {
        toast({ title: 'ルームが見つかりません', variant: 'destructive' });
        return;
      }

      const { error } = await supabase.from('room_members').insert({
        room_id: roomId,
        user_id: myId,
        role: 'PL',
      } as any);
      if (error) {
        const msg = String(error.message || '');
        if (!msg.toLowerCase().includes('duplicate') && !msg.toLowerCase().includes('already exists')) {
          throw error;
        }
      }

      toast({ title: 'ルームに参加しました' });
      setJoinRoomId('');
      navigate(`/room/${roomId}`);
    } catch (e: any) {
      toast({ title: 'ルーム参加に失敗しました', description: String(e?.message || e), variant: 'destructive' });
    } finally {
      setJoining(false);
    }
  };

  const deleteRoom = async (roomId: string) => {
    if (!myId) return;
    if (isDevAuth) {
      toast({ title: 'テストログイン中は削除できません', variant: 'destructive' });
      return;
    }
    try {
      const { error } = await supabase.from('rooms').delete().eq('id', roomId);
      if (error) throw error;
      toast({ title: 'ルームを削除しました' });
      setDeletingRoomId(null);
      // refresh list
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('room_members')
        .select('room_id,role,rooms(*)')
        .eq('user_id', myId)
        .order('created_at', { ascending: false });
      setLoading(false);
      if (fetchError) throw fetchError;
      setRooms((data as any) || []);
    } catch (e: any) {
      toast({ title: 'ルーム削除に失敗しました', description: String(e?.message || e), variant: 'destructive' });
    }
  };

  const signOut = async () => {
    if (isDevAuth) {
      try {
        localStorage.removeItem('trpg:devAuth');
      } catch {
        // ignore
      }
      navigate('/login', { replace: true });
      return;
    }
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-2xl text-foreground">ルームで遊ぶ</h1>
          <div className="flex items-center gap-3">
            <MainNav />
            <Button variant="outline" onClick={signOut}>
              <LogOut className="w-4 h-4 mr-2" />
              ログアウト
            </Button>
          </div>
        </div>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base">ルーム作成</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <Input
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="ルーム名"
                className="bg-input border-border"
              />
              <Button onClick={createRoom} disabled={creating}>
                <Plus className="w-4 h-4 mr-2" />
                作成
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={joinRoomId}
                onChange={(e) => setJoinRoomId(e.target.value)}
                placeholder="ルームIDで参加"
                className="bg-input border-border"
              />
              <Button variant="outline" onClick={joinRoom} disabled={joining}>
                参加
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base">作成したルーム</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? (
              <div className="text-muted-foreground text-sm">読み込み中...</div>
            ) : createdRooms.length === 0 ? (
              <div className="text-muted-foreground text-sm">作成したルームはありません</div>
            ) : (
              createdRooms.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border/50 p-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-medium truncate">
                      <span className="truncate">{r.name}</span>
                      {hasUnread(r.id) && <span className="h-2 w-2 rounded-full bg-red-500" />}
                    </div>
                    <div className="text-xs text-muted-foreground">権限: GM</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => navigate(`/room/${r.id}`)}>
                      開く
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => {
                        const ok = window.confirm('本当にルームを削除しますか？（元に戻せません）');
                        if (!ok) return;
                        setDeletingRoomId(r.id);
                        void deleteRoom(r.id);
                      }}
                      disabled={deletingRoomId === r.id}
                    >
                      削除
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base">参加中のルーム</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? (
              <div className="text-muted-foreground text-sm">読み込み中...</div>
            ) : joinedRooms.length === 0 ? (
              <div className="text-muted-foreground text-sm">参加中のルームはありません</div>
            ) : (
              joinedRooms.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border/50 p-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-medium truncate">
                      <span className="truncate">{r.name}</span>
                      {hasUnread(r.id) && <span className="h-2 w-2 rounded-full bg-red-500" />}
                    </div>
                    <div className="text-xs text-muted-foreground">権限: {r.role}</div>
                  </div>
                  <Button variant="outline" onClick={() => navigate(`/room/${r.id}`)}>
                    開く
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
