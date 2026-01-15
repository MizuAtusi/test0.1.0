import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PlatformShell } from '@/components/navigation/PlatformShell';
import type { RoomPublicSettings } from '@/types/trpg';

export default function PublicRoomsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<RoomPublicSettings[]>([]);
  const [ownerProfiles, setOwnerProfiles] = useState<Record<string, { id: string; display_name: string; handle: string }>>({});
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [copyingId, setCopyingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    let canceled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('room_public_settings')
        .select('*')
        .eq('is_public', true)
        .order('published_at', { ascending: false });
      if (canceled) return;
      setLoading(false);
      if (error) {
        toast({ title: '公開ルームの取得に失敗しました', description: error.message, variant: 'destructive' });
        return;
      }
      setRooms((data as any) || []);
      const ownerIds = Array.from(new Set(((data as any[]) || []).map((r) => r.owner_user_id).filter(Boolean)));
      if (ownerIds.length > 0) {
        const { data: owners } = await supabase
          .from('profiles')
          .select('id,display_name,handle')
          .in('id', ownerIds);
        const map: Record<string, { id: string; display_name: string; handle: string }> = {};
        (owners as any[] | null)?.forEach((o) => {
          if (o?.id) map[o.id] = o;
        });
        setOwnerProfiles(map);
      } else {
        setOwnerProfiles({});
      }
    })();
    return () => {
      canceled = true;
    };
  }, [user?.id]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rooms;
    const score = (r: RoomPublicSettings) => {
      const title = (r.title || '').toLowerCase();
      const desc = (r.description || '').toLowerCase();
      const tags = (r.tags || []).map((t) => String(t).toLowerCase());
      if (title.includes(q)) return 3;
      if (tags.some((t) => t.includes(q))) return 2;
      if (desc.includes(q)) return 1;
      return 0;
    };
    return rooms
      .map((r) => ({ r, s: score(r) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => (b.s - a.s) || ((b.r.published_at || '').localeCompare(a.r.published_at || '')))
      .map((x) => x.r);
  }, [rooms, query]);

  const copyToMyRoom = async (r: RoomPublicSettings) => {
    if (!user?.id) return;
    if (!r.allow_copy) {
      toast({ title: 'このルームは保存できません', description: 'KPがテンプレート頒布を許可していません。', variant: 'destructive' });
      return;
    }
    setCopyingId(r.room_id);
    try {
      const snapshot = r.snapshot || {};
      const roomPayload = snapshot.room || {};
      const name = r.title || roomPayload.name || '公開ルーム';
      const { data: room, error: roomError } = await supabase
        .from('rooms')
        .insert({
          name,
          gm_key_hash: '',
          owner_user_id: user.id,
          theme: roomPayload.theme ?? null,
          effects: roomPayload.effects ?? null,
          house_rules: roomPayload.house_rules ?? null,
          current_background_url: roomPayload.current_background_url ?? null,
        } as any)
        .select('*')
        .single();
      if (roomError) throw roomError;

      await supabase.from('room_members').insert({
        room_id: room.id,
        user_id: user.id,
        role: 'GM',
      } as any);

      await supabase.from('stage_states').insert({
        room_id: room.id,
        active_portraits: [],
        background_url: roomPayload.current_background_url ?? null,
      } as any);

      const assets = Array.isArray(snapshot.assets) ? snapshot.assets : [];
      if (assets.length > 0) {
        const rows = assets.map((a: any, idx: number) => ({
          room_id: room.id,
          kind: a.kind,
          url: a.url,
          label: a.label,
          tag: a.tag ?? '',
          is_default: a.is_default ?? false,
          layer_order: typeof a.layer_order === 'number' ? a.layer_order : idx,
        }));
        await supabase.from('assets').insert(rows as any);
      }

      const macros = Array.isArray(snapshot.macros) ? snapshot.macros : [];
      if (macros.length > 0) {
        const rows = macros.map((m: any) => ({
          room_id: room.id,
          title: m.title,
          text: m.text,
          scope: m.scope ?? 'GM',
        }));
        await supabase.from('macros').insert(rows as any);
      }

      toast({ title: '自分のルームに保存しました' });
      navigate(`/room/${room.id}`);
    } catch (e: any) {
      toast({ title: '保存に失敗しました', description: String(e?.message || e), variant: 'destructive' });
    } finally {
      setCopyingId(null);
    }
  };

  const signOut = async () => {
    try {
      localStorage.removeItem('trpg:devAuth');
    } catch {
      // ignore
    }
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  };

  return (
    <PlatformShell title="みんなのルーム" onSignOut={signOut}>
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="タイトル / タグ / 説明文で検索"
                className="bg-input border-border"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base">公開ルーム一覧</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="text-muted-foreground text-sm">読み込み中...</div>
            ) : filtered.length === 0 ? (
              <div className="text-muted-foreground text-sm">公開ルームはありません</div>
            ) : (
              filtered.map((r) => {
                const owner = ownerProfiles[r.owner_user_id];
                return (
                <div key={r.room_id} className="flex items-center justify-between gap-3 rounded-md border border-border/50 p-3">
                  <div className="min-w-0 space-y-1">
                    <div className="font-medium truncate">{r.title || '(無題)'}</div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>
                        {r.public_scope === 'read_only' ? '閲覧専用' : '概要のみ'}
                      </span>
                      <span>{r.allow_copy ? '頒布OK' : '頒布不可'}</span>
                    </div>
                    {owner && (
                      <button
                        type="button"
                        className="text-xs text-muted-foreground underline text-left"
                        onClick={() => navigate(`/users/${owner.id}`)}
                      >
                        作成者: {owner.display_name || 'ユーザー'} @{owner.handle || 'id'}
                      </button>
                    )}
                    {r.description && (
                      <div className="text-xs text-muted-foreground line-clamp-2">{r.description}</div>
                    )}
                    {r.tags && r.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {r.tags.map((t) => (
                          <span key={t} className="text-xs px-2 py-0.5 rounded bg-secondary/60">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button variant="outline" onClick={() => navigate(`/room/${r.room_id}`)}>
                      詳細
                    </Button>
                    <Button onClick={() => copyToMyRoom(r)} disabled={!r.allow_copy || copyingId === r.room_id}>
                      <Copy className="w-4 h-4 mr-2" />
                      保存
                    </Button>
                  </div>
                </div>
              )})
            )}
          </CardContent>
        </Card>
      </div>
    </PlatformShell>
  );
}
