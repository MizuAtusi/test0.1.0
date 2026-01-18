import type { Room } from '@/types/trpg';
import { createId, type EffectImage } from '@/lib/effects';

export type BackgroundScreenConfig = {
  id?: string;
  name?: string;
  images: EffectImage[];
};

export type BackgroundScreenPreset = {
  id: string;
  name: string;
  config: BackgroundScreenConfig;
};

const DEFAULT_BACKGROUND_SCREEN: BackgroundScreenConfig = {
  images: [],
};

// Design-time stage size (16:9). Used only to migrate older px-based stored values.
const STAGE_BASE_WIDTH = 1200;
const STAGE_BASE_HEIGHT = 675;

function normalizeRelMaybe(value: number, axis: 'x' | 'y') {
  if (Math.abs(value) > 2) {
    return axis === 'x' ? value / STAGE_BASE_WIDTH : value / STAGE_BASE_HEIGHT;
  }
  return value;
}

export function normalizeBackgroundScreenConfig(raw: any): BackgroundScreenConfig {
  let c = raw && typeof raw === 'object' ? raw : {};
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      c = parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      c = {};
    }
  }

  const images = (Array.isArray(c.images) ? c.images : [])
    .map((x) => ({
      id: String(x?.id || createId()),
      label: String(x?.label || '背景'),
      url: String(x?.url || ''),
      x: normalizeRelMaybe(Number.isFinite(x?.x) ? Number(x.x) : 0, 'x'),
      y: normalizeRelMaybe(Number.isFinite(x?.y) ? Number(x.y) : 0, 'y'),
      anchor: x?.anchor === 'top-left' ? 'top-left' : 'center',
      scale: Number.isFinite(x?.scale) ? Number(x.scale) : 1,
      rotate: Number.isFinite(x?.rotate) ? Number(x.rotate) : 0,
      opacity: Number.isFinite(x?.opacity) ? Math.max(0, Math.min(1, Number(x.opacity))) : 1,
      z: Number.isFinite(x?.z) ? Number(x.z) : 0,
    }))
    .filter((x) => !!x.url);

  return {
    id: typeof c.id === 'string' ? c.id : undefined,
    name: typeof c.name === 'string' ? c.name : undefined,
    images,
  };
}

export function loadBackgroundScreenConfig(room: Room | null): BackgroundScreenConfig {
  return normalizeBackgroundScreenConfig(room?.background_screen || {});
}

export function normalizeBackgroundScreenPresets(raw: any): BackgroundScreenPreset[] {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((entry) => {
      const id = typeof entry?.id === 'string' ? entry.id : createId();
      const name = typeof entry?.name === 'string' ? entry.name : '';
      const config = normalizeBackgroundScreenConfig(entry?.config || {});
      return { id, name, config };
    })
    .filter((entry) => entry.name);
}

export function loadBackgroundScreenPresets(room: Room | null): BackgroundScreenPreset[] {
  return normalizeBackgroundScreenPresets(room?.background_screens || []);
}

export function upsertBackgroundScreenPreset(
  list: BackgroundScreenPreset[],
  preset: BackgroundScreenPreset
): BackgroundScreenPreset[] {
  const idx = list.findIndex((p) => p.id === preset.id);
  if (idx === -1) return [...list, preset];
  return list.map((p) => (p.id === preset.id ? preset : p));
}

export function removeBackgroundScreenPreset(
  list: BackgroundScreenPreset[],
  presetId: string
): BackgroundScreenPreset[] {
  return list.filter((p) => p.id !== presetId);
}

export function hasBackgroundScreenConfig(config: BackgroundScreenConfig): boolean {
  return (config.images || []).length > 0;
}

export function buildBackgroundScreenRenderList(config: BackgroundScreenConfig) {
  const images: EffectImage[] = [];
  (config.images || []).forEach((img) => {
    if (!img?.url) return;
    images.push({
      id: img.id || createId(),
      label: img.label || '背景',
      url: img.url,
      x: img.x ?? 0,
      y: img.y ?? 0,
      anchor: img.anchor ?? 'center',
      scale: img.scale ?? 1,
      rotate: img.rotate ?? 0,
      opacity: img.opacity ?? 1,
      z: img.z ?? 0,
    });
  });
  images.sort((a, b) => (a.z || 0) - (b.z || 0));
  return { images };
}
