export type NpcDisclosureSettings = {
  showStats: boolean;
  showDerived: boolean;
  showSkills: boolean;
  showMemo: boolean;
};

type TableAvailability = 'unknown' | 'missing' | 'available';
const TABLE_KEY = 'trpg:supabaseTable:npc_disclosures';

export function getNpcDisclosuresTableAvailability(): TableAvailability {
  try {
    const raw = localStorage.getItem(TABLE_KEY);
    if (raw === 'missing' || raw === 'available') return raw;
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

export function setNpcDisclosuresTableAvailability(value: TableAvailability) {
  try {
    if (value === 'unknown') localStorage.removeItem(TABLE_KEY);
    else localStorage.setItem(TABLE_KEY, value);
  } catch {
    // ignore
  }
}

const DEFAULT: NpcDisclosureSettings = {
  showStats: false,
  showDerived: false,
  showSkills: false,
  showMemo: false,
};

export function getNpcDisclosureStorageKey(roomId: string, characterId: string) {
  return `trpg:npcDisclosure:${roomId}:${characterId}`;
}

export function loadNpcDisclosure(roomId: string, characterId: string): NpcDisclosureSettings {
  try {
    const raw = localStorage.getItem(getNpcDisclosureStorageKey(roomId, characterId));
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw);
    return {
      showStats: !!parsed?.showStats,
      showDerived: !!parsed?.showDerived,
      showSkills: !!parsed?.showSkills,
      showMemo: !!parsed?.showMemo,
    };
  } catch {
    return DEFAULT;
  }
}

export function saveNpcDisclosure(roomId: string, characterId: string, value: NpcDisclosureSettings) {
  try {
    localStorage.setItem(getNpcDisclosureStorageKey(roomId, characterId), JSON.stringify(value));
  } catch {
    // ignore
  }
  try {
    window.dispatchEvent(new CustomEvent('trpg:npcDisclosureChanged', { detail: { roomId, characterId } }));
  } catch {
    // ignore
  }
}

export function buildNpcDisclosureCommand(characterId: string, value: NpcDisclosureSettings) {
  const s = (b: boolean) => (b ? '1' : '0');
  return `[npc_disclosure:${characterId}:stats=${s(value.showStats)},derived=${s(value.showDerived)},skills=${s(value.showSkills)},memo=${s(value.showMemo)}]`;
}

export function applyNpcDisclosureCommandsFromText(roomId: string, rawText: unknown) {
  if (typeof rawText !== 'string' || !rawText) return;
  const regex = /\[npc_disclosure:([^:\]]+):([^\]]+)\]/gi;
  let match: RegExpExecArray | null = null;
  while ((match = regex.exec(rawText)) !== null) {
    const characterId = String(match[1] ?? '').trim();
    const payload = String(match[2] ?? '').trim();
    if (!characterId || !payload) continue;

    const current = loadNpcDisclosure(roomId, characterId);
    const next: NpcDisclosureSettings = { ...current };

    const parts = payload.split(',');
    for (const p of parts) {
      const [kRaw, vRaw] = p.split('=');
      const k = (kRaw ?? '').trim().toLowerCase();
      const v = (vRaw ?? '').trim();
      const on = v === '1' || v.toLowerCase() === 'true';
      if (k === 'stats') next.showStats = on;
      if (k === 'derived') next.showDerived = on;
      if (k === 'skills') next.showSkills = on;
      if (k === 'memo') next.showMemo = on;
    }

    saveNpcDisclosure(roomId, characterId, next);
  }
}
