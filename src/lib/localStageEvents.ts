import type { ActivePortrait } from '@/types/trpg';

export type LocalStageEvent =
  | { timestamp: string; type: 'background'; data: { url: string | null } }
  | { timestamp: string; type: 'portraits'; data: { portraits: ActivePortrait[] } }
  | { timestamp: string; type: 'secret'; data: { isSecret?: boolean; secretAllowList?: string[] } };

const STORAGE_PREFIX = 'trpg:stageEventsLocal:';
const MAX_EVENTS = 2000;

export function loadLocalStageEvents(roomId: string): LocalStageEvent[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${roomId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as LocalStageEvent[]) : [];
  } catch {
    return [];
  }
}

export function appendLocalStageEvent(roomId: string, event: LocalStageEvent) {
  try {
    const events = loadLocalStageEvents(roomId);
    events.push(event);
    // keep bounded
    if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
    localStorage.setItem(`${STORAGE_PREFIX}${roomId}`, JSON.stringify(events));
  } catch {
    // ignore
  }
}

export function clearLocalStageEvents(roomId: string) {
  try {
    localStorage.removeItem(`${STORAGE_PREFIX}${roomId}`);
  } catch {
    // ignore
  }
}

