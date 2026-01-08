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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function LoginPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as any;
  const { toast } = useToast();

  const [email, setEmail] = useState('');
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const allowDevAuth = import.meta.env.VITE_ALLOW_TEST_LOGIN === 'true';
  const testLoginEmail = import.meta.env.VITE_TEST_LOGIN_EMAIL || 'test@example.com';
  const basePath = import.meta.env.BASE_URL || '/';

  const from = typeof location?.state?.from === 'string' ? location.state.from : '/';

  useEffect(() => {
    if (!loading && user) {
      navigate(from, { replace: true });
    }
  }, [loading, user, from, navigate]);

  const signIn = async () => {
    if (!loginId.trim() || !password) {
      toast({ title: 'メールアドレスとパスワードを入力してください', variant: 'destructive' });
      return;
    }
    const loginValue = loginId.trim();
    if (allowDevAuth && loginId.trim() === 'test' && password === 'test') {
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
    let emailForLogin = loginValue;
    if (!loginValue.includes('@')) {
      const { data, error: lookupError } = await supabase.rpc('get_email_for_handle', {
        handle_input: loginValue.toLowerCase(),
      });
      if (lookupError || !data) {
        setBusy(false);
        toast({ title: 'ログインに失敗しました', description: 'IDが見つかりません', variant: 'destructive' });
        return;
      }
      emailForLogin = data as string;
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: emailForLogin,
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

  const handleForgotPassword = async () => {
    if (!resetEmail.trim()) {
      toast({ title: 'メールアドレスを入力してください', variant: 'destructive' });
      return;
    }
    setBusy(true);
    const redirectTo = new URL(`${basePath}reset-password`, window.location.origin).toString();
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), { redirectTo });
    setBusy(false);
    if (error) {
      toast({ title: '送信に失敗しました', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: '再設定用のメールを送信しました' });
    setResetOpen(false);
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
                  <Label htmlFor="login-id">メールアドレス</Label>
                  <Input
                    id="login-id"
                    type="text"
                    value={loginId}
                    onChange={(e) => setLoginId(e.target.value)}
                    className="bg-input border-border"
                    autoComplete="username"
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
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:underline"
                    onClick={() => {
                      setResetEmail('');
                      setResetOpen(true);
                    }}
                  >
                    パスワードを忘れてしまった場合
                  </button>
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
                  <Label htmlFor="signup-email">メールアドレス</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bg-input border-border"
                    autoComplete="email"
                  />
                </div>
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
        <Dialog open={resetOpen} onOpenChange={setResetOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>パスワード再設定</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="reset-email">メールアドレス</Label>
              <Input
                id="reset-email"
                type="email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                className="bg-input border-border"
                autoComplete="email"
              />
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setResetOpen(false)}>
                キャンセル
              </Button>
              <Button onClick={handleForgotPassword} disabled={busy}>
                パスワードを再設定する
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
