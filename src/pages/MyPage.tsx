import { useEffect, useMemo, useState } from 'react';
import { ImagePlus, LogOut } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { uploadFile } from '@/lib/upload';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { MainNav } from '@/components/navigation/MainNav';
import { useNavigate } from 'react-router-dom';
import type { Profile, ProfilePost, ProfileReply, FriendRequest } from '@/types/trpg';

export default function MyPage() {
  const { user, isDevAuth } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [handle, setHandle] = useState('');
  const [bio, setBio] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [handleInput, setHandleInput] = useState('');
  const [handlePassword, setHandlePassword] = useState('');
  const [updatingHandle, setUpdatingHandle] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [idEditConfirmOpen, setIdEditConfirmOpen] = useState(false);
  const [idEditUnlocked, setIdEditUnlocked] = useState(false);
  const [idEditVerifying, setIdEditVerifying] = useState(false);

  const [posts, setPosts] = useState<ProfilePost[]>([]);
  const [replies, setReplies] = useState<ProfileReply[]>([]);
  const [profilesById, setProfilesById] = useState<Record<string, Profile>>({});
  const [newPost, setNewPost] = useState('');
  const [newThumbnail, setNewThumbnail] = useState<File | null>(null);
  const [posting, setPosting] = useState(false);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [likesByPost, setLikesByPost] = useState<Record<string, number>>({});
  const [likedByMe, setLikedByMe] = useState<Record<string, boolean>>({});
  const [quoteDraft, setQuoteDraft] = useState('');
  const [quoteTargetId, setQuoteTargetId] = useState<string | null>(null);
  const [quotedPostsById, setQuotedPostsById] = useState<Record<string, ProfilePost>>({});
  const [friendHandle, setFriendHandle] = useState('');
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [friendsById, setFriendsById] = useState<Record<string, Profile>>({});
  const [showFriends, setShowFriends] = useState(false);
  const [showFriendSearch, setShowFriendSearch] = useState(false);

  const resetProfileInputs = (source: Profile | null) => {
    setDisplayName(source?.display_name || '');
    setBio(source?.bio || '');
    setAvatarFile(null);
  };

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
      setHandle((data as any)?.handle || '');
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
      if (row.user_id === user.id) likedMap[row.post_id] = true;
    });
    setLikesByPost(likeCounts);
    setLikedByMe(likedMap);

    const profileIds = new Set<string>();
    profileIds.add(user.id);
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
    void loadFriends();
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

  const loadFriends = async () => {
    if (!user?.id) return;
    const { data: reqs, error } = await supabase
      .from('friend_requests')
      .select('*')
      .or(`requester_user_id.eq.${user.id},receiver_user_id.eq.${user.id}`);
    if (error) return;
    const rows = (reqs as any[]) || [];
    setFriendRequests(rows as FriendRequest[]);
    const relatedIds = new Set<string>();
    rows.forEach((r) => {
      if (r.requester_user_id) relatedIds.add(r.requester_user_id);
      if (r.receiver_user_id) relatedIds.add(r.receiver_user_id);
    });
    const accepted = rows.filter((r) => r.status === 'accepted');
    const friendIds = Array.from(
      new Set(
        accepted.map((r) => (r.requester_user_id === user.id ? r.receiver_user_id : r.requester_user_id))
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

    const allIds = Array.from(relatedIds);
    if (allIds.length > 0) {
      const { data: relatedProfiles } = await supabase
        .from('profiles')
        .select('id,display_name,handle,avatar_url,bio,created_at')
        .in('id', allIds);
      const map: Record<string, Profile> = {};
      (relatedProfiles as any[] | null)?.forEach((p) => {
        if (p?.id) map[p.id] = p as Profile;
      });
      setProfilesById((prev) => ({ ...prev, ...map }));
    }
  };

  const handleSaveProfile = async () => {
    if (!user?.id) return;
    if (!editingProfile) return;
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
      setEditingProfile(false);
    } catch (e: any) {
      toast({ title: '更新に失敗しました', description: String(e?.message || e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleCancelProfileEdit = () => {
    resetProfileInputs(profile);
    setHandleInput('');
    setHandlePassword('');
    setIdEditUnlocked(false);
    setEditingProfile(false);
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

  const handleSubmitQuote = async () => {
    if (!user?.id || !quoteTargetId) return;
    setPosting(true);
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
    } finally {
      setPosting(false);
    }
  };

  const handleUpdateHandle = async () => {
    if (!user?.id || !user.email) {
      toast({ title: 'ID変更にはメールログインが必要です', variant: 'destructive' });
      return;
    }
    if (!editingProfile) return;
    if (!idEditUnlocked) {
      toast({ title: 'IDの編集を開始してください', variant: 'destructive' });
      return;
    }
    const next = handleInput.trim().toLowerCase();
    if (!next) {
      toast({ title: 'IDを入力してください', variant: 'destructive' });
      return;
    }
    if (!/^[a-z0-9_]+$/.test(next)) {
      toast({ title: 'IDは英数字と_のみ利用できます', variant: 'destructive' });
      return;
    }
    if (next !== handle) {
      const { data: existing, error: checkError } = await supabase
        .from('profiles')
        .select('id')
        .eq('handle', next)
        .maybeSingle();
      if (checkError) {
        toast({ title: 'IDの確認に失敗しました', description: checkError.message, variant: 'destructive' });
        return;
      }
      if (existing?.id && existing.id !== user.id) {
        toast({ title: 'そのIDはすでに使われています', variant: 'destructive' });
        return;
      }
    }
    setUpdatingHandle(true);
    try {
      const { error } = await supabase.from('profiles').update({ handle: next } as any).eq('id', user.id);
      if (error) throw error;
      setHandle(next);
      setProfile((p) => (p ? { ...p, handle: next } : p));
      setHandleInput('');
      setIdEditUnlocked(false);
      toast({ title: 'IDを更新しました' });
    } catch (e: any) {
      toast({ title: 'ID更新に失敗しました', description: String(e?.message || e), variant: 'destructive' });
    } finally {
      setUpdatingHandle(false);
    }
  };

  const handleSendFriendRequest = async () => {
    if (!user?.id) return;
    const targetHandle = friendHandle.trim().toLowerCase();
    if (!targetHandle) {
      toast({ title: 'IDを入力してください', variant: 'destructive' });
      return;
    }
    if (targetHandle === handle) {
      toast({ title: '自分自身には送信できません', variant: 'destructive' });
      return;
    }
    const { data: target } = await supabase
      .from('profiles')
      .select('id,handle,display_name')
      .eq('handle', targetHandle)
      .maybeSingle();
    if (!target?.id) {
      toast({ title: 'ユーザーが見つかりません', variant: 'destructive' });
      return;
    }
    const { error } = await supabase.from('friend_requests').insert({
      requester_user_id: user.id,
      receiver_user_id: target.id,
      status: 'pending',
    } as any);
    if (error) {
      toast({ title: 'フレンド申請に失敗しました', description: error.message, variant: 'destructive' });
      return;
    }
    setFriendHandle('');
    toast({ title: 'フレンド申請を送信しました' });
    void loadFriends();
  };

  const handleRespondFriend = async (req: FriendRequest, status: 'accepted' | 'rejected') => {
    const { error } = await supabase
      .from('friend_requests')
      .update({ status, updated_at: new Date().toISOString() } as any)
      .eq('id', req.id);
    if (error) {
      toast({ title: '更新に失敗しました', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: status === 'accepted' ? 'フレンドになりました' : '申請を拒否しました' });
    void loadFriends();
  };

  const handleCancelFriend = async (req: FriendRequest) => {
    const { error } = await supabase.from('friend_requests').delete().eq('id', req.id);
    if (error) {
      toast({ title: '取り消しに失敗しました', description: error.message, variant: 'destructive' });
      return;
    }
    void loadFriends();
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

  const handleConfirmIdEdit = async () => {
    if (!handlePassword) {
      toast({ title: 'パスワードを入力してください', variant: 'destructive' });
      return;
    }
    if (!user?.id || !user.email) {
      toast({ title: 'ID変更にはメールログインが必要です', variant: 'destructive' });
      return;
    }
    setIdEditVerifying(true);
    try {
      if (isDevAuth) {
        if (handlePassword !== 'test') {
          toast({ title: 'パスワードが違います', variant: 'destructive' });
          return;
        }
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: user.email,
          password: handlePassword,
        });
        if (authError) throw authError;
      }
      setHandleInput(handle);
      setIdEditUnlocked(true);
      setIdEditConfirmOpen(false);
    } catch (e: any) {
      toast({ title: 'パスワード確認に失敗しました', description: String(e?.message || e), variant: 'destructive' });
    } finally {
      setIdEditVerifying(false);
    }
  };

  const incomingRequests = friendRequests.filter((r) => r.status === 'pending' && r.receiver_user_id === user?.id);
  const outgoingRequests = friendRequests.filter((r) => r.status === 'pending' && r.requester_user_id === user?.id);
  const friendsList = Object.values(friendsById);

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
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">プロフィール</CardTitle>
            {editingProfile ? (
              <div className="flex items-center gap-2">
                <Button onClick={handleSaveProfile} disabled={saving}>
                  保存
                </Button>
                <Button variant="outline" onClick={handleCancelProfileEdit} disabled={saving}>
                  キャンセル
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                onClick={() => {
                  setEditingProfile(true);
                  setHandleInput(handle);
                }}
              >
                プロフィールを編集
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="h-20 w-20 rounded-full bg-secondary/60 overflow-hidden flex items-center justify-center shrink-0">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="avatar" className="h-full w-full object-cover" />
                ) : (
                  <ImagePlus className="w-7 h-7 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 space-y-2">
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="ユーザー名"
                  className="bg-input border-border"
                  disabled={!editingProfile}
                />
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>@{handle || 'id'}</span>
                  {editingProfile && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-xs"
                      onClick={() => setIdEditConfirmOpen(true)}
                    >
                      IDを編集
                    </Button>
                  )}
                </div>
                <Textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="一言メッセージ"
                  className="bg-input border-border min-h-[90px]"
                  disabled={!editingProfile}
                />
                {editingProfile && (
                  <div className="space-y-2">
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)}
                    />
                    {idEditUnlocked && (
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground">新しいID（英数字と_のみ）</div>
                        <div className="flex gap-2">
                          <Input
                            value={handleInput}
                            onChange={(e) => setHandleInput(e.target.value)}
                            placeholder="新しいID"
                            className="bg-input border-border"
                          />
                          <Button onClick={handleUpdateHandle} disabled={updatingHandle}>
                            IDを更新
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Dialog open={idEditConfirmOpen} onOpenChange={setIdEditConfirmOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>IDを編集しますか？</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">
                IDの変更にはパスワード確認が必要です。
              </div>
              <Input
                type="password"
                value={handlePassword}
                onChange={(e) => setHandlePassword(e.target.value)}
                placeholder="パスワード"
                className="bg-input border-border"
              />
            </div>
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setIdEditConfirmOpen(false);
                }}
              >
                いいえ
              </Button>
              <Button
                onClick={handleConfirmIdEdit}
                disabled={idEditVerifying}
              >
                はい
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">フレンド</CardTitle>
            <Button
              variant="outline"
              onClick={() =>
                setShowFriends((prev) => {
                  if (prev) setShowFriendSearch(false);
                  return !prev;
                })
              }
            >
              {showFriends ? '閉じる' : 'フレンド一覧を開く'}
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {!showFriends ? (
              <div className="text-xs text-muted-foreground">
                フレンド {friendsList.length} / 承認待ち {incomingRequests.length}
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => setShowFriendSearch((prev) => !prev)}
                  >
                    フレンドを探す
                  </Button>
                  {showFriendSearch && (
                    <>
                      <Input
                        value={friendHandle}
                        onChange={(e) => setFriendHandle(e.target.value)}
                        placeholder="相手のIDで検索"
                        className="bg-input border-border"
                      />
                      <Button onClick={handleSendFriendRequest}>申請</Button>
                    </>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">承認待ち（あなた宛）</div>
                  {incomingRequests.length === 0 ? (
                    <div className="text-xs text-muted-foreground">ありません</div>
                  ) : (
                    incomingRequests.map((r) => {
                      const p = profilesById[r.requester_user_id];
                      return (
                        <div key={r.id} className="flex items-center justify-between gap-2 border border-border/50 rounded-md p-2">
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">{p?.display_name || 'ユーザー'}</div>
                            <div className="text-xs text-muted-foreground">@{p?.handle || 'id'}</div>
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => handleRespondFriend(r, 'accepted')}>承認</Button>
                            <Button size="sm" variant="outline" onClick={() => handleRespondFriend(r, 'rejected')}>拒否</Button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">申請中</div>
                  {outgoingRequests.length === 0 ? (
                    <div className="text-xs text-muted-foreground">ありません</div>
                  ) : (
                    outgoingRequests.map((r) => {
                      const p = profilesById[r.receiver_user_id];
                      return (
                        <div key={r.id} className="flex items-center justify-between gap-2 border border-border/50 rounded-md p-2">
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">{p?.display_name || 'ユーザー'}</div>
                            <div className="text-xs text-muted-foreground">@{p?.handle || 'id'}</div>
                          </div>
                          <Button size="sm" variant="outline" onClick={() => handleCancelFriend(r)}>取り消し</Button>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">フレンド一覧</div>
                  {friendsList.length === 0 ? (
                    <div className="text-xs text-muted-foreground">まだフレンドがいません</div>
                  ) : (
                    friendsList.map((p) => (
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
                </div>
              </>
            )}
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
              placeholder="いまどうしてる？"
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
                          >
                            いいね {likesByPost[p.id] || 0}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="text-muted-foreground"
                            onClick={() => handleOpenQuote(p.id)}
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
                            <Button onClick={handleSubmitQuote} disabled={posting}>
                              引用して投稿
                            </Button>
                            <Button variant="outline" onClick={() => handleOpenQuote(p.id)} disabled={posting}>
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
      </div>
    </div>
  );
}
