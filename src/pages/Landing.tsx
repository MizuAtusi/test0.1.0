import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Sparkles, ShieldCheck, Users, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';

const features = [
  {
    title: '演出に強いステージ',
    description: '立ち絵・背景・BGM/SEを同じ画面で管理。セッションの空気を即座に作れる。',
    icon: Sparkles,
  },
  {
    title: 'GMツールが一体化',
    description: 'メモ、マクロ、公開/秘匿の切替まで。必要な操作が右側に集約。',
    icon: Wand2,
  },
  {
    title: '安心のルーム管理',
    description: '参加申請・閲覧専用・招待制など、公開範囲を細かく設定できる。',
    icon: ShieldCheck,
  },
];

export default function LandingPage() {
  const { user } = useAuth();
  const heroCta = useMemo(() => (user ? { label: 'アプリを開く', to: '/app' } : { label: 'ログイン / 登録', to: '/login' }), [user]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(253,186,116,0.25),_transparent_60%),radial-gradient(circle_at_bottom,_rgba(59,130,246,0.18),_transparent_55%)]" />
        <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute top-24 -left-20 h-48 w-48 rounded-full bg-accent/20 blur-3xl" />

        <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 pt-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-primary/20 p-2 text-primary">
              <Users className="h-full w-full" />
            </div>
            <div>
              <p className="font-display text-xl tracking-wide">TRPG Stage</p>
              <p className="text-xs text-muted-foreground">セッションに演出と進行の一体感を</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" className="hidden sm:inline-flex">
              <Link to="/login">ログイン</Link>
            </Button>
            <Button asChild>
              <Link to={heroCta.to}>{heroCta.label}</Link>
            </Button>
          </div>
        </header>

        <main className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-20 pt-14">
          <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/70 px-4 py-1 text-xs text-muted-foreground">
                <span className="h-2 w-2 rounded-full bg-primary" />
                クローズドβ運用中・公開準備中
              </div>
              <h1 className="font-display text-4xl leading-tight md:text-5xl">
                セッションの熱量を
                <span className="block text-primary">ひとつの画面に。</span>
              </h1>
              <p className="text-base text-muted-foreground md:text-lg">
                TRPG Stage は、ルーム管理・チャット・演出・キャラ管理を統合したオンラインセッション基盤。
                「準備→進行→記録」までをスムーズにつなげます。
              </p>
              <div className="flex flex-wrap gap-3">
                <Button asChild size="lg" className="gap-2">
                  <Link to={heroCta.to}>
                    {heroCta.label}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link to="/login">機能を試す</Link>
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Card className="border-border/70 bg-card/70">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">登録ユーザー</p>
                    <p className="text-xl font-semibold">近日公開</p>
                  </CardContent>
                </Card>
                <Card className="border-border/70 bg-card/70">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">進行中ルーム</p>
                    <p className="text-xl font-semibold">β運用中</p>
                  </CardContent>
                </Card>
                <Card className="border-border/70 bg-card/70">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">配信予定</p>
                    <p className="text-xl font-semibold">2026</p>
                  </CardContent>
                </Card>
              </div>
            </div>

            <div className="space-y-4">
              {features.map((feature) => (
                <Card key={feature.title} className="border-border/70 bg-card/70">
                  <CardContent className="flex gap-4 p-5">
                    <div className="mt-1 rounded-xl bg-primary/10 p-2 text-primary">
                      <feature.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold">{feature.title}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{feature.description}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <section className="mt-16 rounded-3xl border border-border/70 bg-card/60 p-8">
            <div className="grid gap-8 md:grid-cols-[1.2fr_0.8fr] md:items-center">
              <div>
                <h2 className="font-display text-2xl">「セッションの入口」を整える</h2>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                  参加者に「どんな卓か」「どんな雰囲気か」を伝えるためのハブページを用意しています。
                  ルーム公開設定、参加申請、閲覧専用などの管理もスムーズです。
                </p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/60 p-4 text-sm text-muted-foreground">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground/70">Preview</p>
                <div className="mt-3 space-y-2">
                  <div className="h-2 w-2/3 rounded-full bg-muted" />
                  <div className="h-2 w-1/2 rounded-full bg-muted" />
                  <div className="h-2 w-3/4 rounded-full bg-muted" />
                  <div className="h-2 w-1/3 rounded-full bg-muted" />
                </div>
              </div>
            </div>
          </section>

          <section className="mt-12 flex flex-col items-start justify-between gap-4 rounded-3xl border border-border/70 bg-primary/10 px-8 py-6 sm:flex-row sm:items-center">
            <div>
              <p className="text-sm text-muted-foreground">ベータ版の案内を受け取る</p>
              <p className="font-display text-xl">公開情報をいち早く知りたい方へ</p>
            </div>
            <Button asChild variant="secondary" className="gap-2">
              <Link to="/login">
                登録して待つ
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </section>
        </main>
      </div>
    </div>
  );
}
