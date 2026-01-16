export type PortraitPosition = 'left' | 'center' | 'right';

export type PortraitTransformRel = {
  scale: number; // dimensionless
  x: number; // relative to stage width (e.g. 0.1 = 10% of width)
  y: number; // relative to stage height
  rectX?: number; // normalized top-left X
  rectY?: number; // normalized top-left Y
  rectW?: number; // normalized width
  rectH?: number; // normalized height
  topFromBottom?: number; // relative to stage height (0 = bottom, 1 = top)
  bottomFromBottom?: number; // relative to stage height (0 = bottom, 1 = top)
};

export type PortraitTransformSet = Record<PortraitPosition, PortraitTransformRel>;

const STORAGE_PREFIX = 'trpg:portraitTransformRel:'; // roomId:characterId:key
// Design-time stage size (16:9). Used only to migrate older px-based stored values.
const STAGE_BASE_WIDTH = 1200;
const STAGE_BASE_HEIGHT = 675;

function clampNumber(value: unknown, fallback: number) {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toOptionalNumber(value: unknown) {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function normalizeKey(key: string) {
  return String(key || '').trim().toLowerCase();
}

function normalizeRelMaybe(value: number, axis: 'x' | 'y') {
  // If an older build stored pixel offsets into the rel field, convert assuming the base stage size.
  // Heuristic: rel offsets usually sit within [-1, 1], while px offsets are much larger.
  if (Math.abs(value) > 2) {
    return axis === 'x' ? value / STAGE_BASE_WIDTH : value / STAGE_BASE_HEIGHT;
  }
  return value;
}

function normalizeSet(set: PortraitTransformSet): PortraitTransformSet {
  const norm = (t: PortraitTransformRel): PortraitTransformRel => ({
    scale: clampNumber(t.scale, 1),
    x: normalizeRelMaybe(clampNumber(t.x, 0), 'x'),
    y: normalizeRelMaybe(clampNumber(t.y, 0), 'y'),
    rectX: toOptionalNumber(t.rectX),
    rectY: toOptionalNumber(t.rectY),
    rectW: toOptionalNumber(t.rectW),
    rectH: toOptionalNumber(t.rectH),
    topFromBottom: toOptionalNumber(t.topFromBottom),
    bottomFromBottom: toOptionalNumber(t.bottomFromBottom),
  });
  return {
    left: norm(set.left),
    center: norm(set.center),
    right: norm(set.right),
  };
}

export function getPortraitTransformStorageKey(roomId: string, characterId: string, key: string) {
  return `${STORAGE_PREFIX}${roomId}:${characterId}:${normalizeKey(key)}`;
}

export function loadPortraitTransformSet(roomId: string, characterId: string, key: string): PortraitTransformSet | null {
  const normalized = normalizeKey(key);
  if (!roomId || !characterId || !normalized) return null;
  try {
    const raw = localStorage.getItem(getPortraitTransformStorageKey(roomId, characterId, normalized));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as any;
    const norm = (x: any): PortraitTransformRel => ({
      scale: clampNumber(x?.scale, 1),
      x: normalizeRelMaybe(clampNumber(x?.x, 0), 'x'),
      y: normalizeRelMaybe(clampNumber(x?.y, 0), 'y'),
      rectX: toOptionalNumber(x?.rectX),
      rectY: toOptionalNumber(x?.rectY),
      rectW: toOptionalNumber(x?.rectW),
      rectH: toOptionalNumber(x?.rectH),
      topFromBottom: toOptionalNumber(x?.topFromBottom),
      bottomFromBottom: toOptionalNumber(x?.bottomFromBottom),
    });
    return {
      left: norm(parsed?.left),
      center: norm(parsed?.center),
      right: norm(parsed?.right),
    };
  } catch {
    return null;
  }
}

export function savePortraitTransformSet(roomId: string, characterId: string, key: string, set: PortraitTransformSet) {
  const normalized = normalizeKey(key);
  if (!roomId || !characterId || !normalized) return;
  try {
    localStorage.setItem(
      getPortraitTransformStorageKey(roomId, characterId, normalized),
      JSON.stringify(normalizeSet(set))
    );
  } catch {
    // ignore
  }
}

export function getPortraitTransformRel(params: {
  roomId: string;
  characterId: string;
  key: string;
  position: PortraitPosition;
}): PortraitTransformRel | null {
  const set = loadPortraitTransformSet(params.roomId, params.characterId, params.key);
  return set ? set[params.position] : null;
}

function encodeBase64Utf8(text: string) {
  try {
    // eslint-disable-next-line no-undef
    return btoa(unescape(encodeURIComponent(text)));
  } catch {
    return '';
  }
}

function decodeBase64Utf8(base64: string) {
  try {
    // eslint-disable-next-line no-undef
    return decodeURIComponent(escape(atob(base64)));
  } catch {
    return '';
  }
}

export function buildPortraitTransformCommand(params: {
  characterId: string;
  key: string;
  set: PortraitTransformSet;
}) {
  const payload = encodeBase64Utf8(JSON.stringify(params.set));
  if (!payload) return '';
  const key = normalizeKey(params.key);
  if (!key) return '';
  return `[portrait_transform:${params.characterId}:${key}:${payload}]`;
}

export function applyPortraitTransformCommandsFromText(roomId: string, rawText: unknown) {
  if (typeof rawText !== 'string' || !rawText || !roomId) return;
  const regex = /\[portrait_transform:([^:\]]+):([^:\]]+):([A-Za-z0-9+/=]+)\]/gi;
  let match: RegExpExecArray | null = null;
  while ((match = regex.exec(rawText)) !== null) {
    const characterId = String(match[1] ?? '').trim();
    const key = String(match[2] ?? '').trim();
    const payload = String(match[3] ?? '').trim();
    if (!characterId || !key || !payload) continue;
    const decoded = decodeBase64Utf8(payload);
    if (!decoded) continue;
    try {
      const parsed = JSON.parse(decoded) as any;
      const norm = (x: any): PortraitTransformRel => ({
        scale: clampNumber(x?.scale, 1),
        x: normalizeRelMaybe(clampNumber(x?.x, 0), 'x'),
        y: normalizeRelMaybe(clampNumber(x?.y, 0), 'y'),
        rectX: toOptionalNumber(x?.rectX),
        rectY: toOptionalNumber(x?.rectY),
        rectW: toOptionalNumber(x?.rectW),
        rectH: toOptionalNumber(x?.rectH),
        topFromBottom: toOptionalNumber(x?.topFromBottom),
        bottomFromBottom: toOptionalNumber(x?.bottomFromBottom),
      });
      const set: PortraitTransformSet = {
        left: norm(parsed?.left),
        center: norm(parsed?.center),
        right: norm(parsed?.right),
      };
      savePortraitTransformSet(roomId, characterId, key, set);
      try {
        window.dispatchEvent(new CustomEvent('trpg:portraitTransformChanged', { detail: { roomId, characterId, key } }));
      } catch {
        // ignore
      }
    } catch {
      // ignore
    }
  }
}
