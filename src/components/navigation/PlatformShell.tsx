import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { Globe, Home, LogOut, User } from 'lucide-react';
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
  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader className="gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-sidebar-foreground/70">
              MENU
            </span>
            <SidebarTrigger />
          </div>
        </SidebarHeader>
        <SidebarSeparator />
        <SidebarContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="ルームで遊ぶ">
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
              <SidebarMenuButton asChild tooltip="みんなのルーム">
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
              <SidebarMenuButton asChild tooltip="マイページ">
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
              <SidebarMenuButton onClick={onSignOut} tooltip="ログアウト">
                <LogOut />
                <span>ログアウト</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        <header className="flex items-center gap-3 border-b border-border bg-card px-4 py-3">
          <SidebarTrigger className="md:hidden" />
          <h1 className="font-display text-2xl text-foreground">{title}</h1>
        </header>
        <div className="flex-1 bg-background p-4">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
