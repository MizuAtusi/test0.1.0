import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { Room } from '@/types/trpg';

type JoinedRoom = {
  room_id: string;
  role: 'PL' | 'GM';
  rooms: Room | null;
};

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [rooms, setRooms] = useState<JoinedRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [roomName, setRoomName] = useState('');

  const myId = user?.id ?? '';

  const loadRooms = useCallback(async () => {
    if (!myId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('room_members')
      .select('room_id,role,rooms(*)')
      .eq('user_id', myId)
      .order('created_at', { ascending: false });
    setLoading(false);
    if (error) {
      toast({ title: 'ルーム一覧の取得に失敗しました', description: error.message, variant: 'destructive' });
      return;
    }
    setRooms((data as any) || []);
  }, [myId, toast]);

  useEffect(() => {
    void loadRooms();
  }, [loadRooms]);

  const roomCards = useMemo(() => {
    return rooms
      .map((r) => ({
        id: r.rooms?.id ?? r.room_id,
        name: r.rooms?.name ?? '(名前不明)',
        role: r.role,
        createdAt: r.rooms?.created_at ?? '',
      }))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [rooms]);

  const createRoom = async () => {
    if (!myId) return;
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

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-2xl text-foreground">ダッシュボード</h1>
          <Button variant="outline" onClick={signOut}>
            <LogOut className="w-4 h-4 mr-2" />
            ログアウト
          </Button>
        </div>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base">ルーム作成</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
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
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base">参加中のルーム</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? (
              <div className="text-muted-foreground text-sm">読み込み中...</div>
            ) : roomCards.length === 0 ? (
              <div className="text-muted-foreground text-sm">参加中のルームはありません</div>
            ) : (
              roomCards.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border/50 p-3"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{r.name}</div>
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

