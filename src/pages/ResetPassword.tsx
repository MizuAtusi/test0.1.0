import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setHasSession(!!data.session);
    });
  }, []);

  const handleReset = async () => {
    if (!newPassword || newPassword.length < 6) {
      toast({ title: '6文字以上のパスワードを入力してください', variant: 'destructive' });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: 'パスワードが一致しません', variant: 'destructive' });
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setBusy(false);
    if (error) {
      toast({ title: '再設定に失敗しました', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'パスワードを更新しました' });
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card className="bg-card border-border shadow-stage">
          <CardHeader>
            <CardTitle>パスワード再設定</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!hasSession && (
              <div className="text-sm text-muted-foreground">
                再設定リンクが無効か、期限切れの可能性があります。ログイン画面から再送信してください。
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="new-password">新しいパスワード</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="bg-input border-border"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">確認用パスワード</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="bg-input border-border"
              />
            </div>
            <Button className="w-full" onClick={handleReset} disabled={busy || !hasSession}>
              パスワードを更新
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
