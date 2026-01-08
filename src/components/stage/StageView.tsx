import { useRef, useEffect, useState, useCallback, useLayoutEffect } from 'react';
import type { Message, StageState, Participant, Room, Character, Asset } from '@/types/trpg';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { MessageBubble } from './MessageBubble';
import { StageToolbar } from './StageToolbar';
import { supabase } from '@/integrations/supabase/client';
import { Dice6 } from 'lucide-react';
import {
  buildEffectRenderList,
  buildOtherEffectRenderList,
  loadEffectsConfig,
  shouldTriggerEffectsForMessage,
  shouldTriggerOtherEffectsForMessage,
  type EffectImage,
} from '@/lib/effects';

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
}: StageViewProps) {
  const stageRootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollContentRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const bgmRef = useRef<HTMLAudioElement>(null);
  const seRef = useRef<HTMLAudioElement>(null);
  const effectsSeRef = useRef<HTMLAudioElement>(null);
  const roomId = room?.id || '';
  const textWindowStorageKey = roomId ? `trpg:textWindowVisible:${roomId}` : null;
  const [textWindowVisible, setTextWindowVisible] = useState(true);
  const [audioNeedsUnlock, setAudioNeedsUnlock] = useState(false);
  const [portraitAssets, setPortraitAssets] = useState<Asset[]>([]);
  const lastHandledMessageIdRef = useRef<string | null>(null);
  const [effectOverlay, setEffectOverlay] = useState<{ nonce: number; images: EffectImage[]; seUrl: string; durationMs: number } | null>(null);
  const [diceOverlay, setDiceOverlay] = useState<{ nonce: number; text: string } | null>(null);
  const lastDiceOverlayIdRef = useRef<string | null>(null);
  const [effectFading, setEffectFading] = useState(false);
  const [stageSize, setStageSize] = useState<{ width: number; height: number }>({ width: 1200, height: 675 });
  const overlayTextHeightPx = (() => {
    // Keep the overlay window from covering the entire stage when the stage gets small.
    const desired = stageSize.height * 0.33;
    const hardCap = Math.max(80, stageSize.height - 40); // leave some stage visible
    return Math.round(Math.min(hardCap, Math.min(280, Math.max(120, desired))));
  })();

  // Load per-room visibility preference once room id becomes available
  useEffect(() => {
    if (!textWindowStorageKey) return;
    try {
      const raw = localStorage.getItem(textWindowStorageKey);
      if (raw === null) return; // default: visible
      setTextWindowVisible(raw === '1');
    } catch {
      // ignore
    }
  }, [textWindowStorageKey]);

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

  // Toggle text window visibility (local only, overlay layout only)
  // Note: Cmd+H is reserved by macOS ("Hide app") and usually won't reach the browser.
  useEffect(() => {
    if (textLayout !== 'overlay') return;
    const handler = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'h') return;
      const isCtrlH = e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey;
      const isCtrlShiftH = e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey;
      const isCmdShiftH = e.metaKey && e.shiftKey;
      if (!(isCtrlH || isCtrlShiftH || isCmdShiftH)) return;
      e.preventDefault();
      setTextWindowVisible(prev => {
        const next = !prev;
        if (textWindowStorageKey) {
          try {
            localStorage.setItem(textWindowStorageKey, next ? '1' : '0');
          } catch {
            // ignore
          }
        }
        return next;
      });
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [textWindowStorageKey, textLayout]);

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
    if (textLayout !== 'overlay' || !textWindowVisible || showSecretOverlay) return;
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
  }, [scrollToBottom, showSecretOverlay, textLayout, textWindowVisible]);

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

  // Fetch portrait assets for resolving PC tags in effects
  useEffect(() => {
    const roomId = room?.id;
    if (!roomId) {
      setPortraitAssets([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('assets')
        .select('id,room_id,character_id,kind,url,label,tag,is_default,layer_order,created_at')
        .eq('room_id', roomId)
        .eq('kind', 'portrait');
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
  }, [room?.id]);

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
    const built = buildOtherEffectRenderList(otherTrigger);

    setEffectFading(false);
    setEffectOverlay((prev) => ({
      nonce: (prev?.nonce ?? 0) + 1,
      images: built.images,
      seUrl: built.seUrl,
      durationMs: built.durationMs,
    }));
  }, [visibleMessages, participant, room, characters, portraitAssets, showSecretOverlay]);

  // Dice roll overlay (BCDice output)
  useEffect(() => {
    if (showSecretOverlay) return;
    const last = visibleMessages[visibleMessages.length - 1] ?? null;
    if (!last || last.type !== 'dice') return;
    if (last.channel === 'chat') return;
    if (lastDiceOverlayIdRef.current === last.id) return;

    const payload: any = (last as any).dice_payload;
    const allowList = Array.isArray((last as any).secret_allow_list) ? (last as any).secret_allow_list : [];
    const canSeeFull = !payload?.blind || (!!participant && allowList.includes(participant.id));
    if (!canSeeFull) return;

    const output = String(payload?.output || last.text || '').trim();
    if (!output) return;

    lastDiceOverlayIdRef.current = last.id;
    setDiceOverlay((prev) => ({ nonce: (prev?.nonce ?? 0) + 1, text: output }));
    const t = window.setTimeout(() => setDiceOverlay(null), 2400);
    return () => window.clearTimeout(t);
  }, [visibleMessages, participant, showSecretOverlay]);

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

      {/* Portrait Layer */}
      {!showSecretOverlay && stageState?.active_portraits && (
        <div className="absolute inset-0 z-20 pointer-events-none">
          {stageState.active_portraits.map((portrait, index) => (
            (() => {
              const baseX = 0.5;
              const shift = 0.225; // relative to stage width
              const positionShiftXRel = portrait.position === 'left' ? -shift : portrait.position === 'right' ? shift : 0;
              const positionShiftX = stageSize.width * positionShiftXRel;
              const offsetX = typeof portrait.offsetXRel === 'number' ? portrait.offsetXRel * stageSize.width : (portrait.offsetX ?? 0);
              const offsetY = typeof portrait.offsetYRel === 'number' ? portrait.offsetYRel * stageSize.height : (portrait.offsetY ?? 0);
              return (
            <div
              key={`${portrait.characterId}-${index}`}
              className="portrait-layer"
              style={{
                left: `${baseX * 100}%`,
                zIndex: portrait.layerOrder,
                maxHeight: '80%',
                transform: `translate(-50%, 0) translate(${offsetX + positionShiftX}px, ${offsetY}px) scale(${portrait.scale ?? 1})`,
                transformOrigin: 'bottom center',
              }}
            >
              <img
                src={portrait.url}
                alt={portrait.label}
                className="h-auto max-h-[70vh] object-contain animate-fade-in"
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
            className="absolute left-0 top-0"
            style={{
              width: EFFECT_BASE_WIDTH,
              height: EFFECT_BASE_HEIGHT,
              transform: `scale(${stageSize.width / EFFECT_BASE_WIDTH}, ${stageSize.height / EFFECT_BASE_HEIGHT})`,
              transformOrigin: 'top left',
            }}
          >
            {effectOverlay.images.map((item) => (
              <div
                key={item.id}
                className="absolute"
                style={{
                  left: EFFECT_BASE_WIDTH / 2 + item.x * EFFECT_BASE_WIDTH,
                  top: EFFECT_BASE_HEIGHT / 2 + item.y * EFFECT_BASE_HEIGHT,
                  transform: `translate(-50%, -50%) rotate(${item.rotate}deg) scale(${item.scale})`,
                  transformOrigin: 'center',
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
            ))}
          </div>
        </div>
      )}

      {/* Dice Roll Overlay */}
      {!showSecretOverlay && diceOverlay && (
        <div className="absolute inset-0 z-[26] pointer-events-none flex items-center justify-center">
          <div className="dice-roll-overlay">
            <Dice6 className="dice-roll-icon" />
            <div className="dice-roll-text">{diceOverlay.text}</div>
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
      {textLayout === 'overlay' && !textWindowVisible && (
        <div className="absolute bottom-3 right-3 z-30">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setTextWindowVisible(true)}
            title="Ctrl+H / Ctrl+Shift+H (または Cmd+Shift+H) で表示/非表示"
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
      {textLayout === 'overlay' && textWindowVisible && !showSecretOverlay && (
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
