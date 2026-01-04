import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { Loader2, ArrowLeft, Copy, Users } from 'lucide-react';
import { useRoom } from '@/hooks/useRoom';
import { StageView } from '@/components/stage/StageView';
import { InputBar } from '@/components/stage/InputBar';
import { SidePanel } from '@/components/sidebar/SidePanel';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { getPortraitTransform } from '@/lib/portraitTransforms';
import { getCharacterAvatarUrl } from '@/lib/characterAvatar';
import type { Room } from '@/types/trpg';

const SIDE_PANEL_WIDTH_STORAGE_KEY = 'trpg:sidePanelWidth';
const DEFAULT_SIDE_PANEL_WIDTH = 320; // w-80
const MIN_SIDE_PANEL_WIDTH = 280;
const MAX_SIDE_PANEL_WIDTH = 720;

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [sidePanelWidth, setSidePanelWidth] = useState(() => {
    const raw = localStorage.getItem(SIDE_PANEL_WIDTH_STORAGE_KEY);
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    if (!Number.isFinite(parsed)) return DEFAULT_SIDE_PANEL_WIDTH;
    return Math.min(MAX_SIDE_PANEL_WIDTH, Math.max(MIN_SIDE_PANEL_WIDTH, parsed));
  });
  const resizeStateRef = useRef<{ startX: number; startWidth: number } | null>(null);
  
  const {
    room,
    participant,
    participants,
    messages,
    stageState,
    characters,
    bgmUrl,
    se,
    loading,
    isGM,
    sendMessage,
    updateStageState,
    updateRoom,
    refreshCharacters,
  } = useRoom(roomId || null);

  // Get current player's character (if any)
  const myCharacter = participant
    ? characters.find(c => c.owner_participant_id === participant.id) ?? null
    : null;

  const [speakerValue, setSpeakerValue] = useState<string>('participant'); // 'participant' | characterId
  useEffect(() => {
    if (!participant) return;
    setSpeakerValue(prev => {
      if (prev !== 'participant') return prev;
      if (myCharacter?.id) return myCharacter.id;
      return participant.role === 'GM' ? 'gm' : 'participant';
    });
  }, [participant, myCharacter?.id]);

  // Check if user has joined
  useEffect(() => {
    if (!loading && room && !participant) {
      // User hasn't joined this room, redirect to lobby
      navigate('/');
    }
  }, [loading, room, participant, navigate]);

  const handleCopyRoomId = () => {
    if (roomId) {
      navigator.clipboard.writeText(roomId);
      toast({ title: 'ルームIDをコピーしました' });
    }
  };

  const handleSendMessage = (
    type: 'speech' | 'mono' | 'system' | 'dice',
    text: string,
    options?: { dicePayload?: any; expressionTags?: string[]; portraitOnly?: boolean; speakerValue?: string }
  ) => {
    if (!participant) return;
    
    const requestedSpeakerValue = options?.speakerValue ?? 'participant';
    const isGmSpeaker = requestedSpeakerValue === 'gm' && participant.role === 'GM';
    const requestedCharacter =
      requestedSpeakerValue !== 'participant'
        ? characters.find(c => c.id === requestedSpeakerValue) ?? null
        : null;
    const canUseCharacter = requestedCharacter
      ? (participant.role === 'GM' || requestedCharacter.owner_participant_id === participant.id)
      : false;
    const speakerCharacter = canUseCharacter ? requestedCharacter : null;
    const speakerName = isGmSpeaker ? 'GM' : (speakerCharacter?.name || myCharacter?.name || participant.name);
    const speakerAvatarUrl = isGmSpeaker
      ? null
      : (speakerCharacter?.avatar_url || (speakerCharacter ? getCharacterAvatarUrl(speakerCharacter.id) : null));

    const expressionTags = options?.expressionTags || [];
    const normalizedTags = expressionTags.map(t => t.trim().toLowerCase()).filter(Boolean);
    const lastRawTag = normalizedTags.length > 0 ? normalizedTags[normalizedTags.length - 1] : null;

    const parseTagToken = (token: string) => {
      const idx = token.lastIndexOf(':');
      if (idx <= 0) return { key: token, position: null as null | 'left' | 'center' | 'right' };
      const key = token.slice(0, idx);
      const pos = token.slice(idx + 1);
      if (pos === 'left' || pos === 'center' || pos === 'right') return { key, position: pos };
      return { key: token, position: null as null | 'left' | 'center' | 'right' };
    };
    const lastToken = lastRawTag ? parseTagToken(lastRawTag) : null;
    const requestedChannel = options?.channel || 'public';
    const isChat = requestedChannel === 'chat';
    const secretChannel = stageState?.is_secret && !isChat ? 'secret' : null;
    const secretAllowList = stageState?.is_secret && !isChat ? (stageState?.secret_allow_list || []) : null;

    const sendWithSecret = async (
      t: typeof type,
      body: string,
      speaker: string,
      extra?: any,
    ) => {
      return sendMessage(t, body, speaker, {
        ...extra,
        ...options,
        channel: secretChannel || requestedChannel,
        secretAllowList: secretAllowList ?? (isChat ? [] : options?.secretAllowList),
      });
    };

    const applyPortraitAndSend = async () => {
      // GM speaker: allow special stage operations without a character selected
      if (isGmSpeaker) {
        if (normalizedTags.length > 0 && lastToken?.key === 'delete') {
          const pcIds = new Set(characters.filter(c => !c.is_npc).map(c => c.id));
          const base = stageState?.active_portraits ?? [];
          const next = base.filter(p => !pcIds.has(p.characterId));
          await updateStageState({ active_portraits: next });
        }
        if (!options?.portraitOnly) {
          await sendWithSecret(type, text, speakerName, { portraitUrl: undefined });
        }
        return;
      }

      if (!speakerCharacter || normalizedTags.length === 0) {
        if (!options?.portraitOnly) {
          await sendWithSecret(type, text, speakerName, { portraitUrl: speakerAvatarUrl || undefined });
        }
        return;
      }

      // {delete} (last one wins) removes the portrait for this character
      if (lastToken?.key === 'delete') {
        const base = stageState?.active_portraits ?? [];
        const next = base.filter(p => p.characterId !== speakerCharacter.id);
        await updateStageState({ active_portraits: next });

        if (!options?.portraitOnly) {
          await sendWithSecret(type, text, speakerName, { portraitUrl: speakerAvatarUrl || undefined });
        }
        return;
      }

      const { data: assets, error: assetsError } = await supabase
        .from('assets')
        .select('id,url,label,tag,is_default,scale,offset_x,offset_y')
        .eq('character_id', speakerCharacter.id)
        .eq('kind', 'portrait');

      // Backward compatibility: if DB doesn't have new columns yet
      let portraitAssets = assets as any;
      let portraitAssetsError = assetsError as any;
      if (portraitAssetsError) {
        const message = portraitAssetsError.message || '';
        const looksLikeMissingColumns =
          message.includes('scale') || message.includes('offset_x') || message.includes('offset_y');
        if (looksLikeMissingColumns) {
          const fallback = await supabase
            .from('assets')
            .select('id,url,label,tag,is_default')
            .eq('character_id', speakerCharacter.id)
            .eq('kind', 'portrait');
          portraitAssets = fallback.data as any;
          portraitAssetsError = fallback.error as any;
        }
      }

      if (portraitAssetsError || !portraitAssets || portraitAssets.length === 0) {
        if (!options?.portraitOnly) {
          await sendWithSecret(type, text, speakerName, { portraitUrl: speakerAvatarUrl || undefined });
        } else {
          toast({ title: '立ち絵が見つかりません', variant: 'destructive' });
        }
        return;
      }

      const byTag = new Map<
        string,
        { id: string; url: string; label: string; tag: string; scale?: number | null; offset_x?: number | null; offset_y?: number | null }
      >();
      const byLabel = new Map<
        string,
        { id: string; url: string; label: string; tag: string; scale?: number | null; offset_x?: number | null; offset_y?: number | null }
      >();

      for (const a of portraitAssets as Array<{
        id: string;
        url: string;
        label: string;
        tag: string;
        is_default: boolean;
        scale?: number | null;
        offset_x?: number | null;
        offset_y?: number | null;
      }>) {
        byLabel.set(a.label.toLowerCase(), a);
        if (a.tag) byTag.set(a.tag.toLowerCase(), a);
      }

      let chosen:
        | { id: string; url: string; label: string; tag: string; scale?: number | null; offset_x?: number | null; offset_y?: number | null }
        | null = null;
      let positionOverride: null | 'left' | 'center' | 'right' = null;
      for (let i = normalizedTags.length - 1; i >= 0; i--) {
        const token = parseTagToken(normalizedTags[i]);
        const hit = byTag.get(token.key) ?? byLabel.get(token.key);
        if (hit) {
          chosen = hit;
          positionOverride = token.position;
          break;
        }
      }

      if (!chosen) {
        if (!options?.portraitOnly) {
          await sendWithSecret(type, text, speakerName, { portraitUrl: speakerAvatarUrl || undefined });
        } else {
          toast({ title: '立ち絵が見つかりません', variant: 'destructive' });
        }
        return;
      }

      // Update stage portrait (last tag wins)
      const base = stageState?.active_portraits ?? [];
      const newPortraits = [...base];
      const existingIndex = newPortraits.findIndex(p => p.characterId === speakerCharacter.id);
      const newPortrait = {
        characterId: speakerCharacter.id,
        assetId: chosen.id,
        url: chosen.url,
        label: chosen.label,
        tag: chosen.tag,
        position: positionOverride ?? 'center',
        layerOrder: existingIndex >= 0 ? newPortraits[existingIndex].layerOrder : newPortraits.length,
        scale: (() => {
          if (typeof chosen.scale === 'number') return chosen.scale;
          const t = getPortraitTransform(speakerCharacter.id, chosen.tag || chosen.label);
          return t?.scale ?? 1;
        })(),
        offsetX: (() => {
          if (typeof chosen.offset_x === 'number') return chosen.offset_x;
          const t = getPortraitTransform(speakerCharacter.id, chosen.tag || chosen.label);
          return t?.offsetX ?? 0;
        })(),
        offsetY: (() => {
          if (typeof chosen.offset_y === 'number') return chosen.offset_y;
          const t = getPortraitTransform(speakerCharacter.id, chosen.tag || chosen.label);
          return t?.offsetY ?? 0;
        })(),
      };
      if (existingIndex >= 0) newPortraits[existingIndex] = newPortrait;
      else newPortraits.push(newPortrait);

      await updateStageState({ active_portraits: newPortraits });

      if (!options?.portraitOnly) {
        await sendWithSecret(type, text, speakerName, { portraitUrl: speakerAvatarUrl || undefined });
      }
    };

    void applyPortraitAndSend();
  };

  const handleSendMessageFull = (
    type: 'speech' | 'mono' | 'system' | 'dice',
    text: string,
    speakerName: string,
    options?: any
  ) => {
    const requestedChannel = options?.channel || 'public';
    const isChat = requestedChannel === 'chat';
    const secretChannel = stageState?.is_secret && !isChat ? 'secret' : null;
    const secretAllowList = stageState?.is_secret && !isChat ? (stageState?.secret_allow_list || []) : null;
    sendMessage(type, text, speakerName, {
      ...options,
      channel: secretChannel || requestedChannel,
      secretAllowList: secretAllowList ?? (isChat ? [] : options?.secretAllowList),
    });
  };

  const handleUpdateRoom = async (updates: Partial<Room>) => {
    await updateRoom(updates);
  };

  useEffect(() => {
    localStorage.setItem(SIDE_PANEL_WIDTH_STORAGE_KEY, String(sidePanelWidth));
  }, [sidePanelWidth]);

  // Determine if current user can view secret content
  const canViewSecret = isGM || (
    participant && 
    stageState?.secret_allow_list?.includes(participant.id)
  );
  const isExcludedFromSecret = !!(stageState?.is_secret && participant && !canViewSecret);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto" />
          <p className="mt-4 text-muted-foreground">読み込み中...</p>
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-xl text-foreground">ルームが見つかりません</p>
          <Button onClick={() => navigate('/')} className="mt-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            ロビーに戻る
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <header className="h-12 border-b border-border bg-card flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            退出
          </Button>
          <div className="h-4 w-px bg-border" />
          <h1 className="font-display text-lg text-foreground">{room.name}</h1>
          {isGM && (
            <span className="text-xs bg-accent text-accent-foreground px-2 py-0.5 rounded">
              GM
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="w-4 h-4" />
            {participants.length}
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleCopyRoomId}
            className="text-xs"
          >
            <Copy className="w-3 h-3 mr-1" />
            ID
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex min-h-0">
        {/* Stage Area (Left 3/4) */}
        <div className="flex-1 flex flex-col min-w-0" style={{ flexBasis: '75%' }}>
          <div className="flex-1 min-h-0 px-4 pt-4 pb-0 -mb-4">
            <StageView
              messages={messages.filter(m => m.channel !== 'chat')}
              stageState={stageState}
              bgmUrl={bgmUrl}
              se={se}
              room={room}
              participants={participants}
              participant={participant}
              isSecret={stageState?.is_secret || false}
              canViewSecret={canViewSecret || false}
              isGM={isGM}
              characters={characters}
              onUpdateRoom={handleUpdateRoom}
            />
          </div>
          
          <InputBar
            participantName={participant?.name || ''}
            speakerValue={speakerValue}
            onSpeakerValueChange={setSpeakerValue}
            onSendMessage={(type, text, options) => handleSendMessage(type, text, { ...options, speakerValue })}
            showGmOption={participant?.role === 'GM'}
            disabled={isExcludedFromSecret}
            disabledReason="秘匿モード中は閲覧できません"
            characters={participant?.role === 'GM'
              ? characters
              : characters.filter(c => c.owner_participant_id === participant?.id)}
            currentCharacter={speakerValue !== 'participant'
              && speakerValue !== 'gm'
              ? characters.find(c => c.id === speakerValue) ?? null
              : null}
          />
        </div>

        {/* Side Panel (Right 1/4) */}
        <div className="shrink-0 relative" style={{ width: sidePanelWidth }}>
          <div
            className="absolute left-0 top-0 bottom-0 w-3 -translate-x-1.5 cursor-col-resize hidden md:block"
            onMouseDown={(e) => {
              e.preventDefault();
              resizeStateRef.current = { startX: e.clientX, startWidth: sidePanelWidth };

              const body = document.body;
              const prevCursor = body.style.cursor;
              const prevUserSelect = body.style.userSelect;
              body.style.cursor = 'col-resize';
              body.style.userSelect = 'none';

              const handleMove = (ev: MouseEvent) => {
                const state = resizeStateRef.current;
                if (!state) return;
                const delta = state.startX - ev.clientX;
                const next = Math.min(
                  MAX_SIDE_PANEL_WIDTH,
                  Math.max(MIN_SIDE_PANEL_WIDTH, state.startWidth + delta),
                );
                setSidePanelWidth(next);
              };

              const handleUp = () => {
                resizeStateRef.current = null;
                body.style.cursor = prevCursor;
                body.style.userSelect = prevUserSelect;
                window.removeEventListener('mousemove', handleMove);
                window.removeEventListener('mouseup', handleUp);
              };

              window.addEventListener('mousemove', handleMove);
              window.addEventListener('mouseup', handleUp);
            }}
            title="ドラッグして幅を調節"
            aria-label="サイドメニュー幅調節"
          >
            <div className="h-full w-px bg-border/50 mx-auto opacity-0 hover:opacity-100 transition-opacity" />
          </div>

          <div className="h-full pl-0 md:pl-1">
            <SidePanel
              roomId={roomId || ''}
              room={room}
              participant={participant}
              participants={participants}
              characters={characters}
              messages={messages}
              stageState={stageState}
              isGM={isGM}
              onRefreshCharacters={refreshCharacters}
              onSendMessage={handleSendMessageFull}
              onUpdateStage={updateStageState}
              onUpdateRoom={handleUpdateRoom}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
