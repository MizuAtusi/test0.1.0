import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';

type PublicStats = {
  users_count: number;
  rooms_count: number;
};

export default function LandingPage() {
  const [stats, setStats] = useState<PublicStats | null>(null);
  const baseUrl = import.meta.env.BASE_URL || '/';
  const formattedUsers = useMemo(
    () => (stats?.users_count ?? null) === null ? '—' : new Intl.NumberFormat('ja-JP').format(stats?.users_count ?? 0),
    [stats?.users_count]
  );
  const formattedRooms = useMemo(
    () => (stats?.rooms_count ?? null) === null ? '—' : new Intl.NumberFormat('ja-JP').format(stats?.rooms_count ?? 0),
    [stats?.rooms_count]
  );

  useEffect(() => {
    let mounted = true;
    const fetchStats = async () => {
      const { data, error } = await supabase
        .from('public_stats')
        .select('users_count, rooms_count')
        .eq('id', 1)
        .maybeSingle();
      if (!mounted) return;
      if (!error && data) setStats(data as PublicStats);
    };

    fetchStats();

    const channel = supabase
      .channel('public:stats')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'public_stats' },
        (payload) => {
          const row = (payload.new ?? payload.old) as Partial<PublicStats> | null;
          if (row && typeof row.users_count === 'number' && typeof row.rooms_count === 'number') {
            setStats({ users_count: row.users_count, rooms_count: row.rooms_count });
          } else {
            fetchStats();
          }
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(251,146,60,0.2),_transparent_55%),radial-gradient(circle_at_bottom_right,_rgba(14,165,233,0.18),_transparent_60%)]" />
        <div className="absolute -top-20 right-10 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-64 w-64 rounded-full bg-accent/20 blur-3xl" />

        <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 pt-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 overflow-hidden rounded-2xl bg-primary/10">
              <img src={`${baseUrl}trpgIcon.png`} alt="TaleRoomPG" className="h-full w-full object-cover" />
            </div>
            <div>
              <p className="font-display text-xl tracking-wide">TaleRoomPG</p>
              <p className="text-xs text-muted-foreground">ノベルゲームライクなオンラインセッションツール</p>
            </div>
          </div>
          <Button asChild size="sm">
            <Link to="/login">ログイン / 登録</Link>
          </Button>
        </header>

        <main className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-20 pt-12">
          <section className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
            <div className="space-y-6">
              <div className="space-y-2 text-4xl font-semibold leading-tight md:text-5xl">
                <p>TRPGも</p>
                <p>ADVも</p>
                <p>創作も</p>
              </div>
              <div className="space-y-3 text-base text-muted-foreground md:text-lg">
                <p className="text-foreground">
                  ノベルゲームライクなオンラインセッションツール
                  <span className="font-semibold text-primary">TaleRoomPG</span>
                  にようこそ！
                </p>
                <p className="text-sm text-muted-foreground">
                  対応しているシステムは現時点では
                  <span className="font-semibold text-foreground">CoC6版のみ</span>
                  となります。
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button asChild size="lg" className="gap-2">
                  <Link to="/login">
                    ログイン / 登録
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link to="/app">アプリを開く</Link>
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Card className="border-border/70 bg-card/80">
                  <CardContent className="p-5">
                    <p className="text-xs text-muted-foreground">登録ユーザー</p>
                    <p className="mt-2 text-2xl font-semibold">{formattedUsers}</p>
                  </CardContent>
                </Card>
                <Card className="border-border/70 bg-card/80">
                  <CardContent className="p-5">
                    <p className="text-xs text-muted-foreground">作成されたルーム</p>
                    <p className="mt-2 text-2xl font-semibold">{formattedRooms}</p>
                  </CardContent>
                </Card>
              </div>

              <Card className="border-border/70 bg-card/80">
                <CardContent className="p-5">
                  <p className="text-sm font-semibold">特徴</p>
                  <ol className="mt-3 space-y-3 text-sm text-muted-foreground">
                    <li>
                      <span className="font-semibold text-foreground">1.</span>{' '}
                      まるで本物のノベルゲームのようなプレイ画面
                    </li>
                    <li>
                      <span className="font-semibold text-foreground">2.</span>{' '}
                      簡単準備・簡単操作 とにかくルームのGMタブとか色々触ってみてください（投げやり）
                    </li>
                    <li>
                      <span className="font-semibold text-foreground">3.</span>{' '}
                      「プレイ」できるリプレイ リプレイをダウンロードしてHTMLファイルをブラウザにドラッグ&amp;ドロップすれば、
                      今まで遊んでいたセッションをノベルゲームとしてプレイすることができます。
                    </li>
                  </ol>
                </CardContent>
              </Card>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
