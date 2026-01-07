import { useEffect, useMemo, useState } from 'react';
import { ImagePlus, LogOut } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { uploadFile } from '@/lib/upload';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { MainNav } from '@/components/navigation/MainNav';
import { useNavigate } from 'react-router-dom';
import type { Profile, ProfilePost, ProfileReply } from '@/types/trpg';

export default function MyPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const [posts, setPosts] = useState<ProfilePost[]>([]);
  const [replies, setReplies] = useState<ProfileReply[]>([]);
  const [newPost, setNewPost] = useState('');
  const [newThumbnail, setNewThumbnail] = useState<File | null>(null);
  const [posting, setPosting] = useState(false);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user?.id) return;
    let canceled = false;
    (async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (canceled) return;
      if (error) {
        toast({ title: 'プロフィール取得に失敗しました', description: error.message, variant: 'destructive' });
        return;
      }
      setProfile(data as any);
      setDisplayName((data as any)?.display_name || '');
      setBio((data as any)?.bio || '');
    })();
    return () => {
      canceled = true;
    };
  }, [user?.id]);

  const loadPosts = async () => {
    if (!user?.id) return;
    const { data: postData, error: postError } = await supabase
      .from('profile_posts')
      .select('*')
      .eq('user_id', user.id)
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
    void loadPosts();
  }, [user?.id]);

  const repliesByPost = useMemo(() => {
    const map = new Map<string, ProfileReply[]>();
    replies.forEach((r) => {
      const list = map.get(r.post_id) || [];
      list.push(r);
      map.set(r.post_id, list);
    });
    return map;
  }, [replies]);

  const handleSaveProfile = async () => {
    if (!user?.id) return;
    if (!displayName.trim()) {
      toast({ title: 'ユーザー名を入力してください', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      let avatarUrl = profile?.avatar_url || null;
      if (avatarFile) {
        const url = await uploadFile(avatarFile, `avatars/${user.id}`);
        if (!url) throw new Error('アイコンのアップロードに失敗しました');
        avatarUrl = url;
      }
      const { error } = await supabase
        .from('profiles')
        .update({
          display_name: displayName.trim(),
          bio: bio.trim(),
          avatar_url: avatarUrl,
        } as any)
        .eq('id', user.id);
      if (error) throw error;
      toast({ title: 'プロフィールを更新しました' });
      setAvatarFile(null);
      setProfile((p) => (p ? { ...p, display_name: displayName.trim(), bio: bio.trim(), avatar_url: avatarUrl } : p));
    } catch (e: any) {
      toast({ title: '更新に失敗しました', description: String(e?.message || e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleCreatePost = async () => {
    if (!user?.id) return;
    if (!newPost.trim()) {
      toast({ title: '投稿内容を入力してください', variant: 'destructive' });
      return;
    }
    setPosting(true);
    try {
      let thumbnailUrl: string | null = null;
      if (newThumbnail) {
        const url = await uploadFile(newThumbnail, `profile-posts/${user.id}`);
        if (!url) throw new Error('サムネイルのアップロードに失敗しました');
        thumbnailUrl = url;
      }
      const { error } = await supabase.from('profile_posts').insert({
        user_id: user.id,
        content: newPost.trim(),
        thumbnail_url: thumbnailUrl,
      } as any);
      if (error) throw error;
      setNewPost('');
      setNewThumbnail(null);
      await loadPosts();
      toast({ title: '投稿しました' });
    } catch (e: any) {
      toast({ title: '投稿に失敗しました', description: String(e?.message || e), variant: 'destructive' });
    } finally {
      setPosting(false);
    }
  };

  const handleReply = async (postId: string) => {
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
    <div className="min-h-screen bg-background p-4">
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-2xl text-foreground">マイページ</h1>
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
              <div className="space-y-2">
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="ユーザー名"
                  className="bg-input border-border"
                />
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)}
                />
              </div>
            </div>
            <Textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="一言メッセージ"
              className="bg-input border-border min-h-[90px]"
            />
            <Button onClick={handleSaveProfile} disabled={saving}>
              保存
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base">投稿</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={newPost}
              onChange={(e) => setNewPost(e.target.value)}
              placeholder="つぶやき / シナリオ通過報告 など"
              className="bg-input border-border min-h-[100px]"
            />
            <Input type="file" accept="image/*" onChange={(e) => setNewThumbnail(e.target.files?.[0] ?? null)} />
            <Button onClick={handleCreatePost} disabled={posting}>
              投稿
            </Button>
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
