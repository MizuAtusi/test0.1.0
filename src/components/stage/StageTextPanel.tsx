import type { Character, Message, Participant, Room, StageState } from '@/types/trpg';
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { StageToolbar } from './StageToolbar';
import { MessageBubble } from './MessageBubble';
import { getDisplayText } from '@/lib/expressionTag';

export function StageTextPanel(props: {
  messages: Message[];
  stageState: StageState | null;
  room: Room | null;
  participants: Participant[];
  participant: Participant | null;
  isSecret: boolean;
  canViewSecret: boolean;
  isGM: boolean;
  characters: Character[];
  onUpdateRoom: (updates: Partial<Room>) => void;
}) {
  const {
    messages,
    stageState,
    room,
    participants,
    participant,
    isSecret,
    canViewSecret,
    isGM,
    characters,
    onUpdateRoom,
  } = props;

  const showSecretOverlay = isSecret && !canViewSecret;
  const visibleMessages = messages.filter((msg) => {
    if (
      msg.type === 'system'
      && /\[(bg|portrait|bgm|se|speaker|npc_disclosure|effects_config|effects_other|portrait_transform):[^\]]+\]/i.test(msg.text)
    ) {
      return false;
    }
    const displayText = getDisplayText(msg.text);
    if (!displayText && msg.type !== 'dice') return false;
    if (msg.channel === 'public') return true;
    if (msg.channel === 'secret') {
      if (canViewSecret) return true;
      if (!participant) return false;
      return msg.secret_allow_list.includes(participant.id);
    }
    return true;
  });

  const theme = room?.theme || {};
  const textWindowStyle: CSSProperties = {
    ...(theme.textWindowBg && { backgroundImage: `url(${theme.textWindowBg})`, backgroundSize: 'cover' }),
    ...(theme.textWindowOpacity && { opacity: theme.textWindowOpacity }),
    ...(theme.fontSize && { fontSize: `${theme.fontSize}px` }),
    ...(theme.lineHeight && { lineHeight: theme.lineHeight }),
    ...(theme.padding && { padding: `${theme.padding}px` }),
    ...(theme.textColor && { color: theme.textColor }),
    ...(theme.borderColor && { borderColor: theme.borderColor }),
  };

  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollContentRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback((behavior: ScrollBehavior) => {
    const root = scrollRef.current;
    const viewport = (root?.querySelector?.('[data-radix-scroll-area-viewport]') ?? null) as HTMLElement | null;
    if (viewport) {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior });
      return;
    }
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  // Always keep the newest message visible (including on first load/join)
  const lastVisibleCountRef = useRef(0);
  useLayoutEffect(() => {
    if (showSecretOverlay) return;
    const nextCount = visibleMessages.length;
    const behavior: ScrollBehavior = lastVisibleCountRef.current === 0 ? 'auto' : 'smooth';
    lastVisibleCountRef.current = nextCount;
    scrollToBottom(behavior);
    const raf = window.requestAnimationFrame(() => scrollToBottom(behavior));
    return () => window.cancelAnimationFrame(raf);
  }, [scrollToBottom, showSecretOverlay, visibleMessages.length]);

  // Keep scroll pinned to bottom even when the viewport/content size changes (layout changes)
  useEffect(() => {
    if (showSecretOverlay) return;
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
  }, [scrollToBottom, showSecretOverlay]);

  if (showSecretOverlay) {
    return (
      <div className="h-full w-full rounded-b-lg border border-border/30 bg-card flex items-center justify-center">
        <div className="text-center">
          <div className="text-3xl mb-2">🔒</div>
          <div className="font-display text-lg text-primary glow-text">秘匿進行中</div>
          <div className="text-sm text-muted-foreground mt-1">このシーンはあなたには見えません</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full rounded-b-lg border border-border/30 novel-text-window overflow-hidden flex flex-col min-h-0" style={textWindowStyle}>
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
  );
}
