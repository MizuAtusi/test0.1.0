import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LogIn, UserPlus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function LoginPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as any;
  const { toast } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const allowDevAuth = import.meta.env.VITE_ALLOW_TEST_LOGIN === 'true';
  const testLoginEmail = import.meta.env.VITE_TEST_LOGIN_EMAIL || 'test@example.com';

  const from = typeof location?.state?.from === 'string' ? location.state.from : '/';

  useEffect(() => {
    if (!loading && user) {
      navigate(from, { replace: true });
    }
  }, [loading, user, from, navigate]);

  const signIn = async () => {
    if (!email.trim() || !password) {
      toast({ title: 'メールアドレスとパスワードを入力してください', variant: 'destructive' });
      return;
    }
    if (allowDevAuth && email.trim() === 'test' && password === 'test') {
      setBusy(true);
      const { error } = await supabase.auth.signInWithPassword({
        email: testLoginEmail,
        password: 'test',
      });
      setBusy(false);
      if (error) {
        toast({
          title: 'テストログインに失敗しました',
          description: 'テスト用のアカウントがSupabaseに存在しません。',
          variant: 'destructive',
        });
        return;
      }
      toast({ title: 'テストユーザーでログインしました' });
      navigate(from, { replace: true });
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (error) {
      toast({ title: 'ログインに失敗しました', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'ログインしました' });
  };

  const signUp = async () => {
    if (!email.trim() || !password || !displayName.trim()) {
      toast({ title: 'メール・パスワード・ユーザー名を入力してください', variant: 'destructive' });
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { display_name: displayName.trim() },
      },
    });
    setBusy(false);
    if (error) {
      toast({ title: '登録に失敗しました', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: '認証メールを送信しました。メールが届かない場合、もう一度登録ボタンを押してみてください。' });
  };

  const signInWithX = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'twitter',
      options: {
        redirectTo: window.location.origin,
      },
    });
    setBusy(false);
    if (error) {
      toast({ title: 'Xログインに失敗しました', description: error.message, variant: 'destructive' });
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card className="bg-card border-border shadow-stage">
          <CardHeader>
            <CardTitle>ログイン / 新規登録</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="login">
              <TabsList className="w-full">
                <TabsTrigger value="login" className="flex-1">
                  <LogIn className="w-4 h-4 mr-2" />
                  ログイン
                </TabsTrigger>
                <TabsTrigger value="signup" className="flex-1">
                  <UserPlus className="w-4 h-4 mr-2" />
                  新規登録
                </TabsTrigger>
              </TabsList>

              <div className="mt-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">メールアドレス</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bg-input border-border"
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">パスワード</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-input border-border"
                    autoComplete="current-password"
                  />
                </div>
              </div>

              <TabsContent value="login" className="mt-4 space-y-4">
                <Button className="w-full" onClick={signIn} disabled={busy}>
                  ログイン
                </Button>
                <Button className="w-full" variant="outline" onClick={signInWithX} disabled={busy}>
                  Xでログイン
                </Button>
                {allowDevAuth && (
                  <div className="text-xs text-muted-foreground">
                    テストログイン: メール/パスワードに「test」を入力（テスト用アカウントでログイン）
                  </div>
                )}
              </TabsContent>

              <TabsContent value="signup" className="mt-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="displayName">ユーザー名</Label>
                  <Input
                    id="displayName"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="bg-input border-border"
                    autoComplete="nickname"
                  />
                </div>
                <Button className="w-full" onClick={signUp} disabled={busy}>
                  登録
                </Button>
                <Button className="w-full" variant="outline" onClick={signInWithX} disabled={busy}>
                  Xで登録/ログイン
                </Button>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
