export type PortraitTransform = {
  scale: number;
  offsetX: number;
  offsetY: number;
};

const STORAGE_PREFIX = 'trpg:portraitTransforms:';

function clampNumber(value: unknown, fallback: number) {
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export function loadPortraitTransformMap(characterId: string): Record<string, PortraitTransform> {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${characterId}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Partial<PortraitTransform>>;
    const out: Record<string, PortraitTransform> = {};
    for (const [key, value] of Object.entries(parsed)) {
      const normalizedKey = key.trim().toLowerCase();
      if (!normalizedKey) continue;
      out[normalizedKey] = {
        scale: clampNumber(value?.scale, 1),
        offsetX: Math.trunc(clampNumber(value?.offsetX, 0)),
        offsetY: Math.trunc(clampNumber(value?.offsetY, 0)),
      };
    }
    return out;
  } catch {
    return {};
  }
}

export function savePortraitTransformMap(characterId: string, map: Record<string, PortraitTransform>) {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${characterId}`, JSON.stringify(map));
  } catch {
    // ignore storage failures
  }
}

export function setPortraitTransform(
  characterId: string,
  key: string,
  transform: PortraitTransform,
) {
  const normalizedKey = key.trim().toLowerCase();
  if (!normalizedKey) return;
  const map = loadPortraitTransformMap(characterId);
  map[normalizedKey] = {
    scale: clampNumber(transform.scale, 1),
    offsetX: Math.trunc(clampNumber(transform.offsetX, 0)),
    offsetY: Math.trunc(clampNumber(transform.offsetY, 0)),
  };
  savePortraitTransformMap(characterId, map);
}

export function getPortraitTransform(characterId: string, key: string): PortraitTransform | null {
  const normalizedKey = key.trim().toLowerCase();
  if (!normalizedKey) return null;
  const map = loadPortraitTransformMap(characterId);
  return map[normalizedKey] ?? null;
}

