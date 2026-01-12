import { NavLink } from 'react-router-dom';
import { Home, Globe, User } from 'lucide-react';
import { cn } from '@/lib/utils';

export function MainNav() {
  const baseClass =
    'flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors';
  const activeClass = 'bg-accent text-accent-foreground';
  const inactiveClass = 'text-muted-foreground hover:text-foreground hover:bg-secondary/60';

  return (
    <nav className="flex items-center gap-2">
      <NavLink
        to="/app"
        end
        className={({ isActive }) => cn(baseClass, isActive ? activeClass : inactiveClass)}
      >
        <Home className="w-4 h-4" />
        ルームで遊ぶ
      </NavLink>
      <NavLink
        to="/rooms"
        className={({ isActive }) => cn(baseClass, isActive ? activeClass : inactiveClass)}
      >
        <Globe className="w-4 h-4" />
        みんなのルーム
      </NavLink>
      <NavLink
        to="/me"
        className={({ isActive }) => cn(baseClass, isActive ? activeClass : inactiveClass)}
      >
        <User className="w-4 h-4" />
        マイページ
      </NavLink>
    </nav>
  );
}
