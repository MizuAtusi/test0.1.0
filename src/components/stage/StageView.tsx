import { useRef, useEffect, useState, useCallback, useLayoutEffect, useMemo } from 'react';
import type { Message, StageState, Participant, Room, Character, Asset } from '@/types/trpg';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { MessageBubble } from './MessageBubble';
import { StageToolbar } from './StageToolbar';
import { supabase } from '@/integrations/supabase/client';
import {
  buildEffectRenderList,
  buildOtherEffectRenderList,
  loadEffectsConfig,
  shouldTriggerEffectsForMessage,
  shouldTriggerOtherEffectsForMessage,
  type EffectImage,
} from '@/lib/effects';
import { buildTitleScreenRenderList, hasTitleScreenConfig, loadTitleScreenConfig } from '@/lib/titleScreen';
import { getPortraitTransformRel } from '@/lib/portraitTransformsShared';
import {
  getAssetLegacyTransformRel,
  getAssetTransformRel,
  getPortraitRenderMetrics,
  hasPositionTransformColumns,
} from '@/lib/portraitTransformUtils';

const EFFECT_BASE_WIDTH = 1200;
const EFFECT_BASE_HEIGHT = 675;

interface StageViewProps {
  messages: Message[];
  stageState: StageState | null;
  bgmUrl?: string | null;
  se?: { url: string; nonce: number } | null;
  room: Room | null;
  participants: Participant[];
  participant: Participant | null;
  isSecret: boolean;
  canViewSecret: boolean;
  isGM: boolean;
  characters: Character[];
  onUpdateRoom: (updates: Partial<Room>) => void;
  textLayout?: 'overlay' | 'none';
  textWindowVisible: boolean;
  onToggleTextWindow: (next: boolean) => void;
}

export function StageView({ 
  messages, 
  stageState,
  bgmUrl = null,
  se = null,
  room,
  participants,
  participant,
  isSecret,
  canViewSecret,
  isGM,
  characters,
  onUpdateRoom,
  textLayout = 'overlay',
  textWindowVisible,
  onToggleTextWindow,
}: StageViewProps) {
  const isPortraitDebug = () => {
    try {
      return localStorage.getItem('trpg:debugPortrait') === '1';
    } catch {
      return false;
    }
  };
  const stageRootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollContentRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const bgmRef = useRef<HTMLAudioElement>(null);
  const titleBgmRef = useRef<HTMLAudioElement>(null);
  const seRef = useRef<HTMLAudioElement>(null);
  const effectsSeRef = useRef<HTMLAudioElement>(null);
  const [audioNeedsUnlock, setAudioNeedsUnlock] = useState(false);
  const [portraitAssets, setPortraitAssets] = useState<Asset[]>([]);
  const lastHandledMessageIdRef = useRef<string | null>(null);
  const portraitDebugRef = useRef<Map<string, string>>(new Map());
  const [effectOverlay, setEffectOverlay] = useState<{ nonce: number; images: EffectImage[]; seUrl: string; durationMs: number } | null>(null);
  const [effectFading, setEffectFading] = useState(false);
  const [stageSize, setStageSize] = useState<{ width: number; height: number }>({ width: 1200, height: 675 });
  const [portraitTransformNonce, bumpPortraitTransformNonce] = useState(0);
  const titleScreenConfig = useMemo(() => loadTitleScreenConfig(room), [room]);
  const titleScreenRender = useMemo(
    () => buildTitleScreenRenderList({ config: titleScreenConfig, characters, assets: portraitAssets }),
    [titleScreenConfig, characters, portraitAssets]
  );
  const titleScreenVisible = useMemo(
    () => !!room?.title_screen_visible && hasTitleScreenConfig(titleScreenConfig),
    [room?.title_screen_visible, titleScreenConfig]
  );
  const overlayTextHeightPx = (() => {
    // Keep the overlay window from covering the entire stage when the stage gets small.
    const desired = stageSize.height * 0.33;
    const hardCap = Math.max(80, stageSize.height - 40); // leave some stage visible
    return Math.round(Math.min(hardCap, Math.min(280, Math.max(120, desired))));
  })();
  const overlayScale = Math.min(
    stageSize.width / EFFECT_BASE_WIDTH,
    stageSize.height / EFFECT_BASE_HEIGHT
  );
  const overlayWidth = EFFECT_BASE_WIDTH * overlayScale;
  const overlayHeight = EFFECT_BASE_HEIGHT * overlayScale;
  const showStageGuide = import.meta.env.DEV;

  // Load per-room visibility preference once room id becomes available
  // Track stage size for relative positioning
  useEffect(() => {
    const el = stageRootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      setStageSize({ width: rect.width, height: rect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent)?.detail as { roomId?: string } | undefined;
      if (detail?.roomId && room?.id && detail.roomId !== room.id) return;
      bumpPortraitTransformNonce((prev) => prev + 1);
    };
    window.addEventListener('trpg:portraitTransformChanged', handler as EventListener);
    return () => window.removeEventListener('trpg:portraitTransformChanged', handler as EventListener);
  }, [room?.id]);

  // BGM playback (separate from SE)
  useEffect(() => {
    const audio = bgmRef.current;
    if (!audio) return;

    if (!bgmUrl) {
      try {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
      } catch {
        // ignore
      }
      return;
    }

    if (audio.src !== bgmUrl) {
      audio.src = bgmUrl;
    }
    audio.loop = true;

    audio.play().then(
      () => setAudioNeedsUnlock(false),
      () => setAudioNeedsUnlock(true)
    );
  }, [bgmUrl]);

  // Title screen BGM playback (separate from stage BGM)
  useEffect(() => {
    const titleAudio = titleBgmRef.current;
    if (!titleAudio) return;

    if (!titleScreenVisible || !titleScreenRender.bgmUrl) {
      try {
        titleAudio.pause();
        titleAudio.removeAttribute('src');
        titleAudio.load();
      } catch {
        // ignore
      }
      // Resume stage BGM if title screen is hidden
      if (!titleScreenVisible && bgmUrl && bgmRef.current) {
        bgmRef.current.play().catch(() => setAudioNeedsUnlock(true));
      }
      return;
    }

    // Pause stage BGM while title BGM is active
    if (bgmRef.current) {
      try {
        bgmRef.current.pause();
      } catch {
        // ignore
      }
    }

    if (titleAudio.src !== titleScreenRender.bgmUrl) {
      titleAudio.src = titleScreenRender.bgmUrl;
    }
    titleAudio.loop = true;
    titleAudio.play().then(
      () => setAudioNeedsUnlock(false),
      () => setAudioNeedsUnlock(true)
    );
  }, [titleScreenVisible, titleScreenRender.bgmUrl, bgmUrl]);

  // SE playback (one-shot)
  useEffect(() => {
    if (!se?.url) return;
    const audio = seRef.current;
    if (!audio) return;
    try {
      audio.pause();
      audio.currentTime = 0;
    } catch {
      // ignore
    }
    if (audio.src !== se.url) {
      audio.src = se.url;
    }
    audio.play().then(
      () => setAudioNeedsUnlock(false),
      () => setAudioNeedsUnlock(true)
    );
  }, [se?.nonce, se?.url]);

  // Effects SE playback (one-shot, separate channel from stage SE)
  useEffect(() => {
    if (!effectOverlay?.seUrl) return;
    const audio = effectsSeRef.current;
    if (!audio) return;
    try {
      audio.pause();
      audio.currentTime = 0;
    } catch {
      // ignore
    }
    if (audio.src !== effectOverlay.seUrl) {
      audio.src = effectOverlay.seUrl;
    }
    audio.play().then(
      () => setAudioNeedsUnlock(false),
      () => setAudioNeedsUnlock(true)
    );
  }, [effectOverlay?.nonce, effectOverlay?.seUrl]);

  const handleUnlockAudio = async () => {
    setAudioNeedsUnlock(false);
    try {
      if (bgmUrl && bgmRef.current) {
        await bgmRef.current.play();
      }
      if (seRef.current) {
        try {
          await seRef.current.play();
        } catch {
          // ignore
        }
      }
      if (effectsSeRef.current) {
        try {
          await effectsSeRef.current.play();
        } catch {
          // ignore
        }
      }
    } catch {
      setAudioNeedsUnlock(true);
    }
  };

  // Filter messages for secret channel
  const visibleMessages = messages.filter(msg => {
    if (msg.channel === 'public') return true;
    if (msg.channel === 'secret') {
      if (canViewSecret) return true;
      if (!participant) return false;
      return msg.secret_allow_list.includes(participant.id);
    }
    return true;
  });

  const showSecretOverlay = isSecret && !canViewSecret;

  const scrollToBottom = useCallback((behavior: ScrollBehavior) => {
    const root = scrollRef.current;
    const viewport = (root?.querySelector?.('[data-radix-scroll-area-viewport]') ?? null) as HTMLElement | null;
    if (viewport) {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior });
      return;
    }
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  // Keep scroll pinned to bottom even when the viewport/content size changes
  useEffect(() => {
    if (textLayout !== 'overlay' || !textWindowVisible || showSecretOverlay || titleScreenVisible) return;
    const root = scrollRef.current;
    const viewport = (root?.querySelector?.('[data-radix-scroll-area-viewport]') ?? null) as HTMLElement | null;
    const content = scrollContentRef.current;
    if (!viewport || !content) return;

    let raf = 0;
    const schedule = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => scrollToBottom('auto'));
    };

    const ro = new ResizeObserver(schedule);
    ro.observe(viewport);
    ro.observe(content);
    schedule();

    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [scrollToBottom, showSecretOverlay, textLayout, textWindowVisible, titleScreenVisible]);

  // Always keep the newest message visible (including on first load/join)
  const lastVisibleCountRef = useRef(0);
  useLayoutEffect(() => {
    const nextCount = visibleMessages.length;
    const behavior: ScrollBehavior = lastVisibleCountRef.current === 0 ? 'auto' : 'smooth';
    lastVisibleCountRef.current = nextCount;
    scrollToBottom(behavior);
    // Radix ScrollArea mounts viewport lazily; retry once on next frame to ensure it lands at the bottom.
    const raf = window.requestAnimationFrame(() => scrollToBottom(behavior));
    return () => window.cancelAnimationFrame(raf);
  }, [visibleMessages.length, scrollToBottom]);

  const portraitAssetById = useMemo(() => {
    const map = new Map<string, Asset>();
    portraitAssets.forEach((asset) => {
      map.set(asset.id, asset);
    });
    return map;
  }, [portraitAssets]);

  // Fetch portrait assets for resolving PC tags in effects
  useEffect(() => {
    const roomId = room?.id;
    if (!roomId) {
      setPortraitAssets([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const selectWithTransforms = [
        'id',
        'room_id',
        'character_id',
        'kind',
        'url',
        'label',
        'tag',
        'is_default',
        'layer_order',
        'created_at',
        'scale',
        'offset_x',
        'offset_y',
        'scale_left',
        'offset_x_left',
        'offset_y_left',
        'scale_center',
        'offset_x_center',
        'offset_y_center',
        'scale_right',
        'offset_x_right',
        'offset_y_right',
      ].join(',');
      const selectMinimal = [
        'id',
        'room_id',
        'character_id',
        'kind',
        'url',
        'label',
        'tag',
        'is_default',
        'layer_order',
        'created_at',
      ].join(',');
      let { data, error } = await supabase
        .from('assets')
        .select(selectWithTransforms)
        .eq('room_id', roomId)
        .eq('kind', 'portrait');
      if (error) {
        const message = error.message || '';
        const looksLikeMissingColumns = message.includes('column') && message.includes('does not exist');
        if (looksLikeMissingColumns) {
          const retry = await supabase
            .from('assets')
            .select(selectMinimal)
            .eq('room_id', roomId)
            .eq('kind', 'portrait');
          data = retry.data as any;
          error = retry.error as any;
        }
      }
      if (cancelled) return;
      if (error) {
        console.warn('Failed to fetch portrait assets for effects:', error);
        setPortraitAssets([]);
        return;
      }
      setPortraitAssets((data as any) ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [room?.id, portraitTransformNonce]);

  // Trigger critical/fumble effects on new visible dice messages
  useEffect(() => {
    if (showSecretOverlay) return;
    const last = visibleMessages[visibleMessages.length - 1] ?? null;
    if (!last) {
      lastHandledMessageIdRef.current = null;
      return;
    }

    // Skip initial render to avoid firing on load
    if (lastHandledMessageIdRef.current === null) {
      lastHandledMessageIdRef.current = last.id;
      return;
    }

    if (lastHandledMessageIdRef.current === last.id) return;
    lastHandledMessageIdRef.current = last.id;

    const config = loadEffectsConfig(room);
    const diceTrigger = shouldTriggerEffectsForMessage(last, participant);
    if (diceTrigger && diceTrigger.canSeeFull) {
      const built = buildEffectRenderList({
        config,
        kind: diceTrigger.kind,
        rollerCharacterId: diceTrigger.rollerCharacterId,
        characters,
        assets: portraitAssets,
      });

      setEffectFading(false);
      setEffectOverlay((prev) => ({
        nonce: (prev?.nonce ?? 0) + 1,
        images: built.images,
        seUrl: built.seUrl,
        durationMs: built.durationMs,
      }));
      return;
    }

    const otherTrigger = shouldTriggerOtherEffectsForMessage({ message: last, config });
    if (!otherTrigger) return;
    const built = buildOtherEffectRenderList({
      trigger: otherTrigger,
      characters,
      assets: portraitAssets,
      speakerName: last.speaker_name,
    });

    setEffectFading(false);
    setEffectOverlay((prev) => ({
      nonce: (prev?.nonce ?? 0) + 1,
      images: built.images,
      seUrl: built.seUrl,
      durationMs: built.durationMs,
    }));
  }, [visibleMessages, participant, room, characters, portraitAssets, showSecretOverlay]);

  // Fade out overlay after a short duration
  useEffect(() => {
    if (!effectOverlay) return;
    setEffectFading(false);
    const fadeMs = 400;
    const holdMs = Math.max(0, Math.min(30000, Number.isFinite(effectOverlay.durationMs) ? effectOverlay.durationMs : 2000));
    const t1 = window.setTimeout(() => setEffectFading(true), holdMs);
    const t2 = window.setTimeout(() => setEffectOverlay(null), holdMs + fadeMs);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [effectOverlay?.nonce]);

  // Apply theme styles
  const theme = room?.theme || {};
  const baseFontSize = Number.isFinite(theme.fontSize) ? Number(theme.fontSize) : 18;
  const fontScale = Math.min(1, Math.max(0.72, stageSize.width / 1200));
  const responsiveFontSize = Math.round(baseFontSize * fontScale);
  const textWindowStyle: React.CSSProperties = {
    ...(theme.textWindowBg && { backgroundImage: `url(${theme.textWindowBg})`, backgroundSize: 'cover' }),
    ...(theme.textWindowOpacity && { opacity: theme.textWindowOpacity }),
    fontSize: `${responsiveFontSize}px`,
    ...(theme.lineHeight && { lineHeight: theme.lineHeight }),
    ...(theme.padding && { padding: `${theme.padding}px` }),
    ...(theme.textColor && { color: theme.textColor }),
    ...(theme.borderColor && { borderColor: theme.borderColor }),
  };

  return (
    <div ref={stageRootRef} className="relative h-full w-full overflow-hidden rounded-t-lg rounded-b-none bg-cthulhu-deep">
      <audio ref={bgmRef} className="hidden" />
      <audio ref={titleBgmRef} className="hidden" />
      <audio ref={seRef} className="hidden" />
      <audio ref={effectsSeRef} className="hidden" />
      {/* Background Layer */}
      <div 
        className={`stage-background z-0 ${showSecretOverlay ? 'secret-blur' : ''}`}
        style={{
          backgroundImage: stageState?.background_url 
            ? `url(${stageState.background_url})` 
            : 'linear-gradient(to bottom, hsl(250 40% 8%), hsl(250 40% 4%))',
        }}
      />

      {/* Gradient Overlay */}
      <div className="absolute inset-0 z-10 bg-gradient-to-t from-background via-transparent to-transparent opacity-60" />

      {showStageGuide && (
        <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 26 }}>
          <div
            className="absolute left-1/2 top-1/2"
            style={{
              width: overlayWidth,
              height: overlayHeight,
              transform: 'translate(-50%, -50%)',
              border: '1px dashed rgba(255, 255, 255, 0.4)',
              boxSizing: 'border-box',
            }}
          />
        </div>
      )}

      {/* Portrait Layer */}
      {!showSecretOverlay && stageState?.active_portraits && (
        <div className="absolute inset-0 z-20 pointer-events-none">
          {stageState.active_portraits.map((portrait, index) => (
            (() => {
              const posKey = portrait.position === 'left' ? 'left' : portrait.position === 'right' ? 'right' : 'center';
              const assetById = portrait.assetId ? portraitAssetById.get(portrait.assetId) : undefined;
              const assetFallback = !assetById
                ? portraitAssets.find((asset) => {
                    if (asset.kind !== 'portrait') return false;
                    if (asset.character_id !== portrait.characterId) return false;
                    const labelMatch = asset.label && portrait.label && asset.label.toLowerCase() === portrait.label.toLowerCase();
                    const tagMatch = asset.tag && portrait.tag && asset.tag.toLowerCase() === portrait.tag.toLowerCase();
                    const urlMatch = asset.url && portrait.url && asset.url === portrait.url;
                    return Boolean(labelMatch || tagMatch || urlMatch);
                  })
                : undefined;
              const assetForTransform = assetById ?? assetFallback;
              const sharedKey = portrait.tag || portrait.label || assetForTransform?.tag || assetForTransform?.label;
              const shared = room?.id && sharedKey
                ? getPortraitTransformRel({
                    roomId: room.id,
                    characterId: portrait.characterId,
                    key: sharedKey,
                    position: posKey,
                  })
                : null;
              const hasPosition = assetForTransform ? hasPositionTransformColumns(assetForTransform, posKey) : false;
              const assetPosRel = assetForTransform && hasPosition ? getAssetTransformRel(assetForTransform, posKey) : null;
              const assetLegacyRel = assetForTransform && !hasPosition ? getAssetLegacyTransformRel(assetForTransform) : null;
              const baseX = 0.5;
              const offsetXRel = typeof shared?.x === 'number'
                ? shared.x
                : (typeof assetPosRel?.x === 'number'
                  ? assetPosRel.x
                  : (typeof assetLegacyRel?.x === 'number'
                    ? assetLegacyRel.x
                    : (typeof portrait.offsetXRel === 'number'
                      ? portrait.offsetXRel
                      : (typeof portrait.offsetX === 'number' && stageSize.width > 0 ? portrait.offsetX / stageSize.width : 0))));
              const offsetYRel = typeof shared?.y === 'number'
                ? shared.y
                : (typeof assetPosRel?.y === 'number'
                  ? assetPosRel.y
                  : (typeof assetLegacyRel?.y === 'number'
                    ? assetLegacyRel.y
                    : (typeof portrait.offsetYRel === 'number'
                      ? portrait.offsetYRel
                      : (typeof portrait.offsetY === 'number' && stageSize.height > 0 ? portrait.offsetY / stageSize.height : 0))));
              const scale = typeof shared?.scale === 'number'
                ? shared.scale
                : (typeof assetPosRel?.scale === 'number'
                  ? assetPosRel.scale
                  : (typeof assetLegacyRel?.scale === 'number'
                    ? assetLegacyRel.scale
                    : (portrait.scale ?? 1)));
              const { heightPx, offsetXPx, offsetYPx, baseHeightPx, shiftRel } = getPortraitRenderMetrics({
                containerWidth: stageSize.width,
                containerHeight: stageSize.height,
                scale,
                offsetXRel,
                offsetYRel,
                position: posKey,
              });
              const transform = `translate(-50%, 0) translate(${offsetXPx}px, ${offsetYPx}px)`;
              if (isPortraitDebug()) {
                const debugKey = `${portrait.characterId}:${sharedKey ?? ''}:${posKey}`;
                const payload = {
                  stageSize,
                  scale,
                  offsetXRel,
                  offsetYRel,
                  baseHeightPx,
                  shiftRel,
                  heightPx,
                  offsetXPx,
                  offsetYPx,
                  transform,
                  maxHeight: 'none',
                  maxWidth: 'none',
                };
                const next = JSON.stringify(payload);
                const prev = portraitDebugRef.current.get(debugKey);
                if (prev !== next) {
                  portraitDebugRef.current.set(debugKey, next);
                  console.log('[PortraitStage][style]', payload);
                }
              }
              return (
                <div
                  key={`${portrait.characterId}-${index}`}
                  className="portrait-layer"
                  style={{
                    left: `${baseX * 100}%`,
                    zIndex: portrait.layerOrder,
                    height: heightPx,
                    width: 'auto',
                    maxHeight: 'none',
                    maxWidth: 'none',
                    transform,
                    transformOrigin: 'bottom center',
                  }}
                >
                  <img
                    src={portrait.url}
                    alt={portrait.label}
                    className="animate-fade-in"
                    style={{ height: '100%', width: 'auto', maxHeight: 'none', maxWidth: 'none', objectFit: 'contain' }}
                  />
                </div>
              );
            })()
          ))}
        </div>
      )}

      {/* Effects Overlay (critical/fumble) */}
      {!showSecretOverlay && effectOverlay && effectOverlay.images.length > 0 && (
        <div
          className={`absolute inset-0 z-25 pointer-events-none transition-opacity duration-300 ${
            effectFading ? 'opacity-0' : 'opacity-100'
          }`}
        >
          <div
            className="absolute left-1/2 top-1/2"
            style={{
              width: overlayWidth,
              height: overlayHeight,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <div
              className="relative"
              style={{
                width: EFFECT_BASE_WIDTH,
                height: EFFECT_BASE_HEIGHT,
                transform: `scale(${overlayScale})`,
                transformOrigin: 'top left',
              }}
            >
              {effectOverlay.images.map((item) => {
                const anchor = item.anchor === 'top-left' ? 'top-left' : 'center';
                const left = anchor === 'top-left'
                  ? item.x * EFFECT_BASE_WIDTH
                  : EFFECT_BASE_WIDTH / 2 + item.x * EFFECT_BASE_WIDTH;
                const top = anchor === 'top-left'
                  ? item.y * EFFECT_BASE_HEIGHT
                  : EFFECT_BASE_HEIGHT / 2 + item.y * EFFECT_BASE_HEIGHT;
                const baseTransform = anchor === 'top-left' ? 'translate(0, 0)' : 'translate(-50%, -50%)';
                const transformOrigin = anchor === 'top-left' ? 'top left' : 'center';
                return (
                <div
                  key={item.id}
                  className="absolute"
                  style={{
                    left,
                    top,
                    transform: `${baseTransform} rotate(${item.rotate}deg) scale(${item.scale})`,
                    transformOrigin,
                    opacity: item.opacity,
                    zIndex: item.z,
                  }}
                >
                  <img
                    src={item.url}
                    alt={item.label}
                    className="object-contain"
                    style={{ maxWidth: EFFECT_BASE_WIDTH, maxHeight: EFFECT_BASE_HEIGHT }}
                  />
                </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Title Screen Overlay */}
      {titleScreenVisible && titleScreenRender.images.length > 0 && (
        <div className="absolute inset-0 z-20 pointer-events-none">
          <div
            className="absolute left-1/2 top-1/2"
            style={{
              width: overlayWidth,
              height: overlayHeight,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <div
              className="relative"
              style={{
                width: EFFECT_BASE_WIDTH,
                height: EFFECT_BASE_HEIGHT,
                transform: `scale(${overlayScale})`,
                transformOrigin: 'top left',
              }}
            >
              {titleScreenRender.images.map((item) => {
                const anchor = item.anchor === 'top-left' ? 'top-left' : 'center';
                const left = anchor === 'top-left'
                  ? item.x * EFFECT_BASE_WIDTH
                  : EFFECT_BASE_WIDTH / 2 + item.x * EFFECT_BASE_WIDTH;
                const top = anchor === 'top-left'
                  ? item.y * EFFECT_BASE_HEIGHT
                  : EFFECT_BASE_HEIGHT / 2 + item.y * EFFECT_BASE_HEIGHT;
                const baseTransform = anchor === 'top-left' ? 'translate(0, 0)' : 'translate(-50%, -50%)';
                const transformOrigin = anchor === 'top-left' ? 'top left' : 'center';
                return (
                <div
                  key={item.id}
                  className="absolute"
                  style={{
                    left,
                    top,
                    transform: `${baseTransform} rotate(${item.rotate}deg) scale(${item.scale})`,
                    transformOrigin,
                    opacity: item.opacity,
                    zIndex: item.z,
                  }}
                >
                  <img
                    src={item.url}
                    alt={item.label}
                    className="object-contain"
                    style={{ maxWidth: EFFECT_BASE_WIDTH, maxHeight: EFFECT_BASE_HEIGHT }}
                  />
                </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Secret Overlay */}
      {showSecretOverlay && (
        <div className="secret-overlay">
          <div className="text-center">
            <div className="text-4xl mb-4">🔒</div>
            <h3 className="font-display text-xl text-primary glow-text">
              秘匿進行中
            </h3>
            <p className="text-muted-foreground text-sm mt-2">
              このシーンはあなたには見えません
            </p>
          </div>
        </div>
      )}

      {/* Local-only toggle button when hidden (overlay layout only) */}
      {textLayout === 'overlay' && !textWindowVisible && !titleScreenVisible && (
        <div className="absolute bottom-3 right-3 z-30">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onToggleTextWindow(true)}
            title="Ctrl/Cmd+Shift+Y で表示/非表示"
          >
            テキスト表示
          </Button>
        </div>
      )}

      {/* Audio unlock (browser autoplay restrictions) */}
      {audioNeedsUnlock && (
        <div className="absolute bottom-3 left-3 z-30">
          <Button variant="secondary" size="sm" onClick={handleUnlockAudio}>
            音声を有効化
          </Button>
        </div>
      )}

      {/* Text Window */}
      {textLayout === 'overlay' && textWindowVisible && !showSecretOverlay && !titleScreenVisible && (
        <div
          className="absolute left-0 right-0 z-30 novel-text-window flex flex-col overflow-hidden"
          style={{ ...textWindowStyle, height: overlayTextHeightPx, bottom: 8 }}
        >
        {/* Toolbar */}
        <StageToolbar
          room={room}
          messages={messages}
          stageState={stageState}
          participants={participants}
          participant={participant}
          isGM={isGM}
          canViewSecret={canViewSecret}
          characters={characters}
          onUpdateRoom={onUpdateRoom}
        />

        <ScrollArea className="flex-1 min-h-0 px-6 py-4" ref={scrollRef}>
          <div ref={scrollContentRef} className="space-y-3">
            {visibleMessages.map((message) => (
              <MessageBubble key={message.id} message={message} viewerParticipantId={participant?.id ?? null} />
            ))}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
        </div>
      )}

    </div>
  );
}
