import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ImagePlus, UserPlus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PlatformShell } from '@/components/navigation/PlatformShell';
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
  const [likesByPost, setLikesByPost] = useState<Record<string, number>>({});
  const [likedByMe, setLikedByMe] = useState<Record<string, boolean>>({});
  const [quoteDraft, setQuoteDraft] = useState('');
  const [quoteTargetId, setQuoteTargetId] = useState<string | null>(null);
  const [quotedPostsById, setQuotedPostsById] = useState<Record<string, ProfilePost>>({});
  const [engagementOpen, setEngagementOpen] = useState(false);
  const [engagementLikes, setEngagementLikes] = useState<Profile[]>([]);
  const [engagementQuotes, setEngagementQuotes] = useState<ProfilePost[]>([]);
  const [friendStatus, setFriendStatus] = useState<FriendRequest | null>(null);
  const [friendsById, setFriendsById] = useState<Record<string, Profile>>({});
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!userId) return;
    if (user?.id && userId === user.id) {
      navigate('/me', { replace: true });
      return;
    }
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
  }, [userId, user?.id, navigate]);

  const loadPosts = async () => {
    if (!userId) return;
    const { data: postData, error: postError } = await supabase
      .from('profile_posts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (postError) return;
    const postRows = (postData as any[]) || [];
    setPosts(postRows);

    const postIds = postRows.map((p) => p.id);
    if (postIds.length === 0) {
      setReplies([]);
      setLikesByPost({});
      setLikedByMe({});
      setQuotedPostsById({});
      return;
    }
    const { data: replyData } = await supabase
      .from('profile_replies')
      .select('*')
      .in('post_id', postIds)
      .order('created_at', { ascending: true });
    setReplies((replyData as any) || []);

    const quotedIds = Array.from(
      new Set(postRows.map((p) => p.quoted_post_id).filter(Boolean))
    ) as string[];
    let quotedMap: Record<string, ProfilePost> = {};
    if (quotedIds.length > 0) {
      const { data: quotedRows } = await supabase
        .from('profile_posts')
        .select('*')
        .in('id', quotedIds);
      (quotedRows as any[] | null)?.forEach((row) => {
        if (row?.id) quotedMap[row.id] = row as ProfilePost;
      });
      setQuotedPostsById(quotedMap);
    } else {
      setQuotedPostsById({});
    }

    const { data: likeRows } = await supabase
      .from('profile_post_likes')
      .select('post_id,user_id')
      .in('post_id', postIds);
    const likeCounts: Record<string, number> = {};
    const likedMap: Record<string, boolean> = {};
    (likeRows as any[] | null)?.forEach((row) => {
      if (!row?.post_id) return;
      likeCounts[row.post_id] = (likeCounts[row.post_id] || 0) + 1;
      if (row.user_id === user?.id) likedMap[row.post_id] = true;
    });
    setLikesByPost(likeCounts);
    setLikedByMe(likedMap);

    const profileIds = new Set<string>();
    profileIds.add(userId);
    (replyData as any[] | null)?.forEach((r) => {
      if (r?.user_id) profileIds.add(r.user_id);
    });
    const quotedPostUsers = Object.values(quotedMap).map((p) => p.user_id);
    quotedPostUsers.forEach((id) => profileIds.add(id));
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
      setProfilesById((prev) => ({ ...prev, ...map }));
    }
  };

  useEffect(() => {
    void loadPosts();
  }, [userId, user?.id]);

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

  const handleToggleLike = async (postId: string) => {
    if (!user?.id) return;
    const already = !!likedByMe[postId];
    if (already) {
      const { error } = await supabase
        .from('profile_post_likes')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', user.id);
      if (error) {
        toast({ title: 'いいねの解除に失敗しました', description: error.message, variant: 'destructive' });
        return;
      }
      setLikedByMe((prev) => ({ ...prev, [postId]: false }));
      setLikesByPost((prev) => ({ ...prev, [postId]: Math.max(0, (prev[postId] || 1) - 1) }));
      return;
    }
    const { error } = await supabase.from('profile_post_likes').insert({
      post_id: postId,
      user_id: user.id,
    } as any);
    if (error) {
      toast({ title: 'いいねに失敗しました', description: error.message, variant: 'destructive' });
      return;
    }
    setLikedByMe((prev) => ({ ...prev, [postId]: true }));
    setLikesByPost((prev) => ({ ...prev, [postId]: (prev[postId] || 0) + 1 }));
  };

  const handleOpenQuote = (postId: string) => {
    setQuoteTargetId((prev) => (prev === postId ? null : postId));
    setQuoteDraft('');
  };

  const openEngagement = async (postId: string) => {
    setEngagementOpen(true);
    try {
      const { data: likeRows } = await supabase
        .from('profile_post_likes')
        .select('user_id, created_at')
        .eq('post_id', postId)
        .order('created_at', { ascending: false });
      const likerIds = (likeRows as any[] | null)?.map((l) => l.user_id).filter(Boolean) || [];
      if (likerIds.length) {
        const { data: likerProfiles } = await supabase
          .from('profiles')
          .select('id,display_name,handle,avatar_url')
          .in('id', likerIds);
        setEngagementLikes((likerProfiles as Profile[] | null) || []);
      } else {
        setEngagementLikes([]);
      }

      const { data: quoteRows } = await supabase
        .from('profile_posts')
        .select('id,user_id,content,thumbnail_url,created_at')
        .eq('quoted_post_id', postId)
        .order('created_at', { ascending: false });
      setEngagementQuotes((quoteRows as ProfilePost[] | null) || []);
    } catch (e: any) {
      toast({ title: 'エンゲージメントの取得に失敗しました', description: String(e?.message || e), variant: 'destructive' });
    }
  };

  const handleSubmitQuote = async () => {
    if (!user?.id || !quoteTargetId) return;
    try {
      const { error } = await supabase.from('profile_posts').insert({
        user_id: user.id,
        content: quoteDraft.trim(),
        quoted_post_id: quoteTargetId,
      } as any);
      if (error) throw error;
      setQuoteDraft('');
      setQuoteTargetId(null);
      await loadPosts();
      toast({ title: '引用投稿しました' });
    } catch (e: any) {
      toast({ title: '引用投稿に失敗しました', description: String(e?.message || e), variant: 'destructive' });
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
    <PlatformShell title="ユーザーページ" onSignOut={signOut}>
      <div className="mx-auto w-full max-w-5xl space-y-4">
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
                const quoted = p.quoted_post_id ? quotedPostsById[p.quoted_post_id] : null;
                const quotedAuthor = quoted ? profilesById[quoted.user_id] : null;
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
                        {quoted && (
                          <div className="mt-3 rounded-md border border-border/60 bg-secondary/20 p-3 text-sm">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="font-semibold text-foreground/80">{quotedAuthor?.display_name || 'ユーザー'}</span>
                              <span>@{quotedAuthor?.handle || 'id'}</span>
                              <span>{new Date(quoted.created_at).toLocaleDateString()}</span>
                            </div>
                            <div className="mt-2 whitespace-pre-wrap">{quoted.content}</div>
                            {quoted.thumbnail_url && (
                              <img src={quoted.thumbnail_url} alt="" className="w-full max-h-56 object-cover rounded mt-2" />
                            )}
                          </div>
                        )}
                        <div className="mt-3 flex items-center gap-2 text-xs">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className={likedByMe[p.id] ? 'text-primary' : 'text-muted-foreground'}
                            onClick={() => handleToggleLike(p.id)}
                            disabled={!user?.id}
                          >
                            いいね {likesByPost[p.id] || 0}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="text-muted-foreground"
                            onClick={() => openEngagement(p.id)}
                            disabled={!user?.id}
                          >
                            反応
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="text-muted-foreground"
                            onClick={() => handleOpenQuote(p.id)}
                            disabled={!user?.id}
                          >
                            引用投稿
                          </Button>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2 pt-2">
                      <div className="text-xs text-muted-foreground">返信</div>
                      <div className="space-y-3 border-l border-border/40 pl-4">
                        {(repliesByPost.get(p.id) || []).map((r) => {
                          const replyAuthor = profilesById[r.user_id];
                          return (
                            <div key={r.id} className="flex items-start gap-3">
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
                      </div>
                      {quoteTargetId === p.id && (
                        <div className="rounded-md border border-border/60 bg-secondary/20 p-3 space-y-2">
                          <Textarea
                            value={quoteDraft}
                            onChange={(e) => setQuoteDraft(e.target.value)}
                            placeholder="引用投稿にコメント（任意）"
                            className="bg-input border-border min-h-[80px]"
                          />
                          <div className="flex gap-2">
                            <Button onClick={handleSubmitQuote}>引用して投稿</Button>
                            <Button variant="outline" onClick={() => handleOpenQuote(p.id)}>
                              キャンセル
                            </Button>
                          </div>
                        </div>
                      )}
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

        <Dialog open={engagementOpen} onOpenChange={setEngagementOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>投稿のエンゲージメント</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="text-sm font-semibold">いいね</div>
                {engagementLikes.length === 0 ? (
                  <div className="text-xs text-muted-foreground">まだありません</div>
                ) : (
                  <div className="space-y-2">
                    {engagementLikes.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="flex items-center gap-2 text-sm"
                        onClick={() => navigate(`/users/${p.id}`)}
                      >
                        <div className="h-6 w-6 rounded-full bg-secondary/60 overflow-hidden flex items-center justify-center shrink-0">
                          {p.avatar_url ? (
                            <img src={p.avatar_url} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <ImagePlus className="w-3 h-3 text-muted-foreground" />
                          )}
                        </div>
                        <span className="font-semibold">{p.display_name || 'ユーザー'}</span>
                        <span className="text-xs text-muted-foreground">@{p.handle || 'id'}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <div className="text-sm font-semibold">引用投稿</div>
                {engagementQuotes.length === 0 ? (
                  <div className="text-xs text-muted-foreground">まだありません</div>
                ) : (
                  <div className="space-y-3">
                    {engagementQuotes.map((q) => {
                      const author = profilesById[q.user_id];
                      return (
                        <div key={q.id} className="rounded-md border border-border/50 p-3 text-sm">
                          <button
                            type="button"
                            className="font-semibold hover:underline"
                            onClick={() => navigate(`/users/${q.user_id}`)}
                          >
                            {author?.display_name || 'ユーザー'} @{author?.handle || 'id'}
                          </button>
                          <div className="mt-2 whitespace-pre-wrap">{q.content}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </PlatformShell>
  );
}
