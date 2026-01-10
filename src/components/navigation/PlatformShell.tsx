import type { ReactNode } from 'react';
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

type PlatformShellProps = {
  title: string;
  onSignOut: () => void;
  children: ReactNode;
};

export function PlatformShell({ title, onSignOut, children }: PlatformShellProps) {
  const menuButtonClass = 'text-xl py-4 leading-none [&>svg]:size-8';

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader className="gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-sidebar-foreground/70">
              MENU
            </span>
            <SidebarTrigger className="h-10 w-10" />
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
              <SidebarMenuButton asChild tooltip="通知" size="lg" className={menuButtonClass}>
                <NavLink
                  to="/notifications"
                  className={({ isActive }) =>
                    cn(isActive && 'bg-sidebar-accent text-sidebar-accent-foreground')
                  }
                >
                  <Bell />
                  <span>通知</span>
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
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-card px-4 py-3 pointer-events-auto">
          <SidebarTrigger className="h-10 w-10 relative z-30 pointer-events-auto" />
          <h1 className="font-display text-2xl text-foreground">{title}</h1>
        </header>
        <div className="flex-1 bg-background p-4">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
