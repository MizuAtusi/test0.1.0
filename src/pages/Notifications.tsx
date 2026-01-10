import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { PlatformShell } from '@/components/navigation/PlatformShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { Profile, FriendRequest, ProfilePost, RoomInvite } from '@/types/trpg';

type NotificationItem = {
  id: string;
  kind:
    | 'friend_request'
    | 'friend_accepted'
    | 'room_request'
    | 'room_approved'
    | 'room_invited'
    | 'room_invite_accepted'
    | 'post_like'
    | 'post_quote'
    | 'post_reply';
  createdAt: string;
  title: string;
  body?: string;
  actorId?: string;
  roomId?: string;
  postId?: string;
  quoteContent?: string;
  replyContent?: string;
};

export default function NotificationsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [profilesById, setProfilesById] = useState<Record<string, Profile>>({});
  const NOTIFICATIONS_LAST_SEEN_KEY = 'trpg:notifications:lastSeen';

  const signOut = async () => {
    try {
      localStorage.removeItem('trpg:devAuth');
    } catch {
      // ignore
    }
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  };

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    let canceled = false;
    (async () => {
      setLoading(true);
      try {
        const userId = user.id;

        const { data: myPosts } = await supabase
          .from('profile_posts')
          .select('id,content,created_at')
          .eq('user_id', userId);
        const myPostRows = (myPosts as any[] | null) || [];
        const myPostIds = myPostRows.map((p) => p.id);
        const postContentById = Object.fromEntries(myPostRows.map((p) => [p.id, p.content]));

        const { data: friendRows } = await supabase
          .from('friend_requests')
          .select('*')
          .or(`receiver_user_id.eq.${userId},requester_user_id.eq.${userId}`)
          .order('created_at', { ascending: false });

        const pendingIncoming = (friendRows as any[] | null)?.filter(
          (r) => r.status === 'pending' && r.receiver_user_id === userId,
        ) || [];
        const acceptedOutgoing = (friendRows as any[] | null)?.filter(
          (r) => r.status === 'accepted' && r.requester_user_id === userId,
        ) || [];

        const { data: roomIncoming } = await supabase
          .from('room_join_requests')
          .select('id,room_id,status,requester_user_id,created_at,rooms(id,name,owner_user_id)')
          .eq('status', 'pending')
          .eq('rooms.owner_user_id', userId);

        const { data: roomApproved } = await supabase
          .from('room_join_requests')
          .select('id,room_id,status,requester_user_id,created_at,rooms(id,name,owner_user_id)')
          .eq('status', 'approved')
          .eq('requester_user_id', userId);

        const { data: roomInvited } = await supabase
          .from('room_invites')
          .select('id,room_id,inviter_user_id,invitee_user_id,status,created_at,rooms(id,name)')
          .eq('status', 'invited')
          .eq('invitee_user_id', userId);

        const { data: roomInviteAccepted } = await supabase
          .from('room_invites')
          .select('id,room_id,inviter_user_id,invitee_user_id,status,updated_at,rooms(id,name)')
          .eq('status', 'accepted')
          .eq('inviter_user_id', userId);

        let likes: any[] = [];
        let quotes: any[] = [];
        let replies: any[] = [];
        if (myPostIds.length > 0) {
          const { data: likeRows } = await supabase
            .from('profile_post_likes')
            .select('id,post_id,user_id,created_at')
            .in('post_id', myPostIds)
            .order('created_at', { ascending: false });
          likes = (likeRows as any[] | null) || [];

          const { data: quoteRows } = await supabase
            .from('profile_posts')
            .select('id,user_id,content,created_at,quoted_post_id')
            .in('quoted_post_id', myPostIds)
            .order('created_at', { ascending: false });
          quotes = (quoteRows as any[] | null) || [];

          const { data: replyRows } = await supabase
            .from('profile_replies')
            .select('id,user_id,content,created_at,post_id')
            .in('post_id', myPostIds)
            .order('created_at', { ascending: false });
          replies = (replyRows as any[] | null) || [];
        }

        const items: NotificationItem[] = [];

        pendingIncoming.forEach((r: FriendRequest) => {
          items.push({
            id: `friend_request:${r.id}`,
            kind: 'friend_request',
            createdAt: r.created_at,
            title: 'フレンド申請が届きました',
            actorId: r.requester_user_id,
          });
        });
        acceptedOutgoing.forEach((r: FriendRequest) => {
          items.push({
            id: `friend_accepted:${r.id}`,
            kind: 'friend_accepted',
            createdAt: r.updated_at,
            title: 'フレンド申請が受諾されました',
            actorId: r.receiver_user_id,
          });
        });

        (roomIncoming as any[] | null)?.forEach((r) => {
          items.push({
            id: `room_request:${r.id}`,
            kind: 'room_request',
            createdAt: r.created_at,
            title: 'ルーム参加申請が届きました',
            actorId: r.requester_user_id,
            roomId: r.room_id,
            body: r.rooms?.name || 'ルーム',
          });
        });

        (roomApproved as any[] | null)?.forEach((r) => {
          items.push({
            id: `room_approved:${r.id}`,
            kind: 'room_approved',
            createdAt: r.created_at,
            title: 'ルーム参加申請が承認されました',
            roomId: r.room_id,
            body: r.rooms?.name || 'ルーム',
          });
        });

        (roomInvited as any[] | null)?.forEach((r: RoomInvite) => {
          items.push({
            id: `room_invited:${r.id}`,
            kind: 'room_invited',
            createdAt: r.created_at,
            title: 'ルームに招待されました',
            actorId: r.inviter_user_id,
            roomId: r.room_id,
            body: (r as any).rooms?.name || 'ルーム',
          });
        });

        (roomInviteAccepted as any[] | null)?.forEach((r: RoomInvite) => {
          items.push({
            id: `room_invite_accepted:${r.id}`,
            kind: 'room_invite_accepted',
            createdAt: (r as any).updated_at || r.created_at,
            title: '招待が承認されました',
            actorId: r.invitee_user_id,
            roomId: r.room_id,
            body: (r as any).rooms?.name || 'ルーム',
          });
        });

        likes.forEach((row) => {
          items.push({
            id: `post_like:${row.id}`,
            kind: 'post_like',
            createdAt: row.created_at,
            title: '投稿にいいねされました',
            actorId: row.user_id,
            postId: row.post_id,
            body: postContentById[row.post_id] || '',
          });
        });

        quotes.forEach((row) => {
          items.push({
            id: `post_quote:${row.id}`,
            kind: 'post_quote',
            createdAt: row.created_at,
            title: '投稿が引用投稿されました',
            actorId: row.user_id,
            postId: row.quoted_post_id,
            quoteContent: row.content,
          });
        });

        replies.forEach((row) => {
          items.push({
            id: `post_reply:${row.id}`,
            kind: 'post_reply',
            createdAt: row.created_at,
            title: '投稿に返信が届きました',
            actorId: row.user_id,
            postId: row.post_id,
            replyContent: row.content,
          });
        });

        const actorIds = Array.from(
          new Set(items.map((i) => i.actorId).filter(Boolean) as string[]),
        );
        if (actorIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id,display_name,handle,avatar_url')
            .in('id', actorIds);
          const map: Record<string, Profile> = {};
          (profiles as any[] | null)?.forEach((p) => {
            if (p?.id) map[p.id] = p as Profile;
          });
          if (!canceled) setProfilesById(map);
        } else if (!canceled) {
          setProfilesById({});
        }

        const sorted = items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
        if (!canceled) setNotifications(sorted);
      } catch (e: any) {
        if (!canceled) {
          toast({ title: '通知の取得に失敗しました', description: String(e?.message || e), variant: 'destructive' });
        }
      } finally {
        if (!canceled) setLoading(false);
      }
    })();
    return () => {
      canceled = true;
    };
  }, [user?.id, toast]);

  useEffect(() => {
    if (loading) return;
    const latest = notifications.reduce<number | null>((max, item) => {
      const ts = Date.parse(item.createdAt);
      if (Number.isNaN(ts)) return max;
      return max === null || ts > max ? ts : max;
    }, null);
    const next = latest ?? Date.now();
    try {
      localStorage.setItem(NOTIFICATIONS_LAST_SEEN_KEY, String(next));
    } catch {
      // ignore
    }
  }, [loading, notifications]);

  const renderActor = (id?: string) => {
    if (!id) return null;
    const actor = profilesById[id];
    if (!actor) return null;
    return (
      <button
        type="button"
        className="text-sm font-semibold text-foreground hover:underline"
        onClick={() => navigate(`/users/${actor.id}`)}
      >
        {actor.display_name || 'ユーザー'} @{actor.handle || 'id'}
      </button>
    );
  };

  const summary = useMemo(() => {
    if (notifications.length === 0) return '通知はありません';
    return `${notifications.length} 件の通知`;
  }, [notifications.length]);

  return (
    <PlatformShell title="通知" onSignOut={signOut}>
      <div className="mx-auto w-full max-w-4xl space-y-4">
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base">通知一覧</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="text-muted-foreground text-sm">読み込み中...</div>
            ) : notifications.length === 0 ? (
              <div className="text-muted-foreground text-sm">{summary}</div>
            ) : (
              notifications.map((n) => (
                <div key={n.id} className="rounded-md border border-border/50 p-3 space-y-2">
                  <div className="text-xs text-muted-foreground">
                    {new Date(n.createdAt).toLocaleString()}
                  </div>
                  <div className="text-sm font-medium">{n.title}</div>
                  {renderActor(n.actorId)}
                  {n.body && (
                    <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {n.body}
                    </div>
                  )}
                  {n.quoteContent && (
                    <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                      引用内容: {n.quoteContent}
                    </div>
                  )}
                  {n.replyContent && (
                    <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                      返信内容: {n.replyContent}
                    </div>
                  )}
                  {n.roomId && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => navigate(`/room/${n.roomId}`)}>
                        ルームへ移動
                      </Button>
                    </div>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </PlatformShell>
  );
}
