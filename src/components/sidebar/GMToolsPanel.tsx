import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Plus, Image, FileText, Eye, EyeOff, Send, Trash2, Palette, Upload, GripVertical, Music, Settings, Edit2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { deleteFile, uploadFile } from '@/lib/upload';
import { useToast } from '@/hooks/use-toast';
import { ThemeSettings } from './ThemeSettings';
import { EffectsEditorDialog } from './EffectsEditorDialog';
import { OtherEffectsEditorDialog } from './OtherEffectsEditorDialog';
import { getDisplayText } from '@/lib/expressionTag';
import { getPortraitTransformRel } from '@/lib/portraitTransformsShared';
import type { Participant, Character, StageState, Macro, Room, Asset, ActivePortrait } from '@/types/trpg';

interface GMToolsPanelProps {
  roomId: string;
  room: Room | null;
  stageState: StageState | null;
  participants: Participant[];
  characters: Character[];
  onSendMessage: (type: 'speech' | 'mono' | 'system' | 'dice', text: string, speakerName: string, options?: any) => void;
  onUpdateStage: (updates: Partial<StageState>) => void;
  onUpdateRoom: (updates: Partial<Room>) => void;
}

interface MacroFormData {
  title: string;
  text: string;
  backgroundUrl?: string;
  portraitChanges?: { characterId: string; tag: string }[];
}

export function GMToolsPanel({
  roomId,
  room,
  stageState,
  participants,
  characters,
  onSendMessage,
  onUpdateStage,
  onUpdateRoom,
}: GMToolsPanelProps) {
  type MacroAssetSource = 'upload' | 'select' | null;
  const SENT_MACROS_STORAGE_KEY = `trpg:sentMacros:${roomId}`;
  const SENT_MACROS_COLLAPSED_STORAGE_KEY = `trpg:sentMacrosCollapsed:${roomId}`;

  const [macros, setMacros] = useState<Macro[]>([]);
  const [sentMacroIds, setSentMacroIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(SENT_MACROS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  });
  const [sentMacrosOpen, setSentMacrosOpen] = useState(() => {
    try {
      return localStorage.getItem(SENT_MACROS_COLLAPSED_STORAGE_KEY) !== '1';
    } catch {
      return true;
    }
  });
  const [newMacroText, setNewMacroText] = useState('');
  const [newMacroSpeakerId, setNewMacroSpeakerId] = useState<'gm' | string>('gm');
  const [newMacroSpeakerPortraitTag, setNewMacroSpeakerPortraitTag] = useState('');
  const [newMacroBgUrl, setNewMacroBgUrl] = useState('');
  const [newMacroBgmUrl, setNewMacroBgmUrl] = useState('');
  const [newMacroSeUrl, setNewMacroSeUrl] = useState('');
  const [newMacroBgSource, setNewMacroBgSource] = useState<MacroAssetSource>(null);
  const [newMacroBgAssetId, setNewMacroBgAssetId] = useState<string | null>(null);
  const [newMacroBgmSource, setNewMacroBgmSource] = useState<MacroAssetSource>(null);
  const [newMacroBgmAssetId, setNewMacroBgmAssetId] = useState<string | null>(null);
  const [newMacroSeSource, setNewMacroSeSource] = useState<MacroAssetSource>(null);
  const [newMacroSeAssetId, setNewMacroSeAssetId] = useState<string | null>(null);
  const [newMacroClearBackground, setNewMacroClearBackground] = useState(false);
  const [newMacroClearBgm, setNewMacroClearBgm] = useState(false);
  const [editingMacro, setEditingMacro] = useState<Macro | null>(null);
  const [editMacroOpen, setEditMacroOpen] = useState(false);
  const [editMacroText, setEditMacroText] = useState('');
  const [editMacroSpeakerId, setEditMacroSpeakerId] = useState<'gm' | string>('gm');
  const [editMacroSpeakerPortraitTag, setEditMacroSpeakerPortraitTag] = useState('');
  const [editMacroBgUrl, setEditMacroBgUrl] = useState('');
  const [editMacroBgmUrl, setEditMacroBgmUrl] = useState('');
  const [editMacroSeUrl, setEditMacroSeUrl] = useState('');
  const [editMacroBgSource, setEditMacroBgSource] = useState<MacroAssetSource>(null);
  const [editMacroBgAssetId, setEditMacroBgAssetId] = useState<string | null>(null);
  const [editMacroBgmSource, setEditMacroBgmSource] = useState<MacroAssetSource>(null);
  const [editMacroBgmAssetId, setEditMacroBgmAssetId] = useState<string | null>(null);
  const [editMacroSeSource, setEditMacroSeSource] = useState<MacroAssetSource>(null);
  const [editMacroSeAssetId, setEditMacroSeAssetId] = useState<string | null>(null);
  const [editMacroClearBackground, setEditMacroClearBackground] = useState(false);
  const [editMacroClearBgm, setEditMacroClearBgm] = useState(false);
  const [isSecretMode, setIsSecretMode] = useState(stageState?.is_secret || false);
  const [secretDialogOpen, setSecretDialogOpen] = useState(false);
  const [secretSelectedIds, setSecretSelectedIds] = useState<string[]>([]);
  const [showThemeSettings, setShowThemeSettings] = useState(false);
  const [effectsEditorOpen, setEffectsEditorOpen] = useState(false);
  const [otherEffectsEditorOpen, setOtherEffectsEditorOpen] = useState(false);
  const [otherEffectsCreateNonce, setOtherEffectsCreateNonce] = useState(0);
  const [assets, setAssets] = useState<Asset[]>([]);
  const bgFileRef = useRef<HTMLInputElement>(null);
  const macroBgFileRef = useRef<HTMLInputElement>(null);
  const editMacroBgFileRef = useRef<HTMLInputElement>(null);
  const stageBgmFileRef = useRef<HTMLInputElement>(null);
  const bgmFileRef = useRef<HTMLInputElement>(null);
  const editMacroBgmFileRef = useRef<HTMLInputElement>(null);
  const seFileRef = useRef<HTMLInputElement>(null);
  const editMacroSeFileRef = useRef<HTMLInputElement>(null);
  const stageSeFileRef = useRef<HTMLInputElement>(null);
  const stageSeEditFileRef = useRef<HTMLInputElement>(null);
  const stageBgEditFileRef = useRef<HTMLInputElement>(null);
  const stageBgmEditFileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [draggingMacroId, setDraggingMacroId] = useState<string | null>(null);
  const [stageBgmPreviewUrl, setStageBgmPreviewUrl] = useState<string | null>(null);
  const [stageSeUploadUrl, setStageSeUploadUrl] = useState('');
  const [stageSeLabel, setStageSeLabel] = useState('');
  const [editingSe, setEditingSe] = useState<Asset | null>(null);
  const [seEditOpen, setSeEditOpen] = useState(false);
  const [seEditLabel, setSeEditLabel] = useState('');
  const [seEditUploadUrl, setSeEditUploadUrl] = useState('');

  const [stageBgUploadUrl, setStageBgUploadUrl] = useState('');
  const [stageBgLabel, setStageBgLabel] = useState('');
  const [editingBg, setEditingBg] = useState<Asset | null>(null);
  const [bgEditOpen, setBgEditOpen] = useState(false);
  const [bgEditLabel, setBgEditLabel] = useState('');
  const [bgEditUploadUrl, setBgEditUploadUrl] = useState('');

  const [stageBgmUploadUrl, setStageBgmUploadUrl] = useState('');
  const [stageBgmLabel, setStageBgmLabel] = useState('');
  const [editingBgm, setEditingBgm] = useState<Asset | null>(null);
  const [bgmEditOpen, setBgmEditOpen] = useState(false);
  const [bgmEditLabel, setBgmEditLabel] = useState('');
  const [bgmEditUploadUrl, setBgmEditUploadUrl] = useState('');

  // Keep local toggle in sync with realtime stage state
  useEffect(() => {
    setIsSecretMode(!!stageState?.is_secret);
  }, [stageState?.is_secret]);

  // Fetch macros
  useEffect(() => {
    const fetchMacros = async () => {
      // Prefer sort_order when available; fall back to created_at for older DBs
      const q1 = await (supabase
        .from('macros')
        .select('id,room_id,title,text,scope,created_at,sort_order')
        .eq('room_id', roomId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }) as any);

      if (q1?.data) {
        setMacros(q1.data as Macro[]);
        return;
      }

      const q2 = await supabase
        .from('macros')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true });

      if (q2.data) setMacros(q2.data as Macro[]);
    };
    fetchMacros();
  }, [roomId]);

  useEffect(() => {
    try {
      localStorage.setItem(SENT_MACROS_STORAGE_KEY, JSON.stringify(sentMacroIds));
    } catch {
      // ignore
    }
  }, [SENT_MACROS_STORAGE_KEY, sentMacroIds]);

  useEffect(() => {
    try {
      localStorage.setItem(SENT_MACROS_COLLAPSED_STORAGE_KEY, sentMacrosOpen ? '0' : '1');
    } catch {
      // ignore
    }
  }, [SENT_MACROS_COLLAPSED_STORAGE_KEY, sentMacrosOpen]);

  // Realtime sync for macros (shared across devices)
  useEffect(() => {
    const channel = supabase
      .channel(`macros:${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'macros', filter: `room_id=eq.${roomId}` },
        async () => {
          const { data } = await (supabase
            .from('macros')
            .select('id,room_id,title,text,scope,created_at,sort_order')
            .eq('room_id', roomId)
            .order('sort_order', { ascending: true })
            .order('created_at', { ascending: true }) as any);
          if (data) setMacros(data as Macro[]);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  // Keep sent IDs in sync with current macros list
  useEffect(() => {
    setSentMacroIds((prev) => {
      if (prev.length === 0) return prev;
      const set = new Set(macros.map((m) => m.id));
      const next = prev.filter((id) => set.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [macros]);

  const sentMacroIdSet = useMemo(() => new Set(sentMacroIds), [sentMacroIds]);
  const stockMacros = useMemo(() => macros.filter((m) => !sentMacroIdSet.has(m.id)), [macros, sentMacroIdSet]);
  const sentMacros = useMemo(() => macros.filter((m) => sentMacroIdSet.has(m.id)), [macros, sentMacroIdSet]);

  // Fetch assets
  useEffect(() => {
    const fetchAssets = async () => {
      const { data } = await supabase
        .from('assets')
        .select('*')
        .eq('room_id', roomId);
      
      if (data) setAssets(data as Asset[]);
    };
    fetchAssets();
  }, [roomId]);

  // Realtime sync for assets (shared across devices)
  useEffect(() => {
    const channel = supabase
      .channel(`assets:${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'assets', filter: `room_id=eq.${roomId}` },
        async () => {
          const { data } = await supabase.from('assets').select('*').eq('room_id', roomId);
          if (data) setAssets(data as Asset[]);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  // Keyboard shortcut: Ctrl+Shift+J (Windows/Linux) or Cmd+Shift+J (macOS) to send oldest macro
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrlShiftJ = e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === 'j';
      const isCmdShiftJ = e.metaKey && e.shiftKey && !e.altKey && !e.ctrlKey && e.key.toLowerCase() === 'j';
      if (isCtrlShiftJ || isCmdShiftJ) {
        e.preventDefault();
        if (stockMacros.length > 0) {
          const oldestMacro = stockMacros[0];
          void (async () => {
            await handleSendMacroWithEffects(oldestMacro);
            setSentMacroIds((prev) => (prev.includes(oldestMacro.id) ? prev : [...prev, oldestMacro.id]));
          })();
        } else {
          toast({ title: '送信する定型文がありません', variant: 'destructive' });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [stockMacros]);

  const getMacroBodyForDisplay = (macroText: string) => {
    const withoutCommands = macroText.replace(/\[(bg|portrait|bgm|se|speaker):[^\]]+\]\n?/g, '');
    return getDisplayText(withoutCommands);
  };

  const deriveMacroTitle = (text: string) => {
    const firstLine = text.split('\n').map(l => l.trim()).find(Boolean) || '定型文';
    return firstLine.length > 24 ? `${firstLine.slice(0, 24)}…` : firstLine;
  };

  const stripMacroCommands = (macroText: string) => {
    return String(macroText || '').replace(/\[(bg|portrait|bgm|se|speaker):[^\]]+\]\n?/gi, '').trim();
  };

  const extractFirstCommandFromMacro = (macroText: string, kind: 'speaker' | 'bg' | 'bgm' | 'se') => {
    const regex = new RegExp(`\\[${kind}:([^\\]]+)\\]`, 'i');
    const match = String(macroText || '').match(regex);
    return match ? match[1].trim() : null;
  };

  const extractPortraitTagForSpeaker = (macroText: string, speakerId: string) => {
    if (!speakerId || speakerId === 'gm') return '';
    const portraitRegex = new RegExp(`\\[portrait:${speakerId}:([^\\]]+)\\]`, 'i');
    const m = String(macroText || '').match(portraitRegex);
    return m ? String(m[1] ?? '').trim() : '';
  };

  const openMacroEditor = (macro: Macro) => {
    setEditingMacro(macro);
    const text = String(macro.text || '');

    const speakerToken = extractFirstCommandFromMacro(text, 'speaker');
    const bgToken = extractFirstCommandFromMacro(text, 'bg');
    const bgmToken = extractFirstCommandFromMacro(text, 'bgm');
    const seToken = extractFirstCommandFromMacro(text, 'se');

    const speakerId = speakerToken ? (speakerToken.toLowerCase() === 'gm' ? 'gm' : speakerToken) : 'gm';
    setEditMacroSpeakerId(speakerId as any);
    setEditMacroSpeakerPortraitTag(extractPortraitTagForSpeaker(text, speakerId));

    setEditMacroClearBackground(bgToken?.toLowerCase() === 'clear');
    {
      const url = bgToken && bgToken.toLowerCase() !== 'clear' ? bgToken : '';
      setEditMacroBgUrl(url);
      const hit = url ? macroBgAssets.find((a) => a.url === url) ?? null : null;
      if (hit) {
        setEditMacroBgSource('select');
        setEditMacroBgAssetId(hit.id);
      } else if (url) {
        setEditMacroBgSource('upload');
        setEditMacroBgAssetId(null);
      } else {
        setEditMacroBgSource(null);
        setEditMacroBgAssetId(null);
      }
    }

    setEditMacroClearBgm(bgmToken?.toLowerCase() === 'stop');
    {
      const url = bgmToken && bgmToken.toLowerCase() !== 'stop' ? bgmToken : '';
      setEditMacroBgmUrl(url);
      const hit = url ? macroBgmAssets.find((a) => a.url === url) ?? null : null;
      if (hit) {
        setEditMacroBgmSource('select');
        setEditMacroBgmAssetId(hit.id);
      } else if (url) {
        setEditMacroBgmSource('upload');
        setEditMacroBgmAssetId(null);
      } else {
        setEditMacroBgmSource(null);
        setEditMacroBgmAssetId(null);
      }
    }

    {
      const url = seToken || '';
      setEditMacroSeUrl(url);
      const hit = url ? macroSeAssets.find((a) => a.url === url) ?? null : null;
      if (hit) {
        setEditMacroSeSource('select');
        setEditMacroSeAssetId(hit.id);
      } else if (url) {
        setEditMacroSeSource('upload');
        setEditMacroSeAssetId(null);
      } else {
        setEditMacroSeSource(null);
        setEditMacroSeAssetId(null);
      }
    }
    setEditMacroText(stripMacroCommands(text));
    setEditMacroOpen(true);
  };

  const handleAddMacro = async () => {
    if (!newMacroText.trim()) {
      toast({ title: '本文を入力してください', variant: 'destructive' });
      return;
    }

    // Build macro text with metadata
    let macroText = newMacroText.trim();

    // Add speaker command (GM or NPC)
    macroText = `[speaker:${newMacroSpeakerId}]\n${macroText}`;

    // Add background command if specified
    if (newMacroClearBackground) {
      macroText = `[bg:clear]\n${macroText}`;
    } else if (newMacroBgUrl.trim()) {
      macroText = `[bg:${newMacroBgUrl.trim()}]\n${macroText}`;
    }

    // Add BGM/SE commands if specified
    if (newMacroClearBgm) {
      macroText = `[bgm:stop]\n${macroText}`;
    } else if (newMacroBgmUrl.trim()) {
      macroText = `[bgm:${newMacroBgmUrl.trim()}]\n${macroText}`;
    }
    if (newMacroSeUrl.trim()) {
      macroText = `[se:${newMacroSeUrl.trim()}]\n${macroText}`;
    }

    // Optional: apply portrait tag for the selected speaker (NPC only)
    if (newMacroSpeakerId !== 'gm' && newMacroSpeakerPortraitTag.trim()) {
      macroText = `[portrait:${newMacroSpeakerId}:${newMacroSpeakerPortraitTag.trim()}]\n${macroText}`;
    }

    const maxSort = macros.reduce(
      (m, x: any) => Math.max(m, Number.isFinite(x?.sort_order) ? Number(x.sort_order) : 0),
      0,
    );
    const nextSort = maxSort + 1000;

    const basePayload: any = {
      room_id: roomId,
      title: deriveMacroTitle(newMacroText.trim()),
      text: macroText,
      scope: 'GM',
    };

    let data: any = null;
    let error: any = null;
    const withSort = await supabase
      .from('macros')
      .insert({ ...basePayload, sort_order: nextSort } as any)
      .select()
      .single();
    data = withSort.data;
    error = withSort.error;

    // Backward compatibility: if DB doesn't have sort_order yet, retry without it.
    if (error) {
      const msg = String(error?.message || '');
      const looksLikeMissingSortOrder =
        msg.includes('sort_order') && (msg.includes('column') || msg.includes('schema') || msg.includes('does not exist'));
      if (looksLikeMissingSortOrder) {
        const withoutSort = await supabase.from('macros').insert(basePayload).select().single();
        data = withoutSort.data;
        error = withoutSort.error;
      }
    }

    if (error) {
      console.error('Macro insert error:', error);
      toast({ title: `登録に失敗しました: ${String(error.message || error)}`, variant: 'destructive' });
      return;
    }

    setMacros(prev => [...prev, data as Macro]);
    setNewMacroText('');
    setNewMacroSpeakerId('gm');
    setNewMacroSpeakerPortraitTag('');
    setNewMacroBgUrl('');
    setNewMacroBgmUrl('');
    setNewMacroSeUrl('');
    setNewMacroBgSource(null);
    setNewMacroBgAssetId(null);
    setNewMacroBgmSource(null);
    setNewMacroBgmAssetId(null);
    setNewMacroSeSource(null);
    setNewMacroSeAssetId(null);
    setNewMacroClearBackground(false);
    setNewMacroClearBgm(false);
    toast({ title: '定型文を登録しました' });
  };

  const handleDeleteMacro = async (id: string) => {
    const { error } = await supabase
      .from('macros')
      .delete()
      .eq('id', id);

    if (!error) {
      setMacros(prev => prev.filter(m => m.id !== id));
      setSentMacroIds((prev) => prev.filter((x) => x !== id));
    }
  };

  const handleSendMacroWithEffects = async (macro: Macro) => {
    // Parse macro text for commands
    const originalText = macro.text;
    let parseText = macro.text;
    let speaker: { mode: 'gm' } | { mode: 'character'; characterId: string } = { mode: 'gm' };
    let bgUrl: string | null = null;
    let portraitChanges: { characterId: string; tag: string }[] = [];
    let bgmUrl: string | null = null;
    let seUrl: string | null = null;

    const extractFirstCommand = (kind: 'speaker' | 'bg' | 'bgm' | 'se') => {
      const re = new RegExp(`\\[${kind}:([^\\]]+)\\]\\n?`, 'i');
      const match = parseText.match(re);
      if (!match) return null;
      const value = String(match[1] ?? '').trim();
      parseText = parseText.replace(match[0], '');
      return value;
    };

    // Extract commands anywhere (not only at the top)
    const speakerToken = extractFirstCommand('speaker');
    if (speakerToken) {
      speaker = speakerToken === 'gm' ? { mode: 'gm' } : { mode: 'character', characterId: speakerToken };
    }

    const bgToken = extractFirstCommand('bg');
    if (bgToken) bgUrl = bgToken;

    // Extract bgm/se commands (effects are handled by clients; we keep commands in the sent message)
    const bgmToken = extractFirstCommand('bgm');
    if (bgmToken) bgmUrl = bgmToken;
    const seToken = extractFirstCommand('se');
    if (seToken) seUrl = seToken;

    // Extract portrait commands
    const portraitRegex = /^\[portrait:([^:]+):([^\]]+)\]\n?/gm;
    let match;
    while ((match = portraitRegex.exec(parseText)) !== null) {
      portraitChanges.push({ characterId: match[1], tag: match[2] });
    }
    parseText = parseText.replace(/\[portrait:[^\]]+\]\n?/g, '');

    // Apply background change
    if (bgUrl !== null) {
      if (bgUrl.toLowerCase() === 'clear') {
        await onUpdateStage({ background_url: null as any });
      } else {
        await onUpdateStage({ background_url: bgUrl });
      }
    }

    // Apply portrait changes
    if (portraitChanges.length > 0 && stageState) {
      const newPortraits = [...(stageState.active_portraits || [])];
      
      for (const change of portraitChanges) {
        // Find asset with matching tag for this character
        const asset = assets.find(a => 
          a.character_id === change.characterId && 
          a.kind === 'portrait' && 
          a.tag === change.tag.toLowerCase()
        );
        
        if (asset) {
          // Update or add portrait
          const existingIndex = newPortraits.findIndex(p => p.characterId === change.characterId);
          const finalPosition = existingIndex >= 0 ? newPortraits[existingIndex].position : 'center';
          const posKey = finalPosition === 'left' ? 'left' : finalPosition === 'right' ? 'right' : 'center';
          const shared = getPortraitTransformRel({
            roomId,
            characterId: change.characterId,
            key: asset.tag || asset.label,
            position: posKey,
          });
          const newPortrait: ActivePortrait = {
            characterId: change.characterId,
            assetId: asset.id,
            url: asset.url,
            label: asset.label,
            tag: asset.tag,
            position: finalPosition,
            layerOrder: existingIndex >= 0 ? newPortraits[existingIndex].layerOrder : newPortraits.length,
            scale: (() => {
              if (shared?.scale != null) return shared.scale;
              return asset.scale ?? 1;
            })(),
            offsetXRel: shared?.x ?? undefined,
            offsetYRel: shared?.y ?? undefined,
            offsetX: (() => {
              return asset.offset_x ?? 0;
            })(),
            offsetY: (() => {
              return asset.offset_y ?? 0;
            })(),
          };
          
          if (existingIndex >= 0) {
            newPortraits[existingIndex] = newPortrait;
          } else {
            newPortraits.push(newPortrait);
          }
        }
      }
      
      await onUpdateStage({ active_portraits: newPortraits });
    }

    // Send message
    if (parseText.trim() || bgmUrl || seUrl || bgUrl || portraitChanges.length > 0) {
      if (speaker.mode === 'gm') {
        onSendMessage('speech', originalText.trim(), 'GM');
      } else {
        const character = characters.find(c => c.id === speaker.characterId) ?? null;
        const speakerName = character?.name || 'NPC';
        onSendMessage('speech', originalText.trim(), speakerName, {
          portraitUrl: character?.avatar_url || undefined,
        });
      }
    }

    toast({ title: '送信しました' });
  };

  const handleSendStockMacro = async (macro: Macro) => {
    await handleSendMacroWithEffects(macro);
    setSentMacroIds((prev) => (prev.includes(macro.id) ? prev : [...prev, macro.id]));
  };

  const handleSendSentMacro = async (macro: Macro) => {
    await handleSendMacroWithEffects(macro);
  };

  const persistMacroOrder = async (ordered: Macro[]) => {
    const updates = ordered.map((m, idx) => ({ id: m.id, sort_order: (idx + 1) * 1000 }));
    setMacros(ordered.map((m, idx) => ({ ...(m as any), sort_order: updates[idx].sort_order })));
    const results = await Promise.all(
      updates.map((u) => supabase.from('macros').update({ sort_order: u.sort_order } as any).eq('id', u.id)),
    );
    const firstError = results.find((r) => (r as any)?.error)?.error as any;
    if (firstError) {
      const msg = String(firstError?.message || '');
      const looksLikeMissingSortOrder =
        msg.includes('sort_order') && (msg.includes('column') || msg.includes('schema') || msg.includes('does not exist'));
      if (looksLikeMissingSortOrder) {
        // ignore; sorting won't be persisted until migration is applied
        return;
      }
      throw firstError;
    }
  };

  const persistStockOrder = async (orderedStock: Macro[]) => {
    const full = [...orderedStock, ...sentMacros];
    await persistMacroOrder(full);
  };

  const moveMacroToIndex = async (macroId: string, toIndex: number) => {
    const currentIndex = stockMacros.findIndex((m) => m.id === macroId);
    if (currentIndex < 0) return;
    const next = [...stockMacros];
    const [item] = next.splice(currentIndex, 1);
    next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, item);
    try {
      await persistStockOrder(next);
    } catch (e) {
      toast({ title: '並び替えに失敗しました', variant: 'destructive' });
    }
  };

  const handleBgFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = await uploadFile(file, `backgrounds/${roomId}`);
    if (url) {
      setStageBgUploadUrl(url);
      if (bgFileRef.current) bgFileRef.current.value = '';
      toast({ title: '背景画像をアップロードしました' });
    } else {
      toast({ title: 'アップロードに失敗しました', variant: 'destructive' });
    }
  };

  const handleMacroBgFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = await uploadFile(file, `backgrounds/${roomId}`);
    if (url) {
      setNewMacroBgUrl(url);
      setNewMacroBgSource('upload');
      setNewMacroBgAssetId(null);
      setNewMacroClearBackground(false);
      setMacroAssetPicker((p) => (p.open && p.mode === 'new' && p.kind === 'bg' ? { ...p, open: false } : p));
      toast({ title: '背景をアップロードしました' });
    } else {
      toast({ title: 'アップロードに失敗しました', variant: 'destructive' });
    }
  };

  const handleBgmFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = await uploadFile(file, `bgm/${roomId}`);
    if (url) {
      setNewMacroBgmUrl(url);
      setNewMacroBgmSource('upload');
      setNewMacroBgmAssetId(null);
      setNewMacroClearBgm(false);
      setMacroAssetPicker((p) => (p.open && p.mode === 'new' && p.kind === 'bgm' ? { ...p, open: false } : p));
      toast({ title: 'BGMをアップロードしました' });
    } else {
      toast({ title: 'アップロードに失敗しました', variant: 'destructive' });
    }
  };

  const handleStageBgmFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = await uploadFile(file, `bgm/${roomId}`);
    if (!url) {
      toast({ title: 'アップロードに失敗しました', variant: 'destructive' });
      return;
    }
    setStageBgmUploadUrl(url);
    setStageBgmPreviewUrl(url);
    if (stageBgmFileRef.current) stageBgmFileRef.current.value = '';
    toast({ title: 'BGMをアップロードしました' });
  };

  const handleSeFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = await uploadFile(file, `se/${roomId}`);
    if (url) {
      setNewMacroSeUrl(url);
      setNewMacroSeSource('upload');
      setNewMacroSeAssetId(null);
      setMacroAssetPicker((p) => (p.open && p.mode === 'new' && p.kind === 'se' ? { ...p, open: false } : p));
      toast({ title: 'SEをアップロードしました' });
    } else {
      toast({ title: 'アップロードに失敗しました', variant: 'destructive' });
    }
  };

  const handleEditMacroBgFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = await uploadFile(file, `backgrounds/${roomId}`);
    if (url) {
      setEditMacroBgUrl(url);
      setEditMacroBgSource('upload');
      setEditMacroBgAssetId(null);
      setEditMacroClearBackground(false);
      setMacroAssetPicker((p) => (p.open && p.mode === 'edit' && p.kind === 'bg' ? { ...p, open: false } : p));
      toast({ title: '背景をアップロードしました' });
    } else {
      toast({ title: 'アップロードに失敗しました', variant: 'destructive' });
    }
  };

  const handleEditMacroBgmFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = await uploadFile(file, `bgm/${roomId}`);
    if (url) {
      setEditMacroBgmUrl(url);
      setEditMacroBgmSource('upload');
      setEditMacroBgmAssetId(null);
      setEditMacroClearBgm(false);
      setMacroAssetPicker((p) => (p.open && p.mode === 'edit' && p.kind === 'bgm' ? { ...p, open: false } : p));
      toast({ title: 'BGMをアップロードしました' });
    } else {
      toast({ title: 'アップロードに失敗しました', variant: 'destructive' });
    }
  };

  const handleEditMacroSeFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = await uploadFile(file, `se/${roomId}`);
    if (url) {
      setEditMacroSeUrl(url);
      setEditMacroSeSource('upload');
      setEditMacroSeAssetId(null);
      setMacroAssetPicker((p) => (p.open && p.mode === 'edit' && p.kind === 'se' ? { ...p, open: false } : p));
      toast({ title: 'SEをアップロードしました' });
    } else {
      toast({ title: 'アップロードに失敗しました', variant: 'destructive' });
    }
  };

  const handleUpdateMacro = async () => {
    if (!editingMacro) return;
    if (!editMacroText.trim()) {
      toast({ title: '本文を入力してください', variant: 'destructive' });
      return;
    }

    let macroText = editMacroText.trim();
    macroText = `[speaker:${editMacroSpeakerId}]\n${macroText}`;

    if (editMacroClearBackground) {
      macroText = `[bg:clear]\n${macroText}`;
    } else if (editMacroBgUrl.trim()) {
      macroText = `[bg:${editMacroBgUrl.trim()}]\n${macroText}`;
    }

    if (editMacroClearBgm) {
      macroText = `[bgm:stop]\n${macroText}`;
    } else if (editMacroBgmUrl.trim()) {
      macroText = `[bgm:${editMacroBgmUrl.trim()}]\n${macroText}`;
    }
    if (editMacroSeUrl.trim()) {
      macroText = `[se:${editMacroSeUrl.trim()}]\n${macroText}`;
    }

    if (editMacroSpeakerId !== 'gm' && editMacroSpeakerPortraitTag.trim()) {
      macroText = `[portrait:${editMacroSpeakerId}:${editMacroSpeakerPortraitTag.trim()}]\n${macroText}`;
    }

    const payload: any = {
      title: deriveMacroTitle(editMacroText.trim()),
      text: macroText,
    };

    const { error } = await supabase.from('macros').update(payload).eq('id', editingMacro.id);
    if (error) {
      toast({ title: `更新に失敗しました: ${String(error.message || error)}`, variant: 'destructive' });
      return;
    }

    toast({ title: '定型文を更新しました' });
    setEditMacroOpen(false);
    // Optimistic update; realtime will also refresh.
    setMacros((prev) => prev.map((m) => (m.id === editingMacro.id ? ({ ...m, ...payload } as any) : m)));
    setEditingMacro(null);
  };

  const applyPickedMacroAsset = (asset: Asset) => {
    const { mode, kind } = macroAssetPicker;
    if (mode === 'new') {
      if (kind === 'bg') {
        setNewMacroBgUrl(asset.url);
        setNewMacroBgSource('select');
        setNewMacroBgAssetId(asset.id);
        setNewMacroClearBackground(false);
      }
      if (kind === 'bgm') {
        setNewMacroBgmUrl(asset.url);
        setNewMacroBgmSource('select');
        setNewMacroBgmAssetId(asset.id);
        setNewMacroClearBgm(false);
      }
      if (kind === 'se') {
        setNewMacroSeUrl(asset.url);
        setNewMacroSeSource('select');
        setNewMacroSeAssetId(asset.id);
      }
    } else {
      if (kind === 'bg') {
        setEditMacroBgUrl(asset.url);
        setEditMacroBgSource('select');
        setEditMacroBgAssetId(asset.id);
        setEditMacroClearBackground(false);
      }
      if (kind === 'bgm') {
        setEditMacroBgmUrl(asset.url);
        setEditMacroBgmSource('select');
        setEditMacroBgmAssetId(asset.id);
        setEditMacroClearBgm(false);
      }
      if (kind === 'se') {
        setEditMacroSeUrl(asset.url);
        setEditMacroSeSource('select');
        setEditMacroSeAssetId(asset.id);
      }
    }
    setMacroAssetPicker((p) => ({ ...p, open: false }));
  };

  const handleStageSeFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = await uploadFile(file, `se/${roomId}`);
    if (!url) {
      toast({ title: 'アップロードに失敗しました', variant: 'destructive' });
      return;
    }
    setStageSeUploadUrl(url);
    if (stageSeFileRef.current) stageSeFileRef.current.value = '';
    toast({ title: 'SEをアップロードしました' });
  };

  const handleRegisterStageSe = async () => {
    if (!stageSeUploadUrl || !stageSeLabel.trim()) {
      toast({ title: 'SEと名前を入力してください', variant: 'destructive' });
      return;
    }

    const payload = {
      room_id: roomId,
      kind: 'se',
      url: stageSeUploadUrl,
      label: stageSeLabel.trim(),
      layer_order: 0,
      tag: '__se__',
      is_default: false,
    } as any;

    let data: any = null;
    let error: any = null;
    const primary = await supabase.from('assets').insert(payload).select().single();
    data = primary.data;
    error = primary.error;

    // Backward compatibility: if DB doesn't allow kind='se', store as background + tag='__se__'
    if (error) {
      const msg = String(error?.message || '');
      const looksLikeKindConstraint = msg.includes('assets_kind_check') || String(error?.code || '') === '23514';
      if (looksLikeKindConstraint) {
        const fallback = await supabase
          .from('assets')
          .insert({ ...payload, kind: 'background' } as any)
          .select()
          .single();
        data = fallback.data;
        error = fallback.error;
      }
    }

    if (error) {
      console.error('SE asset insert error:', error);
      toast({ title: `SE登録に失敗しました: ${String(error.message || error)}`, variant: 'destructive' });
      return;
    }

    setAssets((prev) => [...prev, data as Asset]);
    setStageSeUploadUrl('');
    setStageSeLabel('');
    if (stageSeFileRef.current) stageSeFileRef.current.value = '';
    toast({ title: 'SEを登録しました' });
  };

  const isBackgroundAsset = (asset: Asset) => {
    return asset.kind === 'background' && asset.tag === '__bg__';
  };

  const isBgmAsset = (asset: Asset) => {
    return asset.kind === 'bgm' || (asset.kind === 'background' && asset.tag === '__bgm__');
  };

  const isSeAsset = (asset: Asset) => {
    return asset.kind === 'se' || (asset.kind === 'background' && asset.tag === '__se__');
  };

  const macroBgAssets = assets.filter(isBackgroundAsset).sort((a, b) => String(a.label || '').localeCompare(String(b.label || ''), 'ja'));
  const macroBgmAssets = assets.filter(isBgmAsset).sort((a, b) => String(a.label || '').localeCompare(String(b.label || ''), 'ja'));
  const macroSeAssets = assets.filter(isSeAsset).sort((a, b) => String(a.label || '').localeCompare(String(b.label || ''), 'ja'));

  const [macroAssetPicker, setMacroAssetPicker] = useState<{
    open: boolean;
    mode: 'new' | 'edit';
    kind: 'bg' | 'bgm' | 'se';
  }>({ open: false, mode: 'new', kind: 'bg' });

  const openMacroAssetPicker = (mode: 'new' | 'edit', kind: 'bg' | 'bgm' | 'se') => {
    setMacroAssetPicker({ open: true, mode, kind });
  };

  const macroAssetButtonActiveClass =
    'bg-yellow-500/20 border-yellow-500 text-yellow-200 hover:bg-yellow-500/25 hover:border-yellow-500/90';

  const handleRegisterStageBackground = async () => {
    if (!stageBgUploadUrl || !stageBgLabel.trim()) {
      toast({ title: '背景と名前を入力してください', variant: 'destructive' });
      return;
    }

    const payload = {
      room_id: roomId,
      kind: 'background',
      url: stageBgUploadUrl,
      label: stageBgLabel.trim(),
      layer_order: 0,
      tag: '__bg__',
      is_default: false,
    } as any;

    const { data, error } = await supabase.from('assets').insert(payload).select().single();
    if (error) {
      console.error('Background asset insert error:', error);
      toast({ title: `背景登録に失敗しました: ${String(error.message || error)}`, variant: 'destructive' });
      return;
    }

    setAssets((prev) => [...prev, data as Asset]);
    setStageBgUploadUrl('');
    setStageBgLabel('');
    toast({ title: '背景を登録しました' });
  };

  const openBgEditor = (asset: Asset) => {
    setEditingBg(asset);
    setBgEditLabel(asset.label ?? '');
    setBgEditUploadUrl('');
    setBgEditOpen(true);
  };

  const handleStageBgEditFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await uploadFile(file, `backgrounds/${roomId}`);
    if (!url) {
      toast({ title: 'アップロードに失敗しました', variant: 'destructive' });
      return;
    }
    setBgEditUploadUrl(url);
    if (stageBgEditFileRef.current) stageBgEditFileRef.current.value = '';
    toast({ title: '背景画像をアップロードしました' });
  };

  const handleSaveBgEdit = async () => {
    if (!editingBg) return;
    const nextLabel = bgEditLabel.trim();
    if (!nextLabel) {
      toast({ title: '名前を入力してください', variant: 'destructive' });
      return;
    }
    const nextUrl = bgEditUploadUrl || editingBg.url;
    const { error } = await supabase.from('assets').update({ label: nextLabel, url: nextUrl } as any).eq('id', editingBg.id);
    if (error) {
      console.error('Background asset update error:', error);
      toast({ title: '更新に失敗しました', variant: 'destructive' });
      return;
    }
    if (bgEditUploadUrl && bgEditUploadUrl !== editingBg.url) void deleteFile(editingBg.url);
    setAssets((prev) => prev.map((a) => (a.id === editingBg.id ? ({ ...a, label: nextLabel, url: nextUrl } as Asset) : a)));
    setBgEditOpen(false);
    setEditingBg(null);
    setBgEditUploadUrl('');
    toast({ title: '背景を更新しました' });
  };

  const handleDeleteBg = async () => {
    if (!editingBg) return;
    const ok = window.confirm('この背景を削除しますか？');
    if (!ok) return;
    const target = editingBg;
    const { error } = await supabase.from('assets').delete().eq('id', target.id);
    if (error) {
      console.error('Background asset delete error:', error);
      toast({ title: '削除に失敗しました', variant: 'destructive' });
      return;
    }
    void deleteFile(target.url);
    setAssets((prev) => prev.filter((a) => a.id !== target.id));
    setBgEditOpen(false);
    setEditingBg(null);
    toast({ title: '背景を削除しました' });
  };

  const handleRegisterStageBgm = async () => {
    if (!stageBgmUploadUrl || !stageBgmLabel.trim()) {
      toast({ title: 'BGMと名前を入力してください', variant: 'destructive' });
      return;
    }

    const payload = {
      room_id: roomId,
      kind: 'bgm',
      url: stageBgmUploadUrl,
      label: stageBgmLabel.trim(),
      layer_order: 0,
      tag: '__bgm__',
      is_default: false,
    } as any;

    let data: any = null;
    let error: any = null;
    const primary = await supabase.from('assets').insert(payload).select().single();
    data = primary.data;
    error = primary.error;

    if (error) {
      const msg = String(error?.message || '');
      const looksLikeKindConstraint = msg.includes('assets_kind_check') || String(error?.code || '') === '23514';
      if (looksLikeKindConstraint) {
        const fallback = await supabase
          .from('assets')
          .insert({ ...payload, kind: 'background' } as any)
          .select()
          .single();
        data = fallback.data;
        error = fallback.error;
      }
    }

    if (error) {
      console.error('BGM asset insert error:', error);
      toast({ title: `BGM登録に失敗しました: ${String(error.message || error)}`, variant: 'destructive' });
      return;
    }

    setAssets((prev) => [...prev, data as Asset]);
    setStageBgmUploadUrl('');
    setStageBgmLabel('');
    setStageBgmPreviewUrl(null);
    toast({ title: 'BGMを登録しました' });
  };

  const openBgmEditor = (asset: Asset) => {
    setEditingBgm(asset);
    setBgmEditLabel(asset.label ?? '');
    setBgmEditUploadUrl('');
    setBgmEditOpen(true);
  };

  const handleStageBgmEditFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await uploadFile(file, `bgm/${roomId}`);
    if (!url) {
      toast({ title: 'アップロードに失敗しました', variant: 'destructive' });
      return;
    }
    setBgmEditUploadUrl(url);
    if (stageBgmEditFileRef.current) stageBgmEditFileRef.current.value = '';
    toast({ title: 'BGMをアップロードしました' });
  };

  const handleSaveBgmEdit = async () => {
    if (!editingBgm) return;
    const nextLabel = bgmEditLabel.trim();
    if (!nextLabel) {
      toast({ title: '名前を入力してください', variant: 'destructive' });
      return;
    }
    const nextUrl = bgmEditUploadUrl || editingBgm.url;
    const { error } = await supabase.from('assets').update({ label: nextLabel, url: nextUrl } as any).eq('id', editingBgm.id);
    if (error) {
      console.error('BGM asset update error:', error);
      toast({ title: '更新に失敗しました', variant: 'destructive' });
      return;
    }
    if (bgmEditUploadUrl && bgmEditUploadUrl !== editingBgm.url) void deleteFile(editingBgm.url);
    setAssets((prev) => prev.map((a) => (a.id === editingBgm.id ? ({ ...a, label: nextLabel, url: nextUrl } as Asset) : a)));
    setBgmEditOpen(false);
    setEditingBgm(null);
    setBgmEditUploadUrl('');
    toast({ title: 'BGMを更新しました' });
  };

  const handleDeleteBgm = async () => {
    if (!editingBgm) return;
    const ok = window.confirm('このBGMを削除しますか？');
    if (!ok) return;
    const target = editingBgm;
    const { error } = await supabase.from('assets').delete().eq('id', target.id);
    if (error) {
      console.error('BGM asset delete error:', error);
      toast({ title: '削除に失敗しました', variant: 'destructive' });
      return;
    }
    void deleteFile(target.url);
    setAssets((prev) => prev.filter((a) => a.id !== target.id));
    setBgmEditOpen(false);
    setEditingBgm(null);
    toast({ title: 'BGMを削除しました' });
  };

  const openSeEditor = (asset: Asset) => {
    setEditingSe(asset);
    setSeEditLabel(asset.label ?? '');
    setSeEditUploadUrl('');
    setSeEditOpen(true);
  };

  const handleStageSeEditFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = await uploadFile(file, `se/${roomId}`);
    if (!url) {
      toast({ title: 'アップロードに失敗しました', variant: 'destructive' });
      return;
    }
    setSeEditUploadUrl(url);
    if (stageSeEditFileRef.current) stageSeEditFileRef.current.value = '';
    toast({ title: 'SEをアップロードしました' });
  };

  const handleSaveSeEdit = async () => {
    if (!editingSe) return;
    const nextLabel = seEditLabel.trim();
    if (!nextLabel) {
      toast({ title: '名前を入力してください', variant: 'destructive' });
      return;
    }

    const nextUrl = seEditUploadUrl || editingSe.url;
    const { error } = await supabase
      .from('assets')
      .update({ label: nextLabel, url: nextUrl } as any)
      .eq('id', editingSe.id);

    if (error) {
      console.error('SE asset update error:', error);
      toast({ title: '更新に失敗しました', variant: 'destructive' });
      return;
    }

    if (seEditUploadUrl && seEditUploadUrl !== editingSe.url) {
      void deleteFile(editingSe.url);
    }

    setAssets((prev) =>
      prev.map((a) => (a.id === editingSe.id ? ({ ...a, label: nextLabel, url: nextUrl } as Asset) : a)),
    );
    setSeEditOpen(false);
    setEditingSe(null);
    setSeEditUploadUrl('');
    toast({ title: 'SEを更新しました' });
  };

  const handleDeleteSe = async () => {
    if (!editingSe) return;
    const ok = window.confirm('このSEを削除しますか？');
    if (!ok) return;

    const target = editingSe;
    const { error } = await supabase.from('assets').delete().eq('id', target.id);
    if (error) {
      console.error('SE asset delete error:', error);
      toast({ title: '削除に失敗しました', variant: 'destructive' });
      return;
    }

    void deleteFile(target.url);
    setAssets((prev) => prev.filter((a) => a.id !== target.id));
    setSeEditOpen(false);
    setEditingSe(null);
    toast({ title: 'SEを削除しました' });
  };

  const handleToggleSecret = async (enabled: boolean) => {
    if (enabled) {
      setSecretSelectedIds(stageState?.secret_allow_list || []);
      setSecretDialogOpen(true);
      return;
    }
    setIsSecretMode(false);
    await onUpdateStage({ is_secret: false, secret_allow_list: [] as any });
    onSendMessage('system', '秘匿シーンが終了しました', 'システム');
  };

  // Get NPC characters for portrait selection
  const npcCharacters = characters.filter(c => c.is_npc);
  const speakerNpc = newMacroSpeakerId !== 'gm' ? (npcCharacters.find(c => c.id === newMacroSpeakerId) ?? null) : null;
  const nonGmParticipants = participants.filter(p => p.role !== 'GM');
  const seAssets = assets.filter(isSeAsset);
  const bgAssets = assets.filter(isBackgroundAsset);
  const bgmAssets = assets.filter(isBgmAsset);

  return (
    <>
      <ScrollArea className="h-full">
        <div className="p-4 space-y-6">
          {/* Secret Mode Toggle */}
          <div className="bg-sidebar-accent rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isSecretMode ? (
                  <EyeOff className="w-5 h-5 text-destructive" />
                ) : (
                  <Eye className="w-5 h-5 text-muted-foreground" />
                )}
                <Label>秘匿モード</Label>
              </div>
              <Switch
                checked={isSecretMode}
                onCheckedChange={handleToggleSecret}
              />
            </div>
            {isSecretMode && (
              <p className="text-xs text-muted-foreground mt-2">
                秘匿モード中は対象外のプレイヤーにステージが隠されます
              </p>
            )}
          </div>

          {/* Background Control */}
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-start">
                <Image className="w-4 h-4 mr-2" />
                背景変更
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2 space-y-2">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => bgFileRef.current?.click()}
              >
                <Upload className="w-4 h-4 mr-2" />
                画像をアップロード
              </Button>
              <input
                ref={bgFileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleBgFileChange}
              />
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">名前</Label>
                <Input
                  value={stageBgLabel}
                  onChange={(e) => setStageBgLabel(e.target.value)}
                  placeholder="例：森、街、屋敷…"
                />
              </div>
              <Button
                className="w-full"
                onClick={handleRegisterStageBackground}
                disabled={!stageBgUploadUrl || !stageBgLabel.trim()}
              >
                登録
              </Button>
              {stageBgUploadUrl && (
                <div
                  className="h-20 rounded-lg bg-cover bg-center border border-border"
                  style={{ backgroundImage: `url(${stageBgUploadUrl})` }}
                />
              )}
              <Button
                variant="outline"
                className="w-full"
                onClick={async () => {
                  await onUpdateStage({ background_url: null as any });
                  toast({ title: '背景を消しました' });
                }}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                背景を消す
              </Button>
              {stageState?.background_url && (
                <div
                  className="h-20 rounded-lg bg-cover bg-center border border-border"
                  style={{ backgroundImage: `url(${stageState.background_url})` }}
                />
              )}
            </CollapsibleContent>
          </Collapsible>

          {/* Registered Background Buttons */}
          <div className="space-y-2">
            {bgAssets.length === 0 ? (
              <div className="text-xs text-muted-foreground">登録された背景はありません</div>
            ) : (
              bgAssets.map((a) => (
                <div key={a.id} className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    className="flex-1 justify-start"
                    onClick={async () => {
                      await onUpdateStage({ background_url: a.url });
                      toast({ title: '背景を変更しました' });
                    }}
                  >
                    {a.label}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9"
                    title="編集"
                    onClick={() => openBgEditor(a)}
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </div>

          {/* BGM Control */}
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-start">
                <Music className="w-4 h-4 mr-2" />
                BGM変更
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2 space-y-2">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => stageBgmFileRef.current?.click()}
              >
                <Upload className="w-4 h-4 mr-2" />
                BGMをアップロード
              </Button>
              <input
                ref={stageBgmFileRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={handleStageBgmFileChange}
              />
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">名前</Label>
                <Input
                  value={stageBgmLabel}
                  onChange={(e) => setStageBgmLabel(e.target.value)}
                  placeholder="例：戦闘、日常、緊迫…"
                />
              </div>
              <Button
                className="w-full"
                onClick={handleRegisterStageBgm}
                disabled={!stageBgmUploadUrl || !stageBgmLabel.trim()}
              >
                登録
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  onSendMessage('system', '[bgm:stop]', 'システム');
                  toast({ title: 'BGMを消しました' });
                }}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                BGMを消す
              </Button>
              {stageBgmPreviewUrl && (
                <audio controls src={stageBgmPreviewUrl} className="w-full" />
              )}
            </CollapsibleContent>
          </Collapsible>

          {/* Registered BGM Buttons */}
          <div className="space-y-2">
            {bgmAssets.length === 0 ? (
              <div className="text-xs text-muted-foreground">登録されたBGMはありません</div>
            ) : (
              bgmAssets.map((a) => (
                <div key={a.id} className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    className="flex-1 justify-start"
                    onClick={() => {
                      onSendMessage('system', `[bgm:${a.url}]`, 'システム');
                      toast({ title: 'BGMを変更しました' });
                    }}
                  >
                    {a.label}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9"
                    title="編集"
                    onClick={() => openBgmEditor(a)}
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </div>

          {/* SE Registry */}
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-start">
                <Music className="w-4 h-4 mr-2" />
                SE登録
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2 space-y-2">
              <div className="space-y-2">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => stageSeFileRef.current?.click()}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  SEをアップロード
                </Button>
                <input
                  ref={stageSeFileRef}
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={handleStageSeFileChange}
                />
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">名前</Label>
                  <Input
                    value={stageSeLabel}
                    onChange={(e) => setStageSeLabel(e.target.value)}
                    placeholder="例：ドア、決定音、爆発…"
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={handleRegisterStageSe}
                  disabled={!stageSeUploadUrl || !stageSeLabel.trim()}
                >
                  登録
                </Button>
                {stageSeUploadUrl && (
                  <audio controls src={stageSeUploadUrl} className="w-full" />
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Registered SE Buttons */}
          <div className="space-y-2">
            {seAssets.length === 0 ? (
              <div className="text-xs text-muted-foreground">登録されたSEはありません</div>
            ) : (
              seAssets.map((a) => (
                <div key={a.id} className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    className="flex-1 justify-start"
                    onClick={() => onSendMessage('system', `[se:${a.url}]`, 'システム')}
                  >
                    {a.label}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9"
                    title="編集"
                    onClick={() => openSeEditor(a)}
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </div>

          {/* Theme Settings */}
          <Button
            variant="ghost"
            className="w-full justify-start"
            onClick={() => setShowThemeSettings(true)}
          >
            <Palette className="w-4 h-4 mr-2" />
            テーマ設定
          </Button>

          <Button
            variant="ghost"
            className="w-full justify-start"
            onClick={() => setEffectsEditorOpen(true)}
          >
            <Image className="w-4 h-4 mr-2" />
            クリティカル/ファンブル演出
          </Button>

          <div className="space-y-2">
            <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              その他演出
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => {
                  setOtherEffectsCreateNonce((n) => n + 1);
                  setOtherEffectsEditorOpen(true);
                }}
              >
                <Plus className="w-4 h-4 mr-2" />
                演出を追加
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setOtherEffectsEditorOpen(true)}
              >
                編集
              </Button>
            </div>
          </div>

	          {/* Macros (Text Templates) */}
	          <div className="space-y-3">
	            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
	              <FileText className="w-4 h-4" />
	              定型文ストック
	              <span className="text-xs font-normal">(Ctrl+Shift+J / Cmd+Shift+Jで送信)</span>
	            </h3>
	
	            {/* Macros */}
	            <div className="space-y-2">
	              {stockMacros.map((macro, index) => (
	                <div 
	                  key={macro.id} 
	                  className="bg-sidebar-accent rounded-lg p-3 group"
	                  onDragOver={(e) => {
	                    if (!draggingMacroId || draggingMacroId === macro.id) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                  }}
                  onDrop={(e) => {
	                    const draggedId = e.dataTransfer.getData('text/plain') || draggingMacroId;
	                    if (!draggedId || draggedId === macro.id) return;
	                    e.preventDefault();
	                    void moveMacroToIndex(draggedId, index);
	                  }}
	                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="inline-flex items-center justify-center text-muted-foreground hover:text-foreground"
                          draggable
                          title="ドラッグで並び替え"
                          onDragStart={(e) => {
                            setDraggingMacroId(macro.id);
                            e.dataTransfer.effectAllowed = 'move';
                            e.dataTransfer.setData('text/plain', macro.id);
                          }}
                          onDragEnd={() => setDraggingMacroId(null)}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <GripVertical className="w-4 h-4" />
                        </button>
	                        <DropdownMenu>
	                          <DropdownMenuTrigger asChild>
	                            <button
	                              type="button"
	                              className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded hover:bg-primary/30"
	                              title="クリックして順番変更"
	                              onClick={(e) => e.stopPropagation()}
	                            >
	                              {index + 1}
	                            </button>
	                          </DropdownMenuTrigger>
	                          <DropdownMenuContent align="start">
	                            {Array.from({ length: stockMacros.length }, (_, i) => (
	                              <DropdownMenuItem
	                                key={i + 1}
	                                onSelect={() => {
	                                  void moveMacroToIndex(macro.id, i);
	                                }}
                              >
                                {i + 1}番目にする
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed mt-1">
                        {getMacroBodyForDisplay(macro.text)}
                      </p>
	                    </div>
	                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
	                      <Button
	                        size="icon"
	                        variant="ghost"
	                        className="h-7 w-7"
	                        onClick={() => void handleSendStockMacro(macro)}
	                      >
	                        <Send className="w-3 h-3" />
	                      </Button>
	                      <Button
	                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        title="編集"
                        onClick={() => openMacroEditor(macro)}
                      >
                        <Edit2 className="w-3 h-3" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive"
                        onClick={() => handleDeleteMacro(macro.id)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
	                  </div>
	                </div>
	              ))}
	              {stockMacros.length === 0 && (
	                <p className="text-xs text-muted-foreground text-center py-2">
	                  未送信の定型文がありません
	                </p>
	              )}
	            </div>

              <Collapsible open={sentMacrosOpen} onOpenChange={setSentMacrosOpen}>
                <div className="flex items-center justify-between">
                  <CollapsibleTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full justify-between">
                      <span className="flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        送信済定型文
                        <span className="text-xs text-muted-foreground">({sentMacros.length})</span>
                      </span>
                      <span className="text-xs text-muted-foreground">{sentMacrosOpen ? '閉じる' : '開く'}</span>
                    </Button>
                  </CollapsibleTrigger>
                </div>
                <CollapsibleContent className="mt-2 space-y-2">
                  {sentMacros.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-2">送信済の定型文がありません</p>
                  ) : (
                    sentMacros.map((macro) => (
                      <div key={macro.id} className="bg-sidebar-accent/60 rounded-lg p-3 group">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                              {getMacroBodyForDisplay(macro.text)}
                            </p>
                          </div>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              title="送信"
                              onClick={() => void handleSendSentMacro(macro)}
                            >
                              <Send className="w-3 h-3" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              title="編集"
                              onClick={() => openMacroEditor(macro)}
                            >
                              <Edit2 className="w-3 h-3" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              title="送信済から戻す"
                              onClick={() => setSentMacroIds((prev) => prev.filter((id) => id !== macro.id))}
                            >
                              <RotateCcw className="w-3 h-3" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive"
                              title="削除"
                              onClick={() => handleDeleteMacro(macro.id)}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </CollapsibleContent>
              </Collapsible>
	
	            {/* Add New Macro */}
	            <div className="space-y-2 pt-2 border-t border-sidebar-border">
              {/* Speaker for macro (above body) */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">発言者</Label>
                <div className="flex gap-2">
                  <Select value={newMacroSpeakerId} onValueChange={(v) => setNewMacroSpeakerId(v as any)}>
                    <SelectTrigger className="bg-sidebar-accent border-sidebar-border text-xs flex-1">
                      <SelectValue placeholder="発言者を選択" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gm">GM</SelectItem>
                      {npcCharacters.map(char => (
                        <SelectItem key={char.id} value={char.id}>{char.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={newMacroSpeakerPortraitTag}
                    onChange={(e) => setNewMacroSpeakerPortraitTag(e.target.value)}
                    placeholder="立ち絵タグ(任意)"
                    disabled={newMacroSpeakerId === 'gm'}
                    className="bg-sidebar-accent border-sidebar-border text-xs w-28"
                    title={newMacroSpeakerId === 'gm' ? 'NPC発言時のみ指定できます' : (speakerNpc ? `${speakerNpc.name} の立ち絵タグ` : '')}
                  />
                </div>
              </div>

              <Textarea
                value={newMacroText}
                onChange={(e) => setNewMacroText(e.target.value)}
                placeholder="本文（シナリオ文章、描写など）"
                className="bg-sidebar-accent border-sidebar-border min-h-[80px]"
              />

              {/* Background/BGM/SE for macro: upload only */}
	            <div className="space-y-1">
	                <Label className="text-xs text-muted-foreground">背景（任意）</Label>
	                <div className="flex items-center justify-between gap-2">
		                  <div className="grid grid-cols-2 gap-2 flex-1">
		                    <Button
		                      type="button"
		                      variant="outline"
		                      size="sm"
		                      className={`w-full min-w-0 justify-start overflow-hidden text-[clamp(10px,1vw,12px)] leading-none ${
		                        newMacroBgSource === 'upload' ? macroAssetButtonActiveClass : ''
		                      }`}
		                      onClick={() => macroBgFileRef.current?.click()}
		                      disabled={newMacroClearBackground}
		                    >
		                      <Upload className="w-4 h-4 mr-2 shrink-0" />
		                      <span className="min-w-0 flex-1 truncate">背景をアップロード</span>
		                    </Button>
		                    <Button
		                      type="button"
		                      variant="outline"
		                      size="sm"
		                      className={`w-full min-w-0 justify-start overflow-hidden text-[clamp(10px,1vw,12px)] leading-none ${
		                        newMacroBgSource === 'select' ? macroAssetButtonActiveClass : ''
		                      }`}
		                      onClick={() => openMacroAssetPicker('new', 'bg')}
		                      disabled={newMacroClearBackground || macroBgAssets.length === 0}
		                      title={macroBgAssets.length === 0 ? '登録された背景がありません' : undefined}
		                    >
		                      <Image className="w-4 h-4 mr-2 shrink-0" />
		                      <span className="min-w-0 flex-1 truncate">
		                        {(() => {
		                          if (newMacroBgSource === 'select' && newMacroBgAssetId) {
		                            const a = macroBgAssets.find((x) => x.id === newMacroBgAssetId);
		                            if (a) return a.label || '背景';
		                          }
		                          return '一覧から選ぶ';
		                        })()}
		                      </span>
		                    </Button>
		                  </div>
	                  <input
	                    ref={macroBgFileRef}
	                    type="file"
	                    accept="image/*"
	                    className="hidden"
	                    onChange={handleMacroBgFileChange}
	                  />
                  <label className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                    <input
                      type="checkbox"
                      className="accent-primary"
                      checked={newMacroClearBackground}
                      onChange={(e) => {
                        setNewMacroClearBackground(e.target.checked);
                        if (e.target.checked) {
                          setNewMacroBgUrl('');
                          setNewMacroBgSource(null);
                          setNewMacroBgAssetId(null);
                        }
                      }}
                    />
                    背景を消す
                  </label>
	                </div>
	              </div>
	
	              <div className="space-y-1">
	                <Label className="text-xs text-muted-foreground">BGM（任意）</Label>
	                <div className="flex items-center justify-between gap-2">
		                  <div className="grid grid-cols-2 gap-2 flex-1">
		                    <Button
		                      type="button"
		                      variant="outline"
		                      size="sm"
		                      className={`w-full min-w-0 justify-start overflow-hidden text-[clamp(10px,1vw,12px)] leading-none ${
		                        newMacroBgmSource === 'upload' ? macroAssetButtonActiveClass : ''
		                      }`}
		                      onClick={() => bgmFileRef.current?.click()}
		                      disabled={newMacroClearBgm}
		                    >
		                      <Upload className="w-4 h-4 mr-2 shrink-0" />
		                      <span className="min-w-0 flex-1 truncate">BGMをアップロード</span>
		                    </Button>
		                    <Button
		                      type="button"
		                      variant="outline"
		                      size="sm"
		                      className={`w-full min-w-0 justify-start overflow-hidden text-[clamp(10px,1vw,12px)] leading-none ${
		                        newMacroBgmSource === 'select' ? macroAssetButtonActiveClass : ''
		                      }`}
		                      onClick={() => openMacroAssetPicker('new', 'bgm')}
		                      disabled={newMacroClearBgm || macroBgmAssets.length === 0}
		                      title={macroBgmAssets.length === 0 ? '登録されたBGMがありません' : undefined}
		                    >
		                      <Music className="w-4 h-4 mr-2 shrink-0" />
		                      <span className="min-w-0 flex-1 truncate">
		                        {(() => {
		                          if (newMacroBgmSource === 'select' && newMacroBgmAssetId) {
		                            const a = macroBgmAssets.find((x) => x.id === newMacroBgmAssetId);
		                            if (a) return a.label || 'BGM';
		                          }
		                          return '一覧から選ぶ';
		                        })()}
		                      </span>
		                    </Button>
		                  </div>
	                  <label className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
	                    <input
	                      type="checkbox"
	                      className="accent-primary"
                      checked={newMacroClearBgm}
                      onChange={(e) => {
                        setNewMacroClearBgm(e.target.checked);
                        if (e.target.checked) {
                          setNewMacroBgmUrl('');
                          setNewMacroBgmSource(null);
                          setNewMacroBgmAssetId(null);
                        }
                      }}
                    />
                    BGMを消す
                  </label>
	                  <input
	                    ref={bgmFileRef}
	                    type="file"
	                    accept="audio/*"
	                    className="hidden"
	                    onChange={handleBgmFileChange}
	                  />
	                </div>
	              </div>
	              <div className="space-y-1">
	                <Label className="text-xs text-muted-foreground">SE（任意）</Label>
		                <div className="grid grid-cols-2 gap-2">
		                  <Button
		                    type="button"
		                    variant="outline"
		                    size="sm"
		                    className={`w-full min-w-0 justify-start overflow-hidden text-[clamp(10px,1vw,12px)] leading-none ${
		                      newMacroSeSource === 'upload' ? macroAssetButtonActiveClass : ''
		                    }`}
		                    onClick={() => seFileRef.current?.click()}
		                  >
		                    <Upload className="w-4 h-4 mr-2 shrink-0" />
		                    <span className="min-w-0 flex-1 truncate">SEをアップロード</span>
		                  </Button>
		                  <Button
		                    type="button"
		                    variant="outline"
		                    size="sm"
		                    className={`w-full min-w-0 justify-start overflow-hidden text-[clamp(10px,1vw,12px)] leading-none ${
		                      newMacroSeSource === 'select' ? macroAssetButtonActiveClass : ''
		                    }`}
		                    onClick={() => openMacroAssetPicker('new', 'se')}
		                    disabled={macroSeAssets.length === 0}
		                    title={macroSeAssets.length === 0 ? '登録されたSEがありません' : undefined}
		                  >
		                    <Music className="w-4 h-4 mr-2 shrink-0" />
		                    <span className="min-w-0 flex-1 truncate">
		                      {(() => {
		                        if (newMacroSeSource === 'select' && newMacroSeAssetId) {
		                          const a = macroSeAssets.find((x) => x.id === newMacroSeAssetId);
		                          if (a) return a.label || 'SE';
		                        }
		                        return '一覧から選ぶ';
		                      })()}
		                    </span>
		                  </Button>
		                  <input
		                    ref={seFileRef}
		                    type="file"
	                    accept="audio/*"
	                    className="hidden"
	                    onChange={handleSeFileChange}
	                  />
	                </div>
	              </div>

              <Button onClick={handleAddMacro} size="sm" className="w-full">
                <Plus className="w-4 h-4 mr-2" />
                定型文を追加
              </Button>
            </div>
          </div>

          {/* Participants List */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              参加者 ({participants.length})
            </h3>
            <div className="space-y-1">
              {participants.map(p => (
                <div 
                  key={p.id}
                  className="flex items-center justify-between px-3 py-2 rounded bg-sidebar-accent"
                >
                  <span className="text-sm">{p.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    p.role === 'GM' ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground'
                  }`}>
                    {p.role}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </ScrollArea>

      <ThemeSettings
        open={showThemeSettings}
        onOpenChange={setShowThemeSettings}
        room={room}
        onUpdateRoom={onUpdateRoom}
      />

      <EffectsEditorDialog
        open={effectsEditorOpen}
        onOpenChange={setEffectsEditorOpen}
        room={room}
        characters={characters}
        assets={assets}
        onSaved={(next) => {
          // Best-effort: keep local room state in sync for other UI.
          onUpdateRoom({ effects: next } as any);
        }}
      />

      <OtherEffectsEditorDialog
        open={otherEffectsEditorOpen}
        onOpenChange={setOtherEffectsEditorOpen}
        room={room}
        createNonce={otherEffectsCreateNonce}
        onSaved={(next) => {
          onUpdateRoom({ effects: next } as any);
        }}
      />

      <Dialog
        open={macroAssetPicker.open}
        onOpenChange={(open) => setMacroAssetPicker((p) => ({ ...p, open }))}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {macroAssetPicker.kind === 'bg' ? '背景を選択' : macroAssetPicker.kind === 'bgm' ? 'BGMを選択' : 'SEを選択'}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[50vh]">
            <div className="space-y-2 pr-2">
              {(macroAssetPicker.kind === 'bg'
                ? macroBgAssets
                : macroAssetPicker.kind === 'bgm'
                  ? macroBgmAssets
                  : macroSeAssets
              ).map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className="w-full flex items-center gap-3 rounded-md border border-border bg-secondary/30 hover:bg-secondary/50 px-3 py-2 text-left"
                  onClick={() => applyPickedMacroAsset(a)}
                  title={a.label}
                >
                  {macroAssetPicker.kind === 'bg' ? (
                    <div className="w-[72px] h-[40px] rounded bg-background/40 border border-border overflow-hidden shrink-0">
                      <img src={a.url} alt={a.label} className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="w-[72px] h-[40px] rounded bg-background/40 border border-border flex items-center justify-center shrink-0">
                      <Music className="w-5 h-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm truncate">{a.label || '（無名）'}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{a.url}</div>
                  </div>
                </button>
              ))}
              {((macroAssetPicker.kind === 'bg'
                ? macroBgAssets
                : macroAssetPicker.kind === 'bgm'
                  ? macroBgmAssets
                  : macroSeAssets
              ).length === 0) && (
                <div className="text-sm text-muted-foreground py-6 text-center">
                  まだ登録されていません
                </div>
              )}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMacroAssetPicker((p) => ({ ...p, open: false }))}>
              閉じる
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editMacroOpen}
        onOpenChange={(open) => {
          setEditMacroOpen(open);
          if (!open) {
            setEditingMacro(null);
            setEditMacroText('');
            setEditMacroSpeakerId('gm');
            setEditMacroSpeakerPortraitTag('');
            setEditMacroBgUrl('');
            setEditMacroBgmUrl('');
            setEditMacroSeUrl('');
            setEditMacroBgSource(null);
            setEditMacroBgAssetId(null);
            setEditMacroBgmSource(null);
            setEditMacroBgmAssetId(null);
            setEditMacroSeSource(null);
            setEditMacroSeAssetId(null);
            setEditMacroClearBackground(false);
            setEditMacroClearBgm(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>定型文を編集</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">発言者</Label>
              <div className="flex gap-2">
                <Select value={editMacroSpeakerId} onValueChange={(v) => setEditMacroSpeakerId(v as any)}>
                  <SelectTrigger className="bg-sidebar-accent border-sidebar-border text-xs flex-1">
                    <SelectValue placeholder="発言者を選択" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gm">GM</SelectItem>
                    {npcCharacters.map(char => (
                      <SelectItem key={char.id} value={char.id}>{char.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={editMacroSpeakerPortraitTag}
                  onChange={(e) => setEditMacroSpeakerPortraitTag(e.target.value)}
                  placeholder="立ち絵タグ(任意)"
                  disabled={editMacroSpeakerId === 'gm'}
                  className="bg-sidebar-accent border-sidebar-border text-xs w-28"
                />
              </div>
            </div>

            <Textarea
              value={editMacroText}
              onChange={(e) => setEditMacroText(e.target.value)}
              placeholder="本文"
              className="bg-sidebar-accent border-sidebar-border min-h-[120px]"
            />

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">背景（任意）</Label>
              <div className="flex items-center justify-between gap-2">
	                <div className="grid grid-cols-2 gap-2 flex-1">
	                  <Button
	                    type="button"
	                    variant="outline"
	                    size="sm"
	                    className={`w-full min-w-0 justify-start overflow-hidden text-[clamp(10px,1vw,12px)] leading-none ${
	                      editMacroBgSource === 'upload' ? macroAssetButtonActiveClass : ''
	                    }`}
	                    onClick={() => editMacroBgFileRef.current?.click()}
	                    disabled={editMacroClearBackground}
	                  >
	                    <Upload className="w-4 h-4 mr-2 shrink-0" />
	                    <span className="min-w-0 flex-1 truncate">背景をアップロード</span>
	                  </Button>
	                  <Button
	                    type="button"
	                    variant="outline"
	                    size="sm"
	                    className={`w-full min-w-0 justify-start overflow-hidden text-[clamp(10px,1vw,12px)] leading-none ${
	                      editMacroBgSource === 'select' ? macroAssetButtonActiveClass : ''
	                    }`}
	                    onClick={() => openMacroAssetPicker('edit', 'bg')}
	                    disabled={editMacroClearBackground || macroBgAssets.length === 0}
	                    title={macroBgAssets.length === 0 ? '登録された背景がありません' : undefined}
	                  >
	                    <Image className="w-4 h-4 mr-2 shrink-0" />
	                    <span className="min-w-0 flex-1 truncate">
	                      {(() => {
	                        if (editMacroBgSource === 'select' && editMacroBgAssetId) {
	                          const a = macroBgAssets.find((x) => x.id === editMacroBgAssetId);
	                          if (a) return a.label || '背景';
	                        }
	                        return '一覧から選ぶ';
	                      })()}
	                    </span>
	                  </Button>
	                </div>
                <label className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                  <input
                    type="checkbox"
                    className="accent-primary"
                    checked={editMacroClearBackground}
                    onChange={(e) => {
                      setEditMacroClearBackground(e.target.checked);
                      if (e.target.checked) {
                        setEditMacroBgUrl('');
                        setEditMacroBgSource(null);
                        setEditMacroBgAssetId(null);
                      }
                    }}
                  />
                  背景を消す
                </label>
                <input
                  ref={editMacroBgFileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleEditMacroBgFileChange}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">BGM（任意）</Label>
              <div className="flex items-center justify-between gap-2">
	                <div className="grid grid-cols-2 gap-2 flex-1">
	                  <Button
	                    type="button"
	                    variant="outline"
	                    size="sm"
	                    className={`w-full min-w-0 justify-start overflow-hidden text-[clamp(10px,1vw,12px)] leading-none ${
	                      editMacroBgmSource === 'upload' ? macroAssetButtonActiveClass : ''
	                    }`}
	                    onClick={() => editMacroBgmFileRef.current?.click()}
	                    disabled={editMacroClearBgm}
	                  >
	                    <Upload className="w-4 h-4 mr-2 shrink-0" />
	                    <span className="min-w-0 flex-1 truncate">BGMをアップロード</span>
	                  </Button>
	                  <Button
	                    type="button"
	                    variant="outline"
	                    size="sm"
	                    className={`w-full min-w-0 justify-start overflow-hidden text-[clamp(10px,1vw,12px)] leading-none ${
	                      editMacroBgmSource === 'select' ? macroAssetButtonActiveClass : ''
	                    }`}
	                    onClick={() => openMacroAssetPicker('edit', 'bgm')}
	                    disabled={editMacroClearBgm || macroBgmAssets.length === 0}
	                    title={macroBgmAssets.length === 0 ? '登録されたBGMがありません' : undefined}
	                  >
	                    <Music className="w-4 h-4 mr-2 shrink-0" />
	                    <span className="min-w-0 flex-1 truncate">
	                      {(() => {
	                        if (editMacroBgmSource === 'select' && editMacroBgmAssetId) {
	                          const a = macroBgmAssets.find((x) => x.id === editMacroBgmAssetId);
	                          if (a) return a.label || 'BGM';
	                        }
	                        return '一覧から選ぶ';
	                      })()}
	                    </span>
	                  </Button>
	                </div>
                <label className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                  <input
                    type="checkbox"
                    className="accent-primary"
                    checked={editMacroClearBgm}
                    onChange={(e) => {
                      setEditMacroClearBgm(e.target.checked);
                      if (e.target.checked) {
                        setEditMacroBgmUrl('');
                        setEditMacroBgmSource(null);
                        setEditMacroBgmAssetId(null);
                      }
                    }}
                  />
                  BGMを消す
                </label>
                <input
                  ref={editMacroBgmFileRef}
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={handleEditMacroBgmFileChange}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">SE（任意）</Label>
	              <div className="grid grid-cols-2 gap-2">
	                <Button
	                  type="button"
	                  variant="outline"
	                  size="sm"
	                  className={`w-full min-w-0 justify-start overflow-hidden text-[clamp(10px,1vw,12px)] leading-none ${
	                    editMacroSeSource === 'upload' ? macroAssetButtonActiveClass : ''
	                  }`}
	                  onClick={() => editMacroSeFileRef.current?.click()}
	                >
	                  <Upload className="w-4 h-4 mr-2 shrink-0" />
	                  <span className="min-w-0 flex-1 truncate">SEをアップロード</span>
	                </Button>
	                <Button
	                  type="button"
	                  variant="outline"
	                  size="sm"
	                  className={`w-full min-w-0 justify-start overflow-hidden text-[clamp(10px,1vw,12px)] leading-none ${
	                    editMacroSeSource === 'select' ? macroAssetButtonActiveClass : ''
	                  }`}
	                  onClick={() => openMacroAssetPicker('edit', 'se')}
	                  disabled={macroSeAssets.length === 0}
	                  title={macroSeAssets.length === 0 ? '登録されたSEがありません' : undefined}
	                >
	                  <Music className="w-4 h-4 mr-2 shrink-0" />
	                  <span className="min-w-0 flex-1 truncate">
	                    {(() => {
	                      if (editMacroSeSource === 'select' && editMacroSeAssetId) {
	                        const a = macroSeAssets.find((x) => x.id === editMacroSeAssetId);
	                        if (a) return a.label || 'SE';
	                      }
	                      return '一覧から選ぶ';
	                    })()}
	                  </span>
	                </Button>
	                <input
	                  ref={editMacroSeFileRef}
	                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={handleEditMacroSeFileChange}
                />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditMacroOpen(false)}>
              キャンセル
            </Button>
            <Button onClick={handleUpdateMacro} disabled={!editingMacro}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={bgEditOpen}
        onOpenChange={(open) => {
          setBgEditOpen(open);
          if (!open) {
            setEditingBg(null);
            setBgEditUploadUrl('');
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>背景設定</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">名前</Label>
              <Input value={bgEditLabel} onChange={(e) => setBgEditLabel(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">画像（変更する場合のみ）</Label>
              <Button variant="outline" className="w-full" onClick={() => stageBgEditFileRef.current?.click()}>
                <Upload className="w-4 h-4 mr-2" />
                画像をアップロード
              </Button>
              <input
                ref={stageBgEditFileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleStageBgEditFileChange}
              />
              {(bgEditUploadUrl || editingBg?.url) && (
                <div
                  className="h-32 rounded-lg bg-cover bg-center border border-border"
                  style={{ backgroundImage: `url(${bgEditUploadUrl || editingBg?.url})` }}
                />
              )}
            </div>
          </div>
          <DialogFooter className="flex items-center justify-between gap-2">
            <Button variant="destructive" onClick={handleDeleteBg} disabled={!editingBg}>
              <Trash2 className="w-4 h-4 mr-2" />
              削除
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setBgEditOpen(false)}>
                閉じる
              </Button>
              <Button onClick={handleSaveBgEdit} disabled={!editingBg}>
                保存
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={bgmEditOpen}
        onOpenChange={(open) => {
          setBgmEditOpen(open);
          if (!open) {
            setEditingBgm(null);
            setBgmEditUploadUrl('');
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>BGM設定</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">名前</Label>
              <Input value={bgmEditLabel} onChange={(e) => setBgmEditLabel(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">BGMファイル（変更する場合のみ）</Label>
              <Button variant="outline" className="w-full" onClick={() => stageBgmEditFileRef.current?.click()}>
                <Upload className="w-4 h-4 mr-2" />
                BGMをアップロード
              </Button>
              <input
                ref={stageBgmEditFileRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={handleStageBgmEditFileChange}
              />
              {(bgmEditUploadUrl || editingBgm?.url) && (
                <audio controls src={bgmEditUploadUrl || editingBgm?.url} className="w-full" />
              )}
            </div>
          </div>
          <DialogFooter className="flex items-center justify-between gap-2">
            <Button variant="destructive" onClick={handleDeleteBgm} disabled={!editingBgm}>
              <Trash2 className="w-4 h-4 mr-2" />
              削除
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setBgmEditOpen(false)}>
                閉じる
              </Button>
              <Button onClick={handleSaveBgmEdit} disabled={!editingBgm}>
                保存
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={seEditOpen}
        onOpenChange={(open) => {
          setSeEditOpen(open);
          if (!open) {
            setEditingSe(null);
            setSeEditUploadUrl('');
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>SE設定</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">名前</Label>
              <Input value={seEditLabel} onChange={(e) => setSeEditLabel(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">SEファイル（変更する場合のみ）</Label>
              <Button variant="outline" className="w-full" onClick={() => stageSeEditFileRef.current?.click()}>
                <Upload className="w-4 h-4 mr-2" />
                SEをアップロード
              </Button>
              <input
                ref={stageSeEditFileRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={handleStageSeEditFileChange}
              />
              {(seEditUploadUrl || editingSe?.url) && (
                <audio controls src={seEditUploadUrl || editingSe?.url} className="w-full" />
              )}
            </div>
          </div>
          <DialogFooter className="flex items-center justify-between gap-2">
            <Button variant="destructive" onClick={handleDeleteSe} disabled={!editingSe}>
              <Trash2 className="w-4 h-4 mr-2" />
              削除
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setSeEditOpen(false)}>
                閉じる
              </Button>
              <Button onClick={handleSaveSeEdit} disabled={!editingSe}>
                保存
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={secretDialogOpen}
        onOpenChange={(open) => {
          setSecretDialogOpen(open);
          if (!open) {
            // Closed without confirming -> keep secret mode off locally
            setIsSecretMode(!!stageState?.is_secret);
          }
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>秘匿モードの閲覧者を選択</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              選択した参加者は秘匿モード中のステージを閲覧できます。誰も選ばない場合はGMのみ閲覧できます。
            </p>
            <div className="space-y-2 max-h-[240px] overflow-auto rounded-md border border-border p-3">
              {nonGmParticipants.length === 0 ? (
                <div className="text-sm text-muted-foreground">参加者がいません</div>
              ) : (
                nonGmParticipants.map((p) => {
                  const checked = secretSelectedIds.includes(p.id);
                  return (
                    <label key={p.id} className="flex items-center gap-3 text-sm cursor-pointer select-none">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => {
                          const nextChecked = v === true;
                          setSecretSelectedIds((prev) => {
                            if (nextChecked) return Array.from(new Set([...prev, p.id]));
                            return prev.filter((id) => id !== p.id);
                          });
                        }}
                      />
                      <span className="flex-1 truncate">{p.name}</span>
                    </label>
                  );
                })
              )}
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setSecretDialogOpen(false);
              }}
            >
              キャンセル
            </Button>
            <Button
              onClick={async () => {
                const allowList = secretSelectedIds;
                await onUpdateStage({ is_secret: true, secret_allow_list: allowList as any });
                setIsSecretMode(true);
                setSecretDialogOpen(false);
                onSendMessage('system', '秘匿シーンが開始されました', 'システム');
              }}
            >
              秘匿モードに入る
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
