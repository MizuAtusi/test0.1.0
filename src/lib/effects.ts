import type { Room, Character, Asset, Message, Participant } from '@/types/trpg';

export type EffectKind = 'critical' | 'fumble';

export function createId() {
  try {
    const anyCrypto: any = (globalThis as any).crypto;
    if (anyCrypto?.randomUUID) return String(anyCrypto.randomUUID());
  } catch {
    // ignore
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export type EffectImage = {
  id: string;
  label: string;
  url: string;
  x: number; // relative to stage width (0.1 = 10% of width)
  y: number; // relative to stage height
  anchor?: 'center' | 'top-left';
  scale: number;
  rotate: number; // deg
  opacity: number; // 0..1
  z: number;
};

export type PcEffect = {
  tag: string; // '' means hidden
  x: number; // relative to stage width
  y: number; // relative to stage height
  anchor?: 'center' | 'top-left';
  scale: number;
  rotate: number;
  opacity: number;
  z: number;
};

export type EffectsConfig = {
  critical?: {
    images: EffectImage[];
    seUrl?: string;
    durationMs?: number; // time before fade-out
  };
  fumble?: {
    images: EffectImage[];
    seUrl?: string;
    durationMs?: number; // time before fade-out
  };
  pc?: Record<string, { critical?: PcEffect; fumble?: PcEffect }>;
  other?: {
    triggers: OtherEffectTrigger[];
  };
};

export const DEFAULT_EFFECTS: EffectsConfig = {
  critical: { images: [], seUrl: '', durationMs: 2000 },
  fumble: { images: [], seUrl: '', durationMs: 2000 },
  pc: {},
  other: { triggers: [] },
};

// Design-time stage size (16:9). Used only to migrate older px-based stored values.
const STAGE_BASE_WIDTH = 1200;
const STAGE_BASE_HEIGHT = 675;

function normalizeRelMaybe(value: number, axis: 'x' | 'y') {
  // Older builds stored pixel offsets. Convert them into relative offsets using the base stage size.
  if (Math.abs(value) > 2) {
    return axis === 'x' ? value / STAGE_BASE_WIDTH : value / STAGE_BASE_HEIGHT;
  }
  return value;
}

export type OtherEffectTrigger = {
  id: string;
  label: string;
  pattern: string; // raw pattern (no braces)
  syntax: 'plain' | 'tag';
  match: 'exact' | 'contains';
  images: EffectImage[];
  pc?: Record<string, PcEffect>;
  seUrl?: string;
  durationMs?: number; // time before fade-out
};

export function normalizeEffectsConfig(config: EffectsConfig | null | undefined): EffectsConfig {
  const c = (config && typeof config === 'object') ? config : {};
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

  const normalizePc = (pc: any) => {
    const out: Record<string, { critical?: PcEffect; fumble?: PcEffect }> = {};
    if (!pc || typeof pc !== 'object') return out;
    for (const [characterId, v] of Object.entries(pc)) {
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
      out[String(characterId)] = {
        critical: (v as any).critical ? norm((v as any).critical) : undefined,
        fumble: (v as any).fumble ? norm((v as any).fumble) : undefined,
      };
    }
    return out;
  };
  const normalizePcMap = (pc: any) => {
    const out: Record<string, PcEffect> = {};
    if (!pc || typeof pc !== 'object') return out;
    for (const [characterId, v] of Object.entries(pc)) {
      if (!v || typeof v !== 'object') continue;
      out[String(characterId)] = {
        tag: String((v as any).tag || ''),
        x: normalizeRelMaybe(Number.isFinite((v as any).x) ? Number((v as any).x) : 0, 'x'),
        y: normalizeRelMaybe(Number.isFinite((v as any).y) ? Number((v as any).y) : 0, 'y'),
        anchor: (v as any).anchor === 'top-left' ? 'top-left' : 'center',
        scale: Number.isFinite((v as any).scale) ? Number((v as any).scale) : 1,
        rotate: Number.isFinite((v as any).rotate) ? Number((v as any).rotate) : 0,
        opacity: Number.isFinite((v as any).opacity) ? Math.max(0, Math.min(1, Number((v as any).opacity))) : 1,
        z: Number.isFinite((v as any).z) ? Number((v as any).z) : 0,
      };
    }
    return out;
  };

  const normalizeOther = (other: any) => {
    const raw = other && typeof other === 'object' ? other : {};
    const triggers = Array.isArray(raw.triggers) ? raw.triggers : [];
    const normPattern = (p: any) => {
      const s = String(p || '').trim();
      if (s.startsWith('{') && s.endsWith('}') && s.length >= 2) return s.slice(1, -1).trim();
      return s;
    };
    const normalizeTrigger = (t: any): OtherEffectTrigger => {
      const hasLabel = t && Object.prototype.hasOwnProperty.call(t, 'label');
      const label = hasLabel ? String(t.label ?? '') : String(t?.pattern || '演出');
      const pattern = normPattern(t?.pattern ?? t?.text ?? '');
      const syntax: 'plain' | 'tag' = t?.syntax === 'tag' ? 'tag' : 'plain';
      const match: 'exact' | 'contains' = t?.match === 'exact' ? 'exact' : 'contains';
      const durationMs = Number.isFinite(t?.durationMs) ? Number(t.durationMs) : (Number.isFinite(t?.duration_ms) ? Number(t.duration_ms) : 2000);
      return {
        id: String(t?.id || createId()),
        label,
        pattern,
        syntax,
        match,
        images: normalizeImages(t?.images),
        pc: normalizePcMap(t?.pc),
        seUrl: String(t?.seUrl || ''),
        durationMs: Math.max(0, durationMs),
      };
    };
    return {
      triggers: triggers.map(normalizeTrigger),
    };
  };

  const normalizeDurationMs = (raw: any) => {
    const v = Number.isFinite(raw?.durationMs) ? Number(raw.durationMs) : (Number.isFinite(raw?.duration_ms) ? Number(raw.duration_ms) : 2000);
    return Math.max(0, v);
  };

  return {
    critical: {
      images: normalizeImages((c as any).critical?.images),
      seUrl: String((c as any).critical?.seUrl || ''),
      durationMs: normalizeDurationMs((c as any).critical),
    },
    fumble: {
      images: normalizeImages((c as any).fumble?.images),
      seUrl: String((c as any).fumble?.seUrl || ''),
      durationMs: normalizeDurationMs((c as any).fumble),
    },
    pc: normalizePc((c as any).pc),
    other: normalizeOther((c as any).other),
  };
}

export function getEffectsStorageKey(roomId: string) {
  return `trpg:effects:${roomId}`;
}

export function loadEffectsConfig(room: Room | null): EffectsConfig {
  const roomId = room?.id;
  const fromRoom = normalizeEffectsConfig((room as any)?.effects);
  if (roomId) {
    try {
      const raw = localStorage.getItem(getEffectsStorageKey(roomId));
      if (raw) return normalizeEffectsConfig(JSON.parse(raw));
    } catch {
      // ignore
    }
  }
  return fromRoom;
}

export function saveEffectsConfigLocal(roomId: string, config: EffectsConfig) {
  try {
    localStorage.setItem(getEffectsStorageKey(roomId), JSON.stringify(config));
  } catch {
    // ignore
  }
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

export function buildEffectsConfigCommand(config: EffectsConfig) {
  const payload = encodeBase64Utf8(JSON.stringify(normalizeEffectsConfig(config)));
  if (!payload) return '';
  return `[effects_config:${payload}]`;
}

export function applyEffectsConfigCommandsFromText(roomId: string, rawText: unknown) {
  if (typeof rawText !== 'string' || !rawText) return;
  const regex = /\[effects_config:([A-Za-z0-9+/=]+)\]/g;
  let match: RegExpExecArray | null = null;
  while ((match = regex.exec(rawText)) !== null) {
    const payload = String(match[1] ?? '').trim();
    if (!payload) continue;
    const decoded = decodeBase64Utf8(payload);
    if (!decoded) continue;
    try {
      const parsed = JSON.parse(decoded);
      const normalized = normalizeEffectsConfig(parsed);
      saveEffectsConfigLocal(roomId, normalized);
      try {
        window.dispatchEvent(new CustomEvent('trpg:effectsConfigChanged', { detail: { roomId } }));
      } catch {
        // ignore
      }
    } catch {
      // ignore
    }
  }
}

export function resolvePortraitTagToUrl(
  assets: Asset[],
  characterId: string,
  tagOrLabel: string,
): { url: string; label: string } | null {
  const key = String(tagOrLabel || '').trim().toLowerCase();
  if (!key) return null;
  const list = assets.filter((a) => a.kind === 'portrait' && a.character_id === characterId && a.tag !== '__avatar__');
  const byTag = list.find((a) => String(a.tag || '').toLowerCase() === key);
  if (byTag) return { url: byTag.url, label: byTag.label };
  const byLabel = list.find((a) => String(a.label || '').toLowerCase() === key);
  if (byLabel) return { url: byLabel.url, label: byLabel.label };
  return null;
}

export function shouldTriggerEffectsForMessage(
  message: Message | null | undefined,
  participant: Participant | null,
): { kind: EffectKind; canSeeFull: boolean; rollerCharacterId?: string } | null {
  if (!message || message.type !== 'dice') return null;
  const payload: any = (message as any).dice_payload;
  const result = payload?.result as string | undefined;
  const kind: EffectKind | null = result === 'critical' ? 'critical' : result === 'fumble' ? 'fumble' : null;
  if (!kind) return null;

  const allowList = Array.isArray((message as any).secret_allow_list) ? (message as any).secret_allow_list : [];
  const blind = !!payload?.blind;
  const canSeeFull = !blind || (!!participant && allowList.includes(participant.id));
  const rollerCharacterId = typeof payload?.characterId === 'string' ? payload.characterId : undefined;
  return { kind, canSeeFull, rollerCharacterId };
}

export function shouldTriggerOtherEffectsForMessage(params: {
  message: Message | null | undefined;
  config: EffectsConfig;
}): OtherEffectTrigger | null {
  const { message, config } = params;
  if (!message) return null;
  if (message.type === 'dice') return null;
  const text = typeof (message as any).text === 'string' ? (message as any).text : '';
  if (!text) return null;
  const c = normalizeEffectsConfig(config);
  const triggers = c.other?.triggers || [];
  const forced = text.match(/\[effects_other:([a-z0-9-]+)\]/i);
  if (forced) {
    const target = triggers.find((t) => String(t.id) === String(forced[1]));
    if (target) return target;
  }
  const trimmed = text.trim();
  for (const t of triggers) {
    const pattern = String(t.pattern || '').trim();
    if (!pattern) continue;
    const needle = t.syntax === 'tag' ? `{${pattern}}` : pattern;
    if (t.match === 'exact') {
      if (trimmed === needle) return t;
    } else {
      if (text.includes(needle)) return t;
    }
  }
  return null;
}

export function buildOtherEffectRenderList(params: {
  trigger: OtherEffectTrigger;
  characters: Character[];
  assets: Asset[];
  speakerName?: string;
}) {
  const { trigger, characters, assets, speakerName } = params;
  const t = trigger;
  const images = (Array.isArray(t.images) ? t.images : []).filter((x) => !!x.url).sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
  const seUrl = String(t.seUrl || '');
  const durationMs = Math.max(0, Number.isFinite(t.durationMs) ? Number(t.durationMs) : 2000);
  const pcImages: Array<EffectImage & { isPc: true; characterId: string }> = [];
  const pcMap = t.pc || {};
  const speaker = speakerName ? characters.find((c) => c.name === speakerName) ?? null : null;
  if (speaker) {
    const pc = pcMap[speaker.id];
    if (pc?.tag) {
      const resolved = resolvePortraitTagToUrl(assets, speaker.id, pc.tag);
      if (resolved) {
        pcImages.push({
          id: `pc:${speaker.id}:other:${t.id}`,
          label: `${speaker.name}`,
          url: resolved.url,
          x: pc.x,
          y: pc.y,
          anchor: pc.anchor ?? 'center',
          scale: pc.scale,
          rotate: pc.rotate,
          opacity: pc.opacity,
          z: pc.z,
          isPc: true,
          characterId: speaker.id,
        });
      }
    }
  }
  return { images: [...images, ...pcImages].sort((a, b) => (a.z ?? 0) - (b.z ?? 0)), seUrl, durationMs };
}

export function buildEffectRenderList(params: {
  config: EffectsConfig;
  kind: EffectKind;
  characters: Character[];
  assets: Asset[];
  rollerCharacterId?: string;
}) {
  const { config, kind, characters, assets, rollerCharacterId } = params;
  const base = normalizeEffectsConfig(config);
  const images = (base as any)[kind]?.images as EffectImage[];
  const seUrl = String((base as any)[kind]?.seUrl || '');
  const durationMs = Math.max(0, Number.isFinite((base as any)[kind]?.durationMs) ? Number((base as any)[kind]?.durationMs) : 2000);

  const pcImages: Array<EffectImage & { isPc: true; characterId: string }> = [];
  const pcMap = base.pc || {};
  const targetId = rollerCharacterId && typeof rollerCharacterId === 'string' ? rollerCharacterId : null;
  // PCごとの演出は「誰が振ったか」が分からないと誤爆するので、IDが取れない場合は表示しない
  if (!targetId) {
    return {
      images: [...images].sort((a, b) => (a.z ?? 0) - (b.z ?? 0)),
      seUrl,
      durationMs,
    };
  }
  characters
    .filter((c) => !c.is_npc)
    .forEach((c) => {
      if (targetId && c.id !== targetId) return;
      const pc = pcMap[c.id]?.[kind];
      if (!pc || !pc.tag) return;
      const resolved = resolvePortraitTagToUrl(assets, c.id, pc.tag);
      if (!resolved) return;
      pcImages.push({
        id: `pc:${c.id}:${kind}`,
        label: `${c.name}`,
        url: resolved.url,
        x: pc.x,
        y: pc.y,
        anchor: pc.anchor ?? 'center',
        scale: pc.scale,
        rotate: pc.rotate,
        opacity: pc.opacity,
        z: pc.z,
        isPc: true,
        characterId: c.id,
      });
    });

  return {
    images: [...images, ...pcImages].sort((a, b) => (a.z ?? 0) - (b.z ?? 0)),
    seUrl,
    durationMs,
  };
}
