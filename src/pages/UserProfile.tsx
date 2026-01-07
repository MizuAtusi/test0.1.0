import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ImagePlus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { MainNav } from '@/components/navigation/MainNav';
import type { Profile, ProfilePost, ProfileReply } from '@/types/trpg';

export default function UserProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const { user, isDevAuth } = useAuth();
  const { toast } = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<ProfilePost[]>([]);
  const [replies, setReplies] = useState<ProfileReply[]>([]);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isDevAuth) return;
    if (!userId) return;
    let canceled = false;
    (async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
      if (canceled) return;
      if (error) {
        toast({ title: 'プロフィール取得に失敗しました', description: error.message, variant: 'destructive' });
        return;
      }
      setProfile(data as any);
    })();
    return () => {
      canceled = true;
    };
  }, [userId, isDevAuth]);

  const loadPosts = async () => {
    if (!userId) return;
    const { data: postData, error: postError } = await supabase
      .from('profile_posts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (postError) return;
    setPosts((postData as any) || []);

    const postIds = (postData as any[] | null)?.map((p) => p.id) ?? [];
    if (postIds.length === 0) {
      setReplies([]);
      return;
    }
    const { data: replyData } = await supabase
      .from('profile_replies')
      .select('*')
      .in('post_id', postIds)
      .order('created_at', { ascending: true });
    setReplies((replyData as any) || []);
  };

  useEffect(() => {
    if (isDevAuth) return;
    void loadPosts();
  }, [userId, isDevAuth]);

  const repliesByPost = useMemo(() => {
    const map = new Map<string, ProfileReply[]>();
    replies.forEach((r) => {
      const list = map.get(r.post_id) || [];
      list.push(r);
      map.set(r.post_id, list);
    });
    return map;
  }, [replies]);

  const handleReply = async (postId: string) => {
    if (isDevAuth) {
      toast({ title: 'テストログイン中は返信できません', variant: 'destructive' });
      return;
    }
    if (!user?.id) return;
    const text = (replyDrafts[postId] || '').trim();
    if (!text) return;
    const { error } = await supabase.from('profile_replies').insert({
      post_id: postId,
      user_id: user.id,
      content: text,
    } as any);
    if (!error) {
      setReplyDrafts((prev) => ({ ...prev, [postId]: '' }));
      await loadPosts();
    }
  };

  if (isDevAuth) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="mx-auto w-full max-w-5xl space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h1 className="font-display text-2xl text-foreground">ユーザーページ</h1>
            <MainNav />
          </div>
          <Card className="bg-card border-border">
            <CardContent className="pt-6 text-sm text-muted-foreground">
              テストログイン中はユーザーページの閲覧ができません。
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-2xl text-foreground">ユーザーページ</h1>
          <MainNav />
        </div>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base">プロフィール</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-16 w-16 rounded-full bg-secondary/60 overflow-hidden flex items-center justify-center">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="avatar" className="h-full w-full object-cover" />
                ) : (
                  <ImagePlus className="w-6 h-6 text-muted-foreground" />
                )}
              </div>
              <div className="text-lg font-semibold">{profile?.display_name || 'ユーザー'}</div>
            </div>
            <div className="text-sm text-muted-foreground whitespace-pre-wrap">
              {profile?.bio || '一言メッセージはありません'}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base">投稿一覧</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {posts.length === 0 ? (
              <div className="text-muted-foreground text-sm">投稿はまだありません</div>
            ) : (
              posts.map((p) => (
                <div key={p.id} className="rounded-md border border-border/50 p-3 space-y-2">
                  {p.thumbnail_url && (
                    <img src={p.thumbnail_url} alt="" className="w-full max-h-64 object-cover rounded" />
                  )}
                  <div className="whitespace-pre-wrap">{p.content}</div>
                  <div className="space-y-2 pt-2">
                    {(repliesByPost.get(p.id) || []).map((r) => (
                      <div key={r.id} className="text-sm text-muted-foreground border-l pl-3">
                        {r.content}
                      </div>
                    ))}
                    <div className="flex items-center gap-2">
                      <Input
                        value={replyDrafts[p.id] || ''}
                        onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))}
                        placeholder="返信を書く"
                        className="bg-input border-border"
                      />
                      <Button variant="outline" onClick={() => handleReply(p.id)}>
                        返信
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
