import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getSession } from '@/lib/session';
import type { Room, Participant, Message, StageState, Character, RoomMember, RoomPublicSettings } from '@/types/trpg';
import { useToast } from '@/hooks/use-toast';
import { getCharacterAvatarUrl } from '@/lib/characterAvatar';
import { appendLocalStageEvent } from '@/lib/localStageEvents';
import { applyNpcDisclosureCommandsFromText } from '@/lib/npcDisclosures';
import { applyEffectsConfigCommandsFromText } from '@/lib/effects';
import { applyPortraitTransformCommandsFromText } from '@/lib/portraitTransformsShared';
import { useAuth } from '@/hooks/useAuth';

export function useRoom(roomId: string | null) {
  const { user } = useAuth();
  const [room, setRoom] = useState<Room | null>(null);
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [member, setMember] = useState<RoomMember | null>(null);
  const [needsJoin, setNeedsJoin] = useState(false);
  const [publicSettings, setPublicSettings] = useState<RoomPublicSettings | null>(null);
  const [isReadOnlyViewer, setIsReadOnlyViewer] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [stageState, setStageState] = useState<StageState | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [bgmUrl, setBgmUrl] = useState<string | null>(null);
  const [se, setSe] = useState<{ url: string; nonce: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const applyAudioCommandsFromText = useCallback(
    (rawText: unknown, mode: 'initial' | 'realtime') => {
      if (typeof rawText !== 'string' || !rawText) return;
      const cmdRegex = /\[(bgm|se):([^\]]+)\]/gi;
      let match: RegExpExecArray | null = null;
      let lastBgm: string | null = null;
      const seTriggers: string[] = [];
      while ((match = cmdRegex.exec(rawText)) !== null) {
        const kind = String(match[1]).toLowerCase();
        const value = String(match[2] ?? '').trim();
        if (!value) continue;
        if (kind === 'bgm') lastBgm = value;
        if (kind === 'se') seTriggers.push(value);
      }

      if (lastBgm !== null) {
        setBgmUrl(lastBgm.toLowerCase() === 'stop' ? null : lastBgm);
      }

      if (mode === 'realtime' && seTriggers.length > 0) {
        const lastSe = seTriggers[seTriggers.length - 1];
        setSe((prev) => ({ url: lastSe, nonce: (prev?.nonce ?? 0) + 1 }));
      }
    },
    []
  );

  // Fetch room data
  const fetchRoom = useCallback(async () => {
    if (!roomId) return;
    
    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .single();
    
    if (error) {
      console.error('Error fetching room:', error);
      return;
    }
    
    setRoom(data as Room);
  }, [roomId]);

  const fetchMembership = useCallback(async (): Promise<RoomMember | null> => {
    if (!roomId || !user?.id) return null;
    const { data, error } = await supabase
      .from('room_members')
      .select('*')
      .eq('room_id', roomId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) {
      console.error('Error fetching membership:', error);
      return null;
    }
    if (data) {
      const next = data as any;
      setMember((prev) => {
        if (!prev) return next;
        if (prev.room_id === next.room_id && prev.user_id === next.user_id && prev.role === next.role) return prev;
        return next;
      });
      setNeedsJoin((prev) => (prev ? false : prev));
      setIsReadOnlyViewer(false);
      return next as RoomMember;
    } else {
      setMember((prev) => (prev ? null : prev));
      setNeedsJoin((prev) => (prev ? prev : true));
      return null;
    }
  }, [roomId, user?.id]);

  const fetchPublicSettings = useCallback(async (): Promise<RoomPublicSettings | null> => {
    if (!roomId || !user?.id) {
      setPublicSettings(null);
      return null;
    }
    const { data, error } = await supabase
      .from('room_public_settings')
      .select('*')
      .eq('room_id', roomId)
      .maybeSingle();
    if (error) {
      console.error('Error fetching public settings:', error);
      return null;
    }
    const next = (data as any) || null;
    setPublicSettings(next);
    return next as RoomPublicSettings | null;
  }, [roomId, user?.id]);

  // Fetch participants
  const fetchParticipants = useCallback(async () => {
    if (!roomId || !user?.id) return;
    
    const { data, error } = await supabase
      .from('participants')
      .select('*')
      .eq('room_id', roomId);
    
    if (error) {
      console.error('Error fetching participants:', error);
      return;
    }
    
    setParticipants(data as Participant[]);
    
    // Find current participant
    const session = getSession();
    const current = data.find(p => (p as any).user_id === user.id && p.session_id === session.sessionId);
    if (current) {
      setParticipant(current as Participant);
    }
  }, [roomId]);

  // Fetch messages
  const fetchMessages = useCallback(async () => {
    if (!roomId) return;
    
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true }) as { data: any[] | null; error: any };
    
    if (error) {
      console.error('Error fetching messages:', error);
      return;
    }

    const list = (data as Message[]) || [];
    // Derive initial BGM from message history (no SE triggering on load)
    try {
      list.forEach((m) => {
        applyAudioCommandsFromText((m as any)?.text, 'initial');
        applyNpcDisclosureCommandsFromText(roomId, (m as any)?.text);
        applyEffectsConfigCommandsFromText(roomId, (m as any)?.text);
        applyPortraitTransformCommandsFromText(roomId, (m as any)?.text);
      });
    } catch {
      // ignore
    }

    setMessages(list as Message[]);
  }, [roomId, applyAudioCommandsFromText]);

  // Fetch stage state
  const fetchStageState = useCallback(async () => {
    if (!roomId) return;
    
    const { data, error } = await supabase
      .from('stage_states')
      .select('*')
      .eq('room_id', roomId)
      .single();
    
    if (!error && data) {
      const stageData = data as any;
      setStageState({
        ...stageData,
        active_portraits: Array.isArray(stageData.active_portraits) 
          ? stageData.active_portraits 
          : []
      } as StageState);
    }
  }, [roomId]);

  // Fetch characters
  const fetchCharacters = useCallback(async () => {
    if (!roomId) return;
    
    const { data, error } = await supabase
      .from('characters')
      .select('*')
      .eq('room_id', roomId);
    
    if (error) {
      console.error('Error fetching characters:', error);
      return;
    }

    // Shared avatar fallback via assets table (tag="__avatar__")
    const { data: avatarAssets } = await supabase
      .from('assets')
      .select('character_id,url,label')
      .eq('room_id', roomId)
      .eq('kind', 'portrait')
      .eq('tag', '__avatar__');

    const avatarMap = new Map<string, { url: string; scale?: number; offsetX?: number; offsetY?: number }>();
    (avatarAssets || []).forEach((a: any) => {
      if (!a?.character_id || !a?.url) return;
      const url = String(a.url);
      const entry: { url: string; scale?: number; offsetX?: number; offsetY?: number } = { url };
      if (typeof a.label === 'string' && a.label.startsWith('avatar|')) {
        const parts = a.label.split('|').slice(1);
        for (const p of parts) {
          const [k, v] = p.split('=');
          if (!k || v === undefined) continue;
          if (k === 'scale') entry.scale = Number.parseFloat(v);
          if (k === 'x') entry.offsetX = Number.parseInt(v, 10);
          if (k === 'y') entry.offsetY = Number.parseInt(v, 10);
        }
      }
      avatarMap.set(String(a.character_id), entry);
    });

    const merged = (data as any[]).map((c) => {
      const local = getCharacterAvatarUrl(c.id);
      const shared = avatarMap.get(c.id);
      return {
        ...c,
        avatar_url: c.avatar_url || shared?.url || local || null,
        avatar_scale: typeof c.avatar_scale === 'number' ? c.avatar_scale : (shared?.scale ?? undefined),
        avatar_offset_x: typeof c.avatar_offset_x === 'number' ? c.avatar_offset_x : (shared?.offsetX ?? undefined),
        avatar_offset_y: typeof c.avatar_offset_y === 'number' ? c.avatar_offset_y : (shared?.offsetY ?? undefined),
      };
    });

    setCharacters(merged as unknown as Character[]);
  }, [roomId]);

  const getMyDisplayName = async (): Promise<string> => {
    if (!user?.id) return 'user';
    try {
      const metaName =
        (user.user_metadata as any)?.display_name ||
        (user.user_metadata as any)?.full_name ||
        null;
      if (typeof metaName === 'string' && metaName.trim()) return metaName.trim();
    } catch {
      // ignore
    }
    const { data } = await supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle();
    if (data?.display_name) return String(data.display_name);
    const email = user.email || '';
    return email ? email.split('@')[0] : 'user';
  };

  // Join room as the authenticated user (PL by default)
  const joinRoom = async () => {
    if (!roomId || !user?.id) return null;

    const name = await getMyDisplayName();

    // 1) Ensure membership exists.
    // If the room has no owner yet (legacy rooms), try to claim ownership as the first entrant.
    let joinRole: 'PL' | 'GM' = 'PL';
    try {
      const { data: roomRow } = await supabase
        .from('rooms')
        .select('owner_user_id')
        .eq('id', roomId)
        .maybeSingle();
      if (roomRow && !(roomRow as any).owner_user_id) {
        const claimed = await supabase
          .from('rooms')
          .update({ owner_user_id: user.id } as any)
          .eq('id', roomId)
          .is('owner_user_id', null);
        if (!claimed.error) {
          joinRole = 'GM';
        }
      }
    } catch {
      // ignore
    }

    const { error: memberError } = await supabase.from('room_members').insert({
      room_id: roomId,
      user_id: user.id,
      role: joinRole,
    } as any);
    if (memberError) {
      const msg = String(memberError?.message || memberError);
      // Ignore duplicates
      if (!msg.toLowerCase().includes('duplicate') && !msg.toLowerCase().includes('already exists')) {
        toast({ title: 'ルーム参加に失敗しました', description: msg, variant: 'destructive' });
        return null;
      }
    }

    await fetchMembership();

    // 2) Create a participant presence row for this browser session if missing
    const session = getSession();
    const { data: existing } = await supabase
      .from('participants')
      .select('*')
      .eq('room_id', roomId)
      .eq('user_id', user.id)
      .eq('session_id', session.sessionId)
      .maybeSingle();

    if (existing) {
      setParticipant(existing as any);
      return existing as any;
    }

    const { data: part, error: partError } = await supabase
      .from('participants')
      .insert({
        room_id: roomId,
        user_id: user.id,
        name,
        role: joinRole,
        session_id: session.sessionId,
      } as any)
      .select('*')
      .single();

    if (partError) {
      toast({ title: '参加情報の作成に失敗しました', description: partError.message, variant: 'destructive' });
      return null;
    }

    setParticipant(part as any);
    // Refresh room state now that membership/presence exists
    await Promise.all([
      fetchParticipants(),
      fetchMessages(),
      fetchStageState(),
      fetchCharacters(),
    ]);
    return part as any;
  };

  // Ensure participant presence exists when already a member
  const ensurePresence = useCallback(async () => {
    if (!roomId || !user?.id || !member) return;
    const session = getSession();
    const { data: existing } = await supabase
      .from('participants')
      .select('*')
      .eq('room_id', roomId)
      .eq('user_id', user.id)
      .eq('session_id', session.sessionId)
      .maybeSingle();
    if (existing) {
      setParticipant(existing as any);
      return;
    }
    const name = await getMyDisplayName();
    const { data: part } = await supabase
      .from('participants')
      .insert({
        room_id: roomId,
        user_id: user.id,
        name,
        role: member.role,
        session_id: session.sessionId,
      } as any)
      .select('*')
      .single();
    if (part) setParticipant(part as any);
  }, [roomId, user?.id, member]);

  // Send message
  const sendMessage = async (
    type: 'speech' | 'mono' | 'system' | 'dice',
    text: string,
    speakerName: string,
    options?: {
      channel?: 'public' | 'secret' | 'chat';
      secretAllowList?: string[];
      dicePayload?: any;
      portraitUrl?: string;
    }
  ) => {
    if (!roomId) return null;
    
    const { data, error } = await supabase
      .from('messages')
      .insert({
        room_id: roomId,
        type,
        text,
        speaker_name: speakerName,
        channel: options?.channel || 'public',
        secret_allow_list: options?.secretAllowList || [],
        dice_payload: options?.dicePayload,
        speaker_portrait_url: options?.portraitUrl,
      })
      .select()
      .single();
    
    if (error) {
      console.error('Error sending message:', error);
      return null;
    }

    const nextMsg = data as unknown as Message;
    let shouldApply = false;
    setMessages((prev) => {
      if (prev.some((m) => m.id === nextMsg.id)) return prev;
      shouldApply = true;
      return [...prev, nextMsg];
    });

    if (shouldApply) {
      try {
        applyAudioCommandsFromText((nextMsg as any)?.text, 'realtime');
        applyNpcDisclosureCommandsFromText(roomId, (nextMsg as any)?.text);
        applyEffectsConfigCommandsFromText(roomId, (nextMsg as any)?.text);
        applyPortraitTransformCommandsFromText(roomId, (nextMsg as any)?.text);
      } catch {
        // ignore
      }
    }

    return nextMsg;
  };

  // Update stage state
  const updateStageState = async (updates: Partial<StageState>) => {
    if (!roomId) return;
    
    const updateData: any = {
      room_id: roomId,
      ...updates,
      // Ensure ordering for replay/local history by always bumping updated_at
      updated_at: new Date().toISOString(),
    };
    
    const { error } = await supabase
      .from('stage_states')
      .upsert(updateData, { onConflict: 'room_id' });
    
    if (error) {
      console.error('Error updating stage state:', error);
      return;
    }

    // Record stage transitions for replay (best-effort)
    try {
      if (updates.background_url !== undefined) {
        await supabase.from('stage_events').insert({
          room_id: roomId,
          kind: 'background',
          data: { url: updates.background_url },
        } as any);
      }
      if (updates.active_portraits !== undefined) {
        await supabase.from('stage_events').insert({
          room_id: roomId,
          kind: 'portraits',
          data: { portraits: updates.active_portraits },
        } as any);
      }
      if (updates.is_secret !== undefined || updates.secret_allow_list !== undefined) {
        await supabase.from('stage_events').insert({
          room_id: roomId,
          kind: 'secret',
          data: {
            isSecret: updates.is_secret,
            secretAllowList: updates.secret_allow_list,
          },
        } as any);
      }
    } catch (e) {
      // ignore; replay will just miss these transitions
      console.warn('Failed to insert stage_events:', e);
    }
  };

  // Update room
  const updateRoom = async (updates: Partial<Room>) => {
    if (!roomId) return;
    
    const { error } = await supabase
      .from('rooms')
      .update(updates as any)
      .eq('id', roomId);
    
    if (error) {
      console.error('Error updating room:', error);
    } else {
      setRoom(prev => prev ? { ...prev, ...updates } : null);
    }
  };

  // Real-time subscriptions
  useEffect(() => {
    if (!roomId) return;

    // Subscribe to room updates (theme/effects/etc)
    const roomChannel = supabase
      .channel(`room:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rooms',
          filter: `id=eq.${roomId}`,
        },
        (payload) => {
          if (payload.new) {
            setRoom(payload.new as Room);
          }
        }
      )
      .subscribe();

    // Subscribe to messages
    const messagesChannel = supabase
      .channel(`messages:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          setMessages((prev) => {
            const nextMsg = payload.new as unknown as Message;
            if (prev.some((m) => m.id === nextMsg.id)) return prev;
            try {
              applyAudioCommandsFromText((payload.new as any)?.text, 'realtime');
              applyNpcDisclosureCommandsFromText(roomId, (payload.new as any)?.text);
              applyEffectsConfigCommandsFromText(roomId, (payload.new as any)?.text);
              applyPortraitTransformCommandsFromText(roomId, (payload.new as any)?.text);
            } catch {
              // ignore
            }
            return [...prev, nextMsg];
          });
        }
      )
      .subscribe();

    // Subscribe to stage state
    const stageChannel = supabase
      .channel(`stage:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'stage_states',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          if (payload.new) {
            const stageData = payload.new as any;
            const nextState = {
              ...stageData,
              active_portraits: Array.isArray(stageData.active_portraits) ? stageData.active_portraits : [],
            } as StageState;

            setStageState((prev) => {
              // Record transitions locally for replay (works even if stage_events table isn't available)
              try {
                const ts = String((payload as any).commit_timestamp || nextState.updated_at || new Date().toISOString());
                if (!prev || prev.background_url !== nextState.background_url) {
                  appendLocalStageEvent(roomId, { timestamp: ts, type: 'background', data: { url: nextState.background_url || null } });
                }
                const prevPortraits = JSON.stringify(prev?.active_portraits ?? []);
                const nextPortraits = JSON.stringify(nextState.active_portraits ?? []);
                if (!prev || prevPortraits !== nextPortraits) {
                  appendLocalStageEvent(roomId, { timestamp: ts, type: 'portraits', data: { portraits: nextState.active_portraits ?? [] } });
                }
                if (!prev || prev.is_secret !== nextState.is_secret || JSON.stringify(prev.secret_allow_list ?? []) !== JSON.stringify(nextState.secret_allow_list ?? [])) {
                  appendLocalStageEvent(roomId, { timestamp: ts, type: 'secret', data: { isSecret: nextState.is_secret, secretAllowList: nextState.secret_allow_list } });
                }
              } catch {
                // ignore
              }
              return nextState;
            });
          }
        }
      )
      .subscribe();

    const participantsChannel = member
      ? supabase
          .channel(`participants:${roomId}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'participants',
              filter: `room_id=eq.${roomId}`,
            },
            () => {
              fetchParticipants();
            }
          )
          .subscribe()
      : null;

    return () => {
      supabase.removeChannel(roomChannel);
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(stageChannel);
      if (participantsChannel) supabase.removeChannel(participantsChannel);
    };
  }, [roomId, fetchParticipants, applyAudioCommandsFromText, member]);

  // Initial fetch
  useEffect(() => {
    if (!roomId) {
      setLoading(false);
      return;
    }

    const fetchAll = async () => {
      setLoading(true);
      await fetchRoom();
      const membership = await fetchMembership();
      const pub = await fetchPublicSettings();
      if (!user?.id) {
        setLoading(false);
        return;
      }
      const canReadOnly = !!(pub?.is_public && pub.public_scope === 'read_only');
      setIsReadOnlyViewer(!membership && canReadOnly);
      // Load room content after join or in read-only mode
      if (membership || canReadOnly) {
        await Promise.all([
          membership ? fetchParticipants() : Promise.resolve(),
          fetchMessages(),
          fetchStageState(),
          fetchCharacters(),
        ]);
        if (membership) {
          // Ensure presence row for this browser session exists (do not depend on member state identity)
          try {
            const session = getSession();
            const { data: existing } = await supabase
              .from('participants')
              .select('*')
              .eq('room_id', roomId)
              .eq('user_id', user.id)
              .eq('session_id', session.sessionId)
              .maybeSingle();
            if (existing) {
              setParticipant(existing as any);
            } else {
              const name = await getMyDisplayName();
              const { data: part } = await supabase
                .from('participants')
                .insert({
                  room_id: roomId,
                  user_id: user.id,
                  name,
                  role: membership.role,
                  session_id: session.sessionId,
                } as any)
                .select('*')
                .single();
              if (part) setParticipant(part as any);
            }
          } catch {
            // ignore
          }
        }
      }
      setLoading(false);
    };

    fetchAll();
  }, [
    roomId,
    user?.id,
    fetchRoom,
    fetchMembership,
    fetchParticipants,
    fetchMessages,
    fetchStageState,
    fetchCharacters,
    fetchPublicSettings,
  ]);

  // React to role changes (e.g., owner promotes a member to GM)
  useEffect(() => {
    if (!roomId || !user?.id) return;
    const channel = supabase
      .channel(`room_members:${roomId}:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'room_members',
          filter: `room_id=eq.${roomId}`,
        },
        (payload: any) => {
          const nextUserId = payload?.new?.user_id ?? payload?.old?.user_id ?? null;
          if (nextUserId === user.id) void fetchMembership();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, user?.id, fetchMembership]);

  return {
    room,
    participant,
    member,
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
    isGM: member?.role === 'GM',
    joinRoom,
    sendMessage,
    updateStageState,
    updateRoom,
    refreshCharacters: fetchCharacters,
  };
}
