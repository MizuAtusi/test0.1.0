import { useEffect, useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { Bell, Globe, Home, LogOut, User } from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

type PlatformShellProps = {
  title: string;
  onSignOut: () => void;
  children: ReactNode;
};

export function PlatformShell({ title, onSignOut, children }: PlatformShellProps) {
  const { user } = useAuth();
  const [hasUnreadNotifications, setHasUnreadNotifications] = useState(false);
  const menuButtonClass = 'text-2xl py-5 leading-none [&>svg]:size-10';
  const defaultOpen = (() => {
    if (typeof document === 'undefined') return true;
    const match = document.cookie
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith('sidebar:state='));
    if (!match) return true;
    return match.split('=')[1] !== 'false';
  })();
  const NOTIFICATIONS_LAST_SEEN_KEY = 'trpg:notifications:lastSeen';

  useEffect(() => {
    if (!user?.id) {
      setHasUnreadNotifications(false);
      return;
    }
    let canceled = false;
    const parseTime = (value?: string | null) => {
      if (!value) return 0;
      const ts = Date.parse(value);
      return Number.isNaN(ts) ? 0 : ts;
    };
    const lastSeen = (() => {
      try {
        const raw = localStorage.getItem(NOTIFICATIONS_LAST_SEEN_KEY);
        const parsed = raw ? Number(raw) : 0;
        return Number.isFinite(parsed) ? parsed : 0;
      } catch {
        return 0;
      }
    })();

    (async () => {
      let latest = 0;
      const userId = user.id;

      const { data: pendingFriend } = await supabase
        .from('friend_requests')
        .select('created_at')
        .eq('status', 'pending')
        .eq('receiver_user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1);
      latest = Math.max(latest, parseTime((pendingFriend as any[] | null)?.[0]?.created_at));

      const { data: acceptedFriend } = await supabase
        .from('friend_requests')
        .select('updated_at')
        .eq('status', 'accepted')
        .eq('requester_user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(1);
      latest = Math.max(latest, parseTime((acceptedFriend as any[] | null)?.[0]?.updated_at));

      const { data: roomIncoming } = await supabase
        .from('room_join_requests')
        .select('created_at,rooms(owner_user_id)')
        .eq('status', 'pending')
        .eq('rooms.owner_user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1);
      latest = Math.max(latest, parseTime((roomIncoming as any[] | null)?.[0]?.created_at));

      const { data: roomApproved } = await supabase
        .from('room_join_requests')
        .select('updated_at')
        .eq('status', 'approved')
        .eq('requester_user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(1);
      latest = Math.max(latest, parseTime((roomApproved as any[] | null)?.[0]?.updated_at));

      const { data: roomInvited } = await supabase
        .from('room_invites')
        .select('created_at')
        .eq('status', 'invited')
        .eq('invitee_user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1);
      latest = Math.max(latest, parseTime((roomInvited as any[] | null)?.[0]?.created_at));

      const { data: roomInviteAccepted } = await supabase
        .from('room_invites')
        .select('updated_at')
        .eq('status', 'accepted')
        .eq('inviter_user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(1);
      latest = Math.max(latest, parseTime((roomInviteAccepted as any[] | null)?.[0]?.updated_at));

      const { data: myPosts } = await supabase
        .from('profile_posts')
        .select('id')
        .eq('user_id', userId);
      const myPostIds = (myPosts as any[] | null)?.map((p) => p.id) || [];
      if (myPostIds.length > 0) {
        const { data: likeRows } = await supabase
          .from('profile_post_likes')
          .select('created_at')
          .in('post_id', myPostIds)
          .order('created_at', { ascending: false })
          .limit(1);
        latest = Math.max(latest, parseTime((likeRows as any[] | null)?.[0]?.created_at));

        const { data: quoteRows } = await supabase
          .from('profile_posts')
          .select('created_at')
          .in('quoted_post_id', myPostIds)
          .order('created_at', { ascending: false })
          .limit(1);
        latest = Math.max(latest, parseTime((quoteRows as any[] | null)?.[0]?.created_at));

        const { data: replyRows } = await supabase
          .from('profile_replies')
          .select('created_at')
          .in('post_id', myPostIds)
          .order('created_at', { ascending: false })
          .limit(1);
        latest = Math.max(latest, parseTime((replyRows as any[] | null)?.[0]?.created_at));
      }

      if (!canceled) setHasUnreadNotifications(latest > lastSeen);
    })();

    return () => {
      canceled = true;
    };
  }, [user?.id]);

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <Sidebar collapsible="icon">
        <SidebarHeader className="gap-2 px-2">
          <div className="flex items-center justify-end">
            <SidebarTrigger className="h-16 w-16 [&>svg]:size-9" />
          </div>
        </SidebarHeader>
        <SidebarSeparator />
        <SidebarContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="ルームで遊ぶ" size="lg" className={menuButtonClass}>
                <NavLink
                  to="/"
                  end
                  className={({ isActive }) =>
                    cn(isActive && 'bg-sidebar-accent text-sidebar-accent-foreground')
                  }
                >
                  <Home />
                  <span>ルームで遊ぶ</span>
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="みんなのルーム" size="lg" className={menuButtonClass}>
                <NavLink
                  to="/rooms"
                  className={({ isActive }) =>
                    cn(isActive && 'bg-sidebar-accent text-sidebar-accent-foreground')
                  }
                >
                  <Globe />
                  <span>みんなのルーム</span>
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="通知" size="lg" className={cn(menuButtonClass, 'relative')}>
                <NavLink
                  to="/notifications"
                  className={({ isActive }) =>
                    cn(isActive && 'bg-sidebar-accent text-sidebar-accent-foreground')
                  }
                >
                  <Bell />
                  <span>通知</span>
                  {hasUnreadNotifications && (
                    <span className="absolute right-3 top-3 h-2.5 w-2.5 rounded-full bg-destructive" />
                  )}
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="マイページ" size="lg" className={menuButtonClass}>
                <NavLink
                  to="/me"
                  className={({ isActive }) =>
                    cn(isActive && 'bg-sidebar-accent text-sidebar-accent-foreground')
                  }
                >
                  <User />
                  <span>マイページ</span>
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={onSignOut} tooltip="ログアウト" size="lg" className={menuButtonClass}>
                <LogOut />
                <span>ログアウト</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-card px-4 py-3">
          <h1 className="font-display text-2xl text-foreground">{title}</h1>
        </header>
        <div className="flex-1 bg-background p-4">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
