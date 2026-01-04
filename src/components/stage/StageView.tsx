import { useRef, useEffect, useState } from 'react';
import type { Message, StageState, Participant, Room, Character } from '@/types/trpg';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { MessageBubble } from './MessageBubble';
import { StageToolbar } from './StageToolbar';

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
}: StageViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const bgmRef = useRef<HTMLAudioElement>(null);
  const seRef = useRef<HTMLAudioElement>(null);
  const textWindowStorageKey = `trpg:textWindowVisible:${room?.id ?? 'global'}`;
  const [textWindowVisible, setTextWindowVisible] = useState(() => {
    try {
      const raw = localStorage.getItem(textWindowStorageKey);
      if (raw === null) return true;
      return raw === '1';
    } catch {
      return true;
    }
  });
  const [audioNeedsUnlock, setAudioNeedsUnlock] = useState(false);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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

  const handleUnlockAudio = async () => {
    setAudioNeedsUnlock(false);
    try {
      if (bgmUrl && bgmRef.current) {
        await bgmRef.current.play();
      }
    } catch {
      setAudioNeedsUnlock(true);
    }
  };

  // Ctrl+H toggles text window visibility (local only)
  // Note: Cmd+H is reserved by macOS ("Hide app") and usually won't reach the browser.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'h') return;
      const isCtrlH = e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey;
      const isCmdShiftH = e.metaKey && e.shiftKey;
      if (!(isCtrlH || isCmdShiftH)) return;
      e.preventDefault();
      setTextWindowVisible(prev => {
        const next = !prev;
        try {
          localStorage.setItem(textWindowStorageKey, next ? '1' : '0');
        } catch {
          // ignore
        }
        return next;
      });
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [textWindowStorageKey]);

  // Filter messages for secret channel
  const visibleMessages = messages.filter(msg => {
    if (msg.channel === 'public') return true;
    if (msg.channel === 'secret') {
      if (!participant) return false;
      return canViewSecret || msg.secret_allow_list.includes(participant.id);
    }
    return true;
  });

  const showSecretOverlay = isSecret && !canViewSecret;

  // Apply theme styles
  const theme = room?.theme || {};
  const textWindowStyle: React.CSSProperties = {
    ...(theme.textWindowBg && { backgroundImage: `url(${theme.textWindowBg})`, backgroundSize: 'cover' }),
    ...(theme.textWindowOpacity && { opacity: theme.textWindowOpacity }),
    ...(theme.fontSize && { fontSize: `${theme.fontSize}px` }),
    ...(theme.lineHeight && { lineHeight: theme.lineHeight }),
    ...(theme.padding && { padding: `${theme.padding}px` }),
    ...(theme.textColor && { color: theme.textColor }),
    ...(theme.borderColor && { borderColor: theme.borderColor }),
  };

  return (
    <div className="relative h-full w-full overflow-hidden rounded-t-lg rounded-b-none bg-cthulhu-deep">
      <audio ref={bgmRef} className="hidden" />
      <audio ref={seRef} className="hidden" />
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
            <div
              key={`${portrait.characterId}-${index}`}
              className="portrait-layer"
              style={{
                left: portrait.position === 'left' ? '10%' : 
                      portrait.position === 'right' ? '60%' : '35%',
                zIndex: portrait.layerOrder,
                maxHeight: '80%',
                transform: `translate(${portrait.offsetX ?? 0}px, ${portrait.offsetY ?? 0}px) scale(${portrait.scale ?? 1})`,
                transformOrigin: 'bottom center',
              }}
            >
              <img
                src={portrait.url}
                alt={portrait.label}
                className="h-auto max-h-[70vh] object-contain animate-fade-in"
              />
            </div>
          ))}
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

      {/* Local-only toggle button when hidden */}
      {!textWindowVisible && (
        <div className="absolute bottom-3 right-3 z-30">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setTextWindowVisible(true)}
            title="Ctrl+H (または Cmd+Shift+H) で表示/非表示"
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
      {textWindowVisible && !showSecretOverlay && (
        <div className="absolute bottom-0 left-0 right-0 z-30 novel-text-window" style={textWindowStyle}>
        {/* Toolbar */}
        <StageToolbar
          room={room}
          messages={messages}
          stageState={stageState}
          participants={participants}
          participant={participant}
          isGM={isGM}
          characters={characters}
          onUpdateRoom={onUpdateRoom}
        />

        <ScrollArea className="h-[250px] px-6 py-4" ref={scrollRef}>
          <div className="space-y-3">
            {visibleMessages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
        </div>
      )}
    </div>
  );
}
