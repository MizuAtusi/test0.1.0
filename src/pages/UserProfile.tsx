import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ImagePlus, UserPlus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { MainNav } from '@/components/navigation/MainNav';
import type { Profile, ProfilePost, ProfileReply, FriendRequest } from '@/types/trpg';

export default function UserProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<ProfilePost[]>([]);
  const [replies, setReplies] = useState<ProfileReply[]>([]);
  const [profilesById, setProfilesById] = useState<Record<string, Profile>>({});
  const [friendStatus, setFriendStatus] = useState<FriendRequest | null>(null);
  const [friendsById, setFriendsById] = useState<Record<string, Profile>>({});
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
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
  }, [userId]);

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

    const profileIds = new Set<string>();
    profileIds.add(userId);
    (replyData as any[] | null)?.forEach((r) => {
      if (r?.user_id) profileIds.add(r.user_id);
    });
    const ids = Array.from(profileIds);
    if (ids.length > 0) {
      const { data: profileRows } = await supabase
        .from('profiles')
        .select('id,display_name,handle,avatar_url,bio,created_at')
        .in('id', ids);
      const map: Record<string, Profile> = {};
      (profileRows as any[] | null)?.forEach((p) => {
        if (p?.id) map[p.id] = p as Profile;
      });
      setProfilesById(map);
    }
  };

  useEffect(() => {
    void loadPosts();
  }, [userId]);

  useEffect(() => {
    void loadFriendStatus();
    void loadFriends();
  }, [userId, user?.id]);

  const repliesByPost = useMemo(() => {
    const map = new Map<string, ProfileReply[]>();
    replies.forEach((r) => {
      const list = map.get(r.post_id) || [];
      list.push(r);
      map.set(r.post_id, list);
    });
    return map;
  }, [replies]);

  const loadFriendStatus = async () => {
    if (!user?.id || !userId || user.id === userId) return;
    const { data } = await supabase
      .from('friend_requests')
      .select('*')
      .or(`and(requester_user_id.eq.${user.id},receiver_user_id.eq.${userId}),and(requester_user_id.eq.${userId},receiver_user_id.eq.${user.id})`)
      .maybeSingle();
    setFriendStatus((data as any) || null);
  };

  const loadFriends = async () => {
    if (!userId) return;
    const { data } = await supabase
      .from('friend_requests')
      .select('*')
      .eq('status', 'accepted')
      .or(`requester_user_id.eq.${userId},receiver_user_id.eq.${userId}`);
    const rows = (data as any[]) || [];
    const friendIds = Array.from(
      new Set(
        rows.map((r) => (r.requester_user_id === userId ? r.receiver_user_id : r.requester_user_id))
      )
    );
    if (friendIds.length === 0) {
      setFriendsById({});
      return;
    }
    const { data: friendProfiles } = await supabase
      .from('profiles')
      .select('id,display_name,handle,avatar_url,bio,created_at')
      .in('id', friendIds);
    const map: Record<string, Profile> = {};
    (friendProfiles as any[] | null)?.forEach((p) => {
      if (p?.id) map[p.id] = p as Profile;
    });
    setFriendsById(map);
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

  const handleSendFriendRequest = async () => {
    if (!user?.id || !userId || user.id === userId) return;
    const { error } = await supabase.from('friend_requests').insert({
      requester_user_id: user.id,
      receiver_user_id: userId,
      status: 'pending',
    } as any);
    if (error) {
      toast({ title: 'フレンド申請に失敗しました', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'フレンド申請を送信しました' });
    await loadFriendStatus();
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-2xl text-foreground">ユーザーページ</h1>
          <MainNav />
        </div>

        <Card className="bg-card border-border">
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-start gap-4">
              <div className="h-20 w-20 rounded-full bg-secondary/60 overflow-hidden flex items-center justify-center shrink-0">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="avatar" className="h-full w-full object-cover" />
                ) : (
                  <ImagePlus className="w-7 h-7 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 space-y-2">
                <div className="text-lg font-semibold">{profile?.display_name || 'ユーザー'}</div>
                <div className="text-sm text-muted-foreground">@{profile?.handle || 'id'}</div>
                <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {profile?.bio || '一言メッセージはありません'}
                </div>
                {user?.id && userId && user.id !== userId && (
                  <div className="flex items-center gap-2 pt-2">
                    {friendStatus?.status === 'accepted' ? (
                      <span className="text-xs text-muted-foreground">フレンド</span>
                    ) : friendStatus?.status === 'pending' ? (
                      <span className="text-xs text-muted-foreground">申請中</span>
                    ) : (
                      <Button size="sm" onClick={handleSendFriendRequest}>
                        <UserPlus className="w-4 h-4 mr-2" />
                        フレンド申請
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base">フレンド</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.keys(friendsById).length === 0 ? (
              <div className="text-xs text-muted-foreground">フレンドはまだいません</div>
            ) : (
              Object.values(friendsById).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="w-full flex items-center gap-3 border border-border/50 rounded-md p-2 text-left hover:bg-secondary/30"
                  onClick={() => navigate(`/users/${p.id}`)}
                >
                  <div className="h-10 w-10 rounded-full bg-secondary/60 overflow-hidden flex items-center justify-center shrink-0">
                    {p.avatar_url ? (
                      <img src={p.avatar_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <ImagePlus className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{p.display_name}</div>
                    <div className="text-xs text-muted-foreground">@{p.handle}</div>
                  </div>
                </button>
              ))
            )}
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
              posts.map((p) => {
                const author = profilesById[p.user_id] || profile;
                return (
                  <div key={p.id} className="rounded-md border border-border/50 p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-full bg-secondary/60 overflow-hidden flex items-center justify-center shrink-0">
                        {author?.avatar_url ? (
                          <img src={author.avatar_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <ImagePlus className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-semibold truncate">{author?.display_name || 'ユーザー'}</span>
                          <span className="text-muted-foreground">@{author?.handle || 'id'}</span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(p.created_at).toLocaleString()}
                          </span>
                        </div>
                        <div className="whitespace-pre-wrap text-sm mt-2">{p.content}</div>
                        {p.thumbnail_url && (
                          <img src={p.thumbnail_url} alt="" className="w-full max-h-64 object-cover rounded mt-3" />
                        )}
                      </div>
                    </div>
                    <div className="space-y-2 pt-2">
                      {(repliesByPost.get(p.id) || []).map((r) => {
                        const replyAuthor = profilesById[r.user_id];
                        return (
                          <div key={r.id} className="flex items-start gap-3 border-t border-border/40 pt-3">
                            <div className="h-8 w-8 rounded-full bg-secondary/60 overflow-hidden flex items-center justify-center shrink-0">
                              {replyAuthor?.avatar_url ? (
                                <img src={replyAuthor.avatar_url} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <ImagePlus className="w-3 h-3 text-muted-foreground" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 text-xs">
                                <span className="font-semibold truncate">{replyAuthor?.display_name || 'ユーザー'}</span>
                                <span className="text-muted-foreground">@{replyAuthor?.handle || 'id'}</span>
                                <span className="text-xs text-muted-foreground">
                                  {new Date(r.created_at).toLocaleString()}
                                </span>
                              </div>
                              <div className="text-sm mt-1 whitespace-pre-wrap">{r.content}</div>
                            </div>
                          </div>
                        );
                      })}
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
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
