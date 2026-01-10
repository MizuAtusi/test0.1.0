import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { Loader2, ArrowLeft, Copy, Users, ChevronLeft } from 'lucide-react';
import { useRoom } from '@/hooks/useRoom';
import { StageView } from '@/components/stage/StageView';
import { InputBar } from '@/components/stage/InputBar';
import { SidePanel } from '@/components/sidebar/SidePanel';
import { Button } from '@/components/ui/button';
import { StageFrame } from '@/components/stage/StageFrame';
import { StageTextPanel } from '@/components/stage/StageTextPanel';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { getPortraitTransform } from '@/lib/portraitTransforms';
import { getCharacterAvatarUrl } from '@/lib/characterAvatar';
import { getPortraitTransformRel } from '@/lib/portraitTransformsShared';
import type { Room, Profile } from '@/types/trpg';
import { useAuth } from '@/hooks/useAuth';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

const SIDE_PANEL_WIDTH_STORAGE_KEY = 'trpg:sidePanelWidth';
const SIDE_PANEL_COLLAPSED_STORAGE_KEY = 'trpg:sidePanelCollapsed';
const DEFAULT_SIDE_PANEL_WIDTH = 320; // w-80
const MIN_SIDE_PANEL_WIDTH = 280;
const MAX_SIDE_PANEL_WIDTH = 720;
const SIDE_PANEL_COLLAPSED_WIDTH = 44;
const STAGE_RATIO = 16 / 9;
const ROOM_HEADER_HEIGHT_PX = 48;
const INPUT_BAR_HEIGHT_PX = 64;
const STAGE_AREA_PADDING_Y_PX = 16 + 8; // pt-4 + pb-2 (approx)
const STAGE_STACKED_ASPECT_THRESHOLD = 0.66; // availableStageHeight / stageColumnWidth
const ROOM_LAST_SEEN_STORAGE_KEY = 'trpg:lastSeenRoomMessages';

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

  const [sidePanelCollapsed, setSidePanelCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDE_PANEL_COLLAPSED_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(SIDE_PANEL_COLLAPSED_STORAGE_KEY, sidePanelCollapsed ? '1' : '0');
    } catch {
      // ignore
    }
  }, [sidePanelCollapsed]);

  const [windowSize, setWindowSize] = useState(() => {
    try {
      return { width: window.innerWidth, height: window.innerHeight };
    } catch {
      return { width: 0, height: 0 };
    }
  });
  useEffect(() => {
    const handler = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const [joinDialogOpen, setJoinDialogOpen] = useState(false);
  const [publicOwnerProfile, setPublicOwnerProfile] = useState<Profile | null>(null);
  const {
    room,
    participant,
    needsJoin,
    publicSettings,
    isReadOnlyViewer,
    participants,
    messages,
    stageState,
    characters,
    bgmUrl,
    se,
    loading,
    isGM,
    joinRoom,
    sendMessage,
    updateStageState,
    updateRoom,
    refreshCharacters,
  } = useRoom(roomId || null);
  const { user } = useAuth();

  useEffect(() => {
    if (!roomId) return;
    if (!messages.length) return;
    const latest = messages.reduce<number | null>((max, msg) => {
      const ts = new Date(msg.created_at).getTime();
      return max === null || ts > max ? ts : max;
    }, null);
    if (!latest) return;
    try {
      const raw = localStorage.getItem(ROOM_LAST_SEEN_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      parsed[roomId] = latest;
      localStorage.setItem(ROOM_LAST_SEEN_STORAGE_KEY, JSON.stringify(parsed));
    } catch {
      // ignore
    }
  }, [roomId, messages]);

  const hasSidePanel = !isReadOnlyViewer;
  const activeParticipantCount = participants.filter((p) => p.role === 'PL' || p.role === 'GM').length;
  const effectiveSidePanelWidth = hasSidePanel
    ? (sidePanelCollapsed ? SIDE_PANEL_COLLAPSED_WIDTH : sidePanelWidth)
    : 0;
  const stageColumnWidth = Math.max(0, windowSize.width - effectiveSidePanelWidth);
  const inputBarHeight = isReadOnlyViewer ? 0 : INPUT_BAR_HEIGHT_PX;
  const availableStageHeightOverlay = Math.max(
    0,
    windowSize.height - ROOM_HEADER_HEIGHT_PX - inputBarHeight - STAGE_AREA_PADDING_Y_PX,
  );
  const stageAreaAspect = stageColumnWidth > 0 ? (availableStageHeightOverlay / stageColumnWidth) : 0;
  const isStackedLayout = stageColumnWidth > 0 && stageAreaAspect >= STAGE_STACKED_ASPECT_THRESHOLD;
  const resizeStateRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [joiningRoom, setJoiningRoom] = useState(false);
  const [joinRequest, setJoinRequest] = useState<any>(null);
  const [joinMessage, setJoinMessage] = useState('');
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinReady, setJoinReady] = useState(false);

  // Get current player's character (if any)
  const myUserId = user?.id || participant?.user_id || null;
  const myCharacter = myUserId
    ? characters.find(c => c.owner_user_id === myUserId) ??
      (participant ? (characters.find(c => c.owner_participant_id === participant.id) ?? null) : null)
    : null;

  const [speakerValue, setSpeakerValue] = useState<string>('participant'); // 'participant' | characterId
  useEffect(() => {
    if (!participant) return;
    setSpeakerValue(prev => {
      if (prev !== 'participant') return prev;
      if (myCharacter?.id) return myCharacter.id;
      return isGM ? 'gm' : 'participant';
    });
  }, [participant, myCharacter?.id, isGM]);

  const handleCopyRoomId = () => {
    if (roomId) {
      navigator.clipboard.writeText(roomId);
      toast({ title: 'ルームIDをコピーしました' });
    }
  };

  const handleSendMessage = (
    type: 'speech' | 'mono' | 'system' | 'dice',
    text: string,
    options?: { dicePayload?: any; expressionTags?: string[]; portraitOnly?: boolean; speakerValue?: string; blindDice?: boolean }
  ) => {
    if (!participant) return;
    
    const requestedSpeakerValue = options?.speakerValue ?? speakerValue;
    const isGmSpeaker = requestedSpeakerValue === 'gm' && isGM;
    const requestedCharacter =
      requestedSpeakerValue !== 'participant'
        ? characters.find(c => c.id === requestedSpeakerValue) ?? null
        : null;
    const canUseCharacter = requestedCharacter
      ? (isGM ||
          (!!myUserId && requestedCharacter.owner_user_id === myUserId) ||
          requestedCharacter.owner_participant_id === participant.id)
      : false;
    const speakerCharacter = canUseCharacter ? requestedCharacter : null;
    const speakerName = isGmSpeaker ? 'GM' : (speakerCharacter?.name || myCharacter?.name || participant.name);
    const speakerAvatarUrl = isGmSpeaker
      ? null
      : (speakerCharacter?.avatar_url || (speakerCharacter ? getCharacterAvatarUrl(speakerCharacter.id) : null));

    const expressionTags = (options?.expressionTags || []).filter((t) => t !== 'blindd');
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
    const blindDice = !!options?.blindDice;
    const requestedChannel = (options as any)?.channel || 'public';
    const isChat = requestedChannel === 'chat';
    const secretChannel = stageState?.is_secret && !isChat ? 'secret' : null;
    const secretAllowList = stageState?.is_secret && !isChat ? (stageState?.secret_allow_list || []) : null;
    const blindAllowList = blindDice && participant ? [participant.id] : null;

    const sendWithSecret = async (
      t: typeof type,
      body: string,
      speaker: string,
      extra?: any,
    ) => {
      // Attach roller character id to dice payload so effects can be per-PC
      if (t === 'dice' && extra?.dicePayload && speakerCharacter?.id) {
        try {
          (extra.dicePayload as any).characterId = speakerCharacter.id;
        } catch {
          // ignore
        }
      }
      return sendMessage(t, body, speaker, {
        ...extra,
        ...options,
        channel: secretChannel || requestedChannel,
        secretAllowList: blindAllowList ?? secretAllowList ?? (isChat ? [] : (options as any)?.secretAllowList),
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

      // Some deployments may not have optional portrait transform columns yet (scale/offset_x/offset_y).
      // Retry with a minimal select so portrait tags still work.
      const selectWithTransforms = 'id,url,label,tag,is_default,scale,offset_x,offset_y';
      let {
        data: portraitAssets,
        error: portraitAssetsError,
      } = await supabase
        .from('assets')
        .select(selectWithTransforms)
        .eq('character_id', speakerCharacter.id)
        .eq('kind', 'portrait');

      if (portraitAssetsError) {
        const message = portraitAssetsError.message || '';
        const looksLikeMissingColumns =
          message.includes('scale') || message.includes('offset_x') || message.includes('offset_y');
        if (looksLikeMissingColumns) {
          const retry = await supabase
            .from('assets')
            .select('id,url,label,tag,is_default')
            .eq('character_id', speakerCharacter.id)
            .eq('kind', 'portrait');
          portraitAssets = retry.data as any;
          portraitAssetsError = retry.error as any;
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
        {
          id: string;
          url: string;
          label: string;
          tag: string;
          scale?: number | null;
          offset_x?: number | null;
          offset_y?: number | null;
        }
      >();
      const byLabel = new Map<
        string,
        {
          id: string;
          url: string;
          label: string;
          tag: string;
          scale?: number | null;
          offset_x?: number | null;
          offset_y?: number | null;
        }
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
      const finalPosition = positionOverride ?? (existingIndex >= 0 ? newPortraits[existingIndex].position : 'center');
      const posKey = finalPosition === 'left' ? 'left' : finalPosition === 'right' ? 'right' : 'center';
      const shared = getPortraitTransformRel({
        roomId: roomId || '',
        characterId: speakerCharacter.id,
        key: chosen.tag || chosen.label,
        position: posKey,
      });
      const newPortrait = {
        characterId: speakerCharacter.id,
        assetId: chosen.id,
        url: chosen.url,
        label: chosen.label,
        tag: chosen.tag,
        position: finalPosition,
        layerOrder: existingIndex >= 0 ? newPortraits[existingIndex].layerOrder : newPortraits.length,
        scale: (() => {
          if (shared?.scale != null) return shared.scale;
          if (typeof chosen.scale === 'number') return chosen.scale;
          const t = getPortraitTransform(speakerCharacter.id, chosen.tag || chosen.label);
          return t?.scale ?? 1;
        })(),
        offsetXRel: shared?.x ?? undefined,
        offsetYRel: shared?.y ?? undefined,
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

  useEffect(() => {
    if (!needsJoin || !roomId || !user?.id) return;
    let canceled = false;
    (async () => {
      const { data: req } = await supabase
        .from('room_join_requests')
        .select('*')
        .eq('room_id', roomId)
        .eq('requester_user_id', user.id)
        .maybeSingle();
      if (canceled) return;
      setJoinRequest(req);
      setJoinReady(true);
    })();
    return () => {
      canceled = true;
    };
  }, [needsJoin, roomId, user?.id]);

  // Determine if current user can view secret content
  const canViewSecret = isReadOnlyViewer || isGM || (
    participant && 
    stageState?.secret_allow_list?.includes(participant.id)
  );
  const isExcludedFromSecret = !!(stageState?.is_secret && participant && !canViewSecret);

  useEffect(() => {
    if (!publicSettings?.owner_user_id) {
      setPublicOwnerProfile(null);
      return;
    }
    let canceled = false;
    (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id,display_name,handle,avatar_url,bio,created_at')
        .eq('id', publicSettings.owner_user_id)
        .maybeSingle();
      if (canceled) return;
      if (error) return;
      setPublicOwnerProfile((data as any) || null);
    })();
    return () => {
      canceled = true;
    };
  }, [publicSettings?.owner_user_id]);

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

  if (needsJoin && !isReadOnlyViewer) {
    return (
      <div className="h-screen flex flex-col bg-background overflow-hidden">
        <header className="h-12 border-b border-border bg-card flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              戻る
            </Button>
            <div className="h-4 w-px bg-border" />
            <h1 className="font-display text-lg text-foreground">{room.name}</h1>
          </div>
        </header>

        <Dialog
          open
          onOpenChange={(next) => {
            if (!next) navigate('/');
          }}
        >
          <DialogContent>
            <DialogHeader>
            <DialogTitle>ルーム情報</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              {publicSettings?.is_public
                ? (publicSettings?.public_scope === 'read_only'
                    ? 'このルームは閲覧専用で公開されています。参加にはGMの承認が必要です。'
                    : 'このルームは公開されています。参加申請を送ることができます。')
                : 'このルームは非公開です。参加にはGMの承認が必要です。'}
            </div>
              {publicSettings?.title && (
              <div className="text-base font-semibold">{publicSettings.title}</div>
            )}
            {publicOwnerProfile && (
              <button
                type="button"
                className="text-sm text-muted-foreground underline text-left"
                onClick={() => navigate(`/users/${publicOwnerProfile.id}`)}
              >
                作成者: {publicOwnerProfile.display_name || 'ユーザー'} @{publicOwnerProfile.handle || 'id'}
              </button>
            )}
              {publicSettings?.description && (
                <div className="text-sm text-muted-foreground whitespace-pre-wrap">{publicSettings.description}</div>
              )}
              {publicSettings?.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {publicSettings.tags.map((t: string) => (
                    <span key={t} className="text-xs px-2 py-0.5 rounded bg-secondary/60">
                      {t}
                    </span>
                  ))}
                </div>
              )}
              {joinRequest?.status === 'pending' && (
                <div className="text-sm text-muted-foreground">参加申請済み（承認待ち）</div>
              )}
              {joinRequest?.status === 'approved' && (
                <div className="text-sm text-muted-foreground">承認済み。参加できます。</div>
              )}
              {joinRequest?.status === 'rejected' && (
                <div className="text-sm text-muted-foreground">申請が拒否されました。</div>
              )}
              {!joinRequest && (
                <Textarea
                  value={joinMessage}
                  onChange={(e) => setJoinMessage(e.target.value)}
                  placeholder="GMへのコメント（任意）"
                  className="bg-input border-border min-h-[90px]"
                />
              )}
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => navigate('/')}>いいえ</Button>
              {!joinRequest && (
                <Button
                  onClick={async () => {
                    if (!user?.id || !roomId) return;
                    setJoinLoading(true);
                    const { error } = await supabase.from('room_join_requests').insert({
                      room_id: roomId,
                      requester_user_id: user.id,
                      message: joinMessage.trim(),
                      status: 'pending',
                    } as any);
                    setJoinLoading(false);
                    if (error) {
                      toast({ title: '参加申請に失敗しました', description: error.message, variant: 'destructive' });
                      return;
                    }
                    toast({ title: '参加申請を送信しました' });
                    const { data: req } = await supabase
                      .from('room_join_requests')
                      .select('*')
                      .eq('room_id', roomId)
                      .eq('requester_user_id', user.id)
                      .maybeSingle();
                    setJoinRequest(req);
                  }}
                  disabled={joinLoading}
                >
                  申請する
                </Button>
              )}
              {joinRequest?.status === 'approved' && (
                <Button
                  onClick={async () => {
                    setJoiningRoom(true);
                    const ok = await joinRoom();
                    setJoiningRoom(false);
                    if (ok) toast({ title: 'ルームに参加しました' });
                  }}
                  disabled={joiningRoom}
                >
                  参加する
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
          {isReadOnlyViewer && (
            <span className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded">
              閲覧専用
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="w-4 h-4" />
            {activeParticipantCount}
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

      {isReadOnlyViewer && (
        <div className="border-b border-border bg-card px-4 py-2 text-sm flex items-center justify-between gap-3">
          <div className="text-muted-foreground">
            閲覧専用モードです。参加するにはGMの承認が必要です。
          </div>
          <div className="flex items-center gap-2">
            {joinRequest?.status === 'pending' && (
              <span className="text-xs text-muted-foreground">申請済み（承認待ち）</span>
            )}
            {joinRequest?.status === 'approved' && (
              <Button
                size="sm"
                onClick={async () => {
                  setJoiningRoom(true);
                  const ok = await joinRoom();
                  setJoiningRoom(false);
                  if (ok) toast({ title: 'ルームに参加しました' });
                }}
                disabled={joiningRoom}
              >
                参加する
              </Button>
            )}
            {joinRequest?.status === 'rejected' && (
              <span className="text-xs text-muted-foreground">申請が拒否されました</span>
            )}
            {!joinRequest && (
              <Button size="sm" onClick={() => setJoinDialogOpen(true)} disabled={!joinReady}>
                参加申請
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex min-h-0">
        {/* Stage Area */}
        <div className="flex-1 flex flex-col min-w-0" style={{ flexBasis: '75%' }}>
          {isStackedLayout ? (
            <div className="flex-1 min-h-0 px-4 pt-4 pb-0 flex flex-col gap-2">
              <div className="flex-[0_0_55%] min-h-0">
                <StageFrame className="h-full w-full" ratio={16 / 9}>
                  <StageView
                    textLayout="none"
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
                </StageFrame>
              </div>

              <div className="flex-1 min-h-0">
                <StageTextPanel
                  messages={messages.filter(m => m.channel !== 'chat')}
                  stageState={stageState}
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
            </div>
          ) : (
            <div className="flex-1 min-h-0 px-4 pt-4 pb-2 flex">
              <StageFrame className="flex-1 min-h-0 w-full" ratio={16 / 9}>
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
              </StageFrame>
            </div>
          )}

          {!isReadOnlyViewer && (
            <InputBar
              participantName={participant?.name || ''}
              roomId={roomId || undefined}
              speakerValue={speakerValue}
              onSpeakerValueChange={setSpeakerValue}
              onSendMessage={(type, text, options) => handleSendMessage(type, text, { ...options, speakerValue })}
              layout={isStackedLayout ? 'stacked' : 'single'}
              showGmOption={isGM}
              disabled={isExcludedFromSecret}
              disabledReason="秘匿モード中は閲覧できません"
              characters={isGM
                ? characters
                : characters.filter(c => (myUserId ? c.owner_user_id === myUserId : c.owner_participant_id === participant?.id))}
              currentCharacter={speakerValue !== 'participant'
                && speakerValue !== 'gm'
                ? characters.find(c => c.id === speakerValue) ?? null
                : null}
            />
          )}
        </div>

        {/* Side Panel (Right 1/4) */}
        {hasSidePanel && (
          <div
            className="shrink-0 relative"
            style={{ width: sidePanelCollapsed ? SIDE_PANEL_COLLAPSED_WIDTH : sidePanelWidth }}
          >
            <div
              className="absolute left-0 top-0 bottom-0 w-3 -translate-x-1.5 cursor-col-resize hidden md:block"
              onMouseDown={(e) => {
                if (sidePanelCollapsed) return;
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

            {sidePanelCollapsed ? (
              <div className="h-full flex flex-col items-center justify-start bg-sidebar border-l border-sidebar-border">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="mt-2"
                  onClick={() => setSidePanelCollapsed(false)}
                  title="サイドパネルを開く"
                >
                  <ChevronLeft className="w-5 h-5" />
                </Button>
              </div>
            ) : (
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
                  onCollapse={() => setSidePanelCollapsed(true)}
                />
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog open={joinDialogOpen} onOpenChange={setJoinDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>参加申請</DialogTitle>
          </DialogHeader>
          <Textarea
            value={joinMessage}
            onChange={(e) => setJoinMessage(e.target.value)}
            placeholder="GMへのコメント（任意）"
            className="bg-input border-border min-h-[90px]"
          />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setJoinDialogOpen(false)}>閉じる</Button>
            <Button
              onClick={async () => {
                if (!user?.id || !roomId) return;
                setJoinLoading(true);
                const { error } = await supabase.from('room_join_requests').insert({
                  room_id: roomId,
                  requester_user_id: user.id,
                  message: joinMessage.trim(),
                  status: 'pending',
                } as any);
                setJoinLoading(false);
                if (error) {
                  toast({ title: '参加申請に失敗しました', description: error.message, variant: 'destructive' });
                  return;
                }
                toast({ title: '参加申請を送信しました' });
                const { data: req } = await supabase
                  .from('room_join_requests')
                  .select('*')
                  .eq('room_id', roomId)
                  .eq('requester_user_id', user.id)
                  .maybeSingle();
                setJoinRequest(req);
                setJoinDialogOpen(false);
              }}
              disabled={joinLoading}
            >
              申請する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
