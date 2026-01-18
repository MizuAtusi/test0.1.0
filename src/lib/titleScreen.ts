import type { Room, Character, Asset } from '@/types/trpg';
import { createId, resolvePortraitTagToUrl, type EffectImage, type PcEffect } from '@/lib/effects';

export type TitleScreenConfig = {
  images: EffectImage[];
  pc?: Record<string, PcEffect>;
  bgmUrl?: string;
};

const DEFAULT_TITLE_SCREEN: TitleScreenConfig = {
  images: [],
  pc: {},
  bgmUrl: '',
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

export function normalizeTitleScreenConfig(raw: any): TitleScreenConfig {
  let c = (raw && typeof raw === 'object') ? raw : {};
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      c = (parsed && typeof parsed === 'object') ? parsed : {};
    } catch {
      c = {};
    }
  }
  const normalizeImages = (imgs: any) =>
    (Array.isArray(imgs) ? imgs : [])
      .map((x) => ({
        id: String(x?.id || createId()),
        label: String(x?.label || '画像'),
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

  const pc: Record<string, PcEffect> = {};
  if (c.pc && typeof c.pc === 'object') {
    for (const [characterId, v] of Object.entries(c.pc)) {
      if (!v || typeof v !== 'object') continue;
      const norm = (x: any): PcEffect => ({
        tag: String(x?.tag || ''),
        x: normalizeRelMaybe(Number.isFinite(x?.x) ? Number(x.x) : 0, 'x'),
        y: normalizeRelMaybe(Number.isFinite(x?.y) ? Number(x.y) : 0, 'y'),
        anchor: x?.anchor === 'top-left' ? 'top-left' : 'center',
        scale: Number.isFinite(x?.scale) ? Number(x.scale) : 1,
        rotate: Number.isFinite(x?.rotate) ? Number(x.rotate) : 0,
        opacity: Number.isFinite(x?.opacity) ? Math.max(0, Math.min(1, Number(x.opacity))) : 1,
        z: Number.isFinite(x?.z) ? Number(x.z) : 0,
      });
      pc[String(characterId)] = norm(v as any);
    }
  }

  return {
    images: normalizeImages(c.images),
    pc,
    bgmUrl: typeof c.bgmUrl === 'string' ? c.bgmUrl : DEFAULT_TITLE_SCREEN.bgmUrl,
  };
}

export function loadTitleScreenConfig(room: Room | null): TitleScreenConfig {
  return normalizeTitleScreenConfig(room?.title_screen || {});
}

export function hasTitleScreenConfig(config: TitleScreenConfig): boolean {
  if ((config.images || []).length > 0) return true;
  if (config.pc && Object.values(config.pc).some((v) => v && v.tag)) return true;
  return false;
}

export function buildTitleScreenRenderList(params: {
  config: TitleScreenConfig;
  characters: Character[];
  assets: Asset[];
}) {
  const { config, characters, assets } = params;
  const images: EffectImage[] = [];
  const baseImages = Array.isArray(config.images) ? config.images : [];
  baseImages.forEach((img) => {
    if (!img?.url) return;
    images.push({
      id: img.id || createId(),
      label: img.label || '画像',
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

  if (config.pc && typeof config.pc === 'object') {
    characters
      .filter((c) => !c.is_npc)
      .forEach((c) => {
        const eff = (config.pc || {})[c.id];
        if (!eff || !eff.tag) return;
        const resolved = resolvePortraitTagToUrl(assets, c.id, eff.tag);
        if (!resolved) return;
        images.push({
          id: `pc:${c.id}`,
          label: resolved.label || c.name,
          url: resolved.url,
      x: eff.x ?? 0,
      y: eff.y ?? 0,
      anchor: eff.anchor ?? 'center',
      scale: eff.scale ?? 1,
          rotate: eff.rotate ?? 0,
          opacity: eff.opacity ?? 1,
          z: eff.z ?? 0,
        });
      });
  }

  images.sort((a, b) => (a.z || 0) - (b.z || 0));

  return {
    images,
    bgmUrl: config.bgmUrl || '',
  };
}
