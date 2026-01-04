import type { SessionData } from '@/types/trpg';

const SESSION_KEY = 'trpg_session';

export function generateSessionId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

export function getSession(): SessionData {
  const stored = localStorage.getItem(SESSION_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      // Invalid stored data, create new session
    }
  }
  
  const newSession: SessionData = {
    sessionId: generateSessionId(),
  };
  saveSession(newSession);
  return newSession;
}

export function saveSession(data: SessionData): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(data));
}

export function clearSession(): void {
  const current = getSession();
  const newSession: SessionData = {
    sessionId: current.sessionId,
  };
  saveSession(newSession);
}

export function hashGMKey(key: string): string {
  // Simple hash for demo purposes
  // In production, use proper hashing on the server
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    const char = key.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `gmkey_${Math.abs(hash).toString(36)}`;
}
