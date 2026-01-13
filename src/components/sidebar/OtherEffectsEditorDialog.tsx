import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { Upload, Plus, Trash2, Pencil } from 'lucide-react';
import type { Asset, Character, Room } from '@/types/trpg';
import { supabase } from '@/integrations/supabase/client';
import { uploadFile } from '@/lib/upload';
import { useToast } from '@/hooks/use-toast';
import { StageFrame } from '@/components/stage/StageFrame';
import {
  DEFAULT_EFFECTS,
  type EffectsConfig,
  type EffectImage,
  type PcEffect,
  type OtherEffectTrigger,
  createId,
  buildEffectsConfigCommand,
  loadEffectsConfig,
  normalizeEffectsConfig,
  resolvePortraitTagToUrl,
  saveEffectsConfigLocal,
} from '@/lib/effects';

const EFFECT_BASE_WIDTH = 1200;
const EFFECT_BASE_HEIGHT = 675;

type SelectedTarget =
  | { kind: 'image'; imageId: string }
  | { kind: 'pc'; characterId: string }
  | null;

function sanitizePattern(raw: string) {
  const s = String(raw || '').trim();
  if (s.startsWith('{') && s.endsWith('}') && s.length >= 2) return s.slice(1, -1).trim();
  return s;
}

function isReservedTag(tag: string) {
  const t = String(tag || '').trim().toLowerCase();
  return t === 'delete' || t === 'blindd';
}

export function OtherEffectsEditorDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  room: Room | null;
  characters: Character[];
  assets: Asset[];
  activeTriggerId?: string | null;
  showList?: boolean;
  createNonce?: number;
  onSaved?: (next: EffectsConfig) => void;
}) {
  const { open, onOpenChange, room, createNonce, onSaved, characters, assets, activeTriggerId, showList = true } = props;
  const { toast } = useToast();
  const roomId = room?.id || '';
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [config, setConfig] = useState<EffectsConfig>(DEFAULT_EFFECTS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<SelectedTarget>(null);
  const [tab, setTab] = useState<'settings' | 'images'>('settings');
  const imgFileRef = useRef<HTMLInputElement>(null);
  const seFileRef = useRef<HTMLInputElement>(null);
  const createNonceRef = useRef<number | undefined>(undefined);
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewSize, setPreviewSize] = useState<{ width: number; height: number }>({ width: 720, height: 405 });
  const previewScale = Math.min(
    previewSize.width / EFFECT_BASE_WIDTH,
    previewSize.height / EFFECT_BASE_HEIGHT
  ) || 1;
  const pcCharacters = useMemo(() => characters.filter((c) => !c.is_npc), [characters]);
  const portraitOptionsByPc = useMemo(() => {
    const map = new Map<string, Array<{ key: string; label: string }>>();
    for (const pc of pcCharacters) {
      const list = assets
        .filter((a) => a.kind === 'portrait' && a.character_id === pc.id && a.tag !== '__avatar__')
        .map((a) => ({
          key: (a.tag || a.label || '').toLowerCase(),
          label: a.tag ? `${a.tag}（${a.label}）` : a.label,
        }))
        .filter((x) => x.key)
        .sort((a, b) => a.label.localeCompare(b.label, 'ja'));
      map.set(pc.id, list);
    }
    return map;
  }, [assets, pcCharacters]);

  useEffect(() => {
    if (!open) return;
    const base = normalizeEffectsConfig(loadEffectsConfig(room)) ?? DEFAULT_EFFECTS;
    const shouldCreate = createNonce !== undefined && createNonceRef.current !== createNonce;
    if (shouldCreate) createNonceRef.current = createNonce;

    if (shouldCreate) {
      const id = createId();
      const t: OtherEffectTrigger = {
        id,
        label: '演出',
        pattern: '',
        syntax: 'tag',
        match: 'contains',
        images: [],
        pc: {},
        seUrl: '',
      };
      const other = base.other || { triggers: [] };
      other.triggers = [...(other.triggers || []), t];
      base.other = other;
      setSelectedId(id);
    } else {
      const triggers = base.other?.triggers || [];
      setSelectedId(activeTriggerId ?? triggers[0]?.id ?? null);
    }

    setConfig(base);
    setTab('settings');
    setSelectedTarget(null);
  }, [open, roomId, createNonce, activeTriggerId]);

  const triggers = useMemo(() => normalizeEffectsConfig(config).other?.triggers || [], [config]);
  const selected = useMemo(() => triggers.find((t) => t.id === selectedId) ?? null, [triggers, selectedId]);
  const selectedDurationMs = selected ? Math.max(0, Number.isFinite(selected.durationMs) ? Number(selected.durationMs) : 2000) : 2000;

  const updateTrigger = (id: string, patch: Partial<OtherEffectTrigger>) => {
    setConfig((prev) => {
      const next = normalizeEffectsConfig(prev);
      const other = next.other || { triggers: [] };
      other.triggers = (other.triggers || []).map((t) => (t.id === id ? ({ ...t, ...patch } as any) : t));
      next.other = other;
      return next;
    });
  };

  const addTrigger = () => {
    const id = createId();
    const t: OtherEffectTrigger = {
      id,
      label: '演出',
      pattern: '',
      syntax: 'tag',
      match: 'contains',
      images: [],
      pc: {},
      seUrl: '',
    };
    setConfig((prev) => {
      const next = normalizeEffectsConfig(prev);
      const other = next.other || { triggers: [] };
      other.triggers = [...(other.triggers || []), t];
      next.other = other;
      return next;
    });
    setSelectedId(id);
    setTab('settings');
  };

  const deleteTrigger = (id: string) => {
    setConfig((prev) => {
      const next = normalizeEffectsConfig(prev);
      const other = next.other || { triggers: [] };
      other.triggers = (other.triggers || []).filter((t) => t.id !== id);
      next.other = other;
      return next;
    });
    setSelectedId((prev) => {
      if (prev !== id) return prev;
      const rest = triggers.filter((t) => t.id !== id);
      return rest[0]?.id ?? null;
    });
    setSelectedTarget(null);
  };

  const updateImage = (triggerId: string, imageId: string, patch: Partial<EffectImage>) => {
    setConfig((prev) => {
      const next = normalizeEffectsConfig(prev);
      const other = next.other || { triggers: [] };
      other.triggers = (other.triggers || []).map((t) => {
        if (t.id !== triggerId) return t;
        const images = (t.images || []).map((img) => (img.id === imageId ? { ...img, ...patch } : img));
        return { ...t, images };
      });
      next.other = other;
      return next;
    });
  };

  const updatePc = (triggerId: string, characterId: string, patch: Partial<PcEffect>) => {
    setConfig((prev) => {
      const next = normalizeEffectsConfig(prev);
      const other = next.other || { triggers: [] };
      other.triggers = (other.triggers || []).map((t) => {
        if (t.id !== triggerId) return t;
        const pc = { ...(t.pc || {}) };
        const current = pc[characterId] || { tag: '', x: 0, y: 0, scale: 1, rotate: 0, opacity: 1, z: 0 };
        pc[characterId] = { ...current, ...patch };
        return { ...t, pc };
      });
      next.other = other;
      return next;
    });
  };

  const addImage = (triggerId: string, url: string, label: string) => {
    setConfig((prev) => {
      const next = normalizeEffectsConfig(prev);
      const other = next.other || { triggers: [] };
      other.triggers = (other.triggers || []).map((t) => {
        if (t.id !== triggerId) return t;
        const img: EffectImage = {
          id: createId(),
          label: label || '画像',
          url,
          x: 0,
          y: 0,
          scale: 1,
          rotate: 0,
          opacity: 1,
          z: (t.images?.length ?? 0) + 1,
        };
        return { ...t, images: [...(t.images || []), img] };
      });
      next.other = other;
      return next;
    });
  };

  const deleteImage = (triggerId: string, imageId: string) => {
    setConfig((prev) => {
      const next = normalizeEffectsConfig(prev);
      const other = next.other || { triggers: [] };
      other.triggers = (other.triggers || []).map((t) => {
        if (t.id !== triggerId) return t;
        return { ...t, images: (t.images || []).filter((x) => x.id !== imageId) };
      });
      next.other = other;
      return next;
    });
    setSelectedTarget((prev) => (prev && prev.kind === 'image' && prev.imageId === imageId ? null : prev));
  };

  const handleUploadImage = async (triggerId: string, file: File) => {
    if (!roomId) return;
    setUploading(true);
    try {
      const url = await uploadFile(file, `effects-other/${roomId}`);
      if (!url) throw new Error('アップロードに失敗しました');
      addImage(triggerId, url, file.name.replace(/\.[^.]+$/, ''));
      toast({ title: '画像を追加しました' });
    } catch (e: any) {
      toast({ title: String(e?.message || 'アップロードに失敗しました'), variant: 'destructive' });
    } finally {
      setUploading(false);
      if (imgFileRef.current) imgFileRef.current.value = '';
    }
  };

  const handleUploadSe = async (triggerId: string, file: File) => {
    if (!roomId) return;
    setUploading(true);
    try {
      const url = await uploadFile(file, `effects-other-se/${roomId}`);
      if (!url) throw new Error('アップロードに失敗しました');
      updateTrigger(triggerId, { seUrl: url });
      toast({ title: 'SEを設定しました' });
    } catch (e: any) {
      toast({ title: String(e?.message || 'アップロードに失敗しました'), variant: 'destructive' });
    } finally {
      setUploading(false);
      if (seFileRef.current) seFileRef.current.value = '';
    }
  };

  const previewItems = useMemo(() => {
    if (!selected) return [];
    const list: Array<
      | ({ kind: 'image' } & EffectImage)
      | ({ kind: 'pc'; characterId: string; name: string } & EffectImage)
    > = [];
    for (const img of (selected.images || []).filter((x) => !!x.url)) {
      list.push({ kind: 'image', ...img });
    }
    if (selectedTarget?.kind === 'pc') {
      const pc = pcCharacters.find((c) => c.id === selectedTarget.characterId);
      const pcEffect = selected.pc?.[selectedTarget.characterId];
      if (pc && pcEffect?.tag) {
        const resolved = resolvePortraitTagToUrl(assets, pc.id, pcEffect.tag);
        if (resolved) {
          list.push({
            kind: 'pc',
            characterId: pc.id,
            name: pc.name,
            id: `pc:${pc.id}:other:${selected.id}`,
            label: pc.name,
            url: resolved.url,
            x: pcEffect.x,
            y: pcEffect.y,
            scale: pcEffect.scale,
            rotate: pcEffect.rotate,
            opacity: pcEffect.opacity,
            z: pcEffect.z,
          });
        }
      }
    }
    return list.sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
  }, [selected, selectedTarget, pcCharacters, assets]);

  useEffect(() => {
    if (!open) return;
    setSelectedTarget(null);
  }, [open, selectedId]);

  const selectedImage = useMemo(() => {
    if (!selectedTarget || selectedTarget.kind !== 'image') return null;
    return (selected?.images || []).find((i) => i.id === selectedTarget.imageId) ?? null;
  }, [selected, selectedTarget]);

  const selectedPc = useMemo(() => {
    if (!selectedTarget || selectedTarget.kind !== 'pc') return null;
    return pcCharacters.find((c) => c.id === selectedTarget.characterId) ?? null;
  }, [selectedTarget, pcCharacters]);

  const selectedPcEffect = useMemo(() => {
    if (!selected || !selectedPc) return null;
    const entry = selected.pc?.[selectedPc.id];
    return entry || { tag: '', x: 0, y: 0, scale: 1, rotate: 0, opacity: 1, z: 0 };
  }, [selected, selectedPc]);
  const selectedPcOptions = useMemo(() => {
    if (!selectedPc) return [];
    return portraitOptionsByPc.get(selectedPc.id) || [];
  }, [selectedPc, portraitOptionsByPc]);

  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      setPreviewSize({ width: Math.max(1, rect.width), height: Math.max(1, rect.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, selectedId]);

  const draggingRef = useRef<{
    target: SelectedTarget;
    startX: number;
    startY: number;
    baseXRel: number;
    baseYRel: number;
    width: number;
    height: number;
  } | null>(null);
  const onPointerDown = (e: React.PointerEvent, item: { kind: 'image' | 'pc'; id: string; characterId?: string; x: number; y: number }) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (item.kind === 'pc' && item.characterId) {
      setSelectedTarget({ kind: 'pc', characterId: item.characterId });
    } else {
      setSelectedTarget({ kind: 'image', imageId: item.id });
    }
    draggingRef.current = {
      target: item.kind === 'pc' && item.characterId ? { kind: 'pc', characterId: item.characterId } : { kind: 'image', imageId: item.id },
      startX: e.clientX,
      startY: e.clientY,
      baseXRel: item.x,
      baseYRel: item.y,
      width: EFFECT_BASE_WIDTH * previewScale,
      height: EFFECT_BASE_HEIGHT * previewScale,
    };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const drag = draggingRef.current;
    if (!drag || !selected) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    const x = drag.baseXRel + dx / Math.max(1, drag.width);
    const y = drag.baseYRel + dy / Math.max(1, drag.height);
    const next = { x: Math.round(x * 10000) / 10000, y: Math.round(y * 10000) / 10000 };
    if (drag.target.kind === 'pc') {
      updatePc(selected.id, drag.target.characterId, next);
    } else {
      updateImage(selected.id, drag.target.imageId, next);
    }
  };
  const onPointerUp = () => {
    draggingRef.current = null;
  };

  const handleSave = async () => {
    if (!roomId) return;
    const next = normalizeEffectsConfig(config);
    // validate
    for (const t of next.other?.triggers || []) {
      const p = sanitizePattern(t.pattern);
      if (!p) {
        toast({ title: '発動文字が空の演出があります', variant: 'destructive' });
        return;
      }
      if (t.syntax === 'tag' && isReservedTag(p)) {
        toast({ title: `{${p}} は予約タグなので使えません`, variant: 'destructive' });
        return;
      }
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('rooms').update({ effects: next } as any).eq('id', roomId);
      if (error) {
        const msg = String(error.message || '');
        const looksLikeMissingColumn = msg.includes('effects') && (msg.includes('column') || msg.includes('schema') || msg.includes('does not exist'));
        if (!looksLikeMissingColumn) throw error;
        const command = buildEffectsConfigCommand(next);
        if (!command) throw new Error('演出設定の生成に失敗しました');
        saveEffectsConfigLocal(roomId, next);
        const { error: msgError } = await supabase.from('messages').insert({
          room_id: roomId,
          type: 'system',
          text: command,
          speaker_name: 'システム',
          channel: 'public',
          secret_allow_list: [],
        } as any);
        if (msgError) throw msgError;
        toast({ title: '保存しました（共有モード）' });
        onSaved?.(next);
        onOpenChange(false);
        return;
      } else {
        toast({ title: '保存しました' });
      }
      onSaved?.(next);
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: `保存に失敗しました: ${String(e?.message || e)}`, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const triggerDisplay = (t: OtherEffectTrigger) => {
    const p = sanitizePattern(t.pattern);
    if (!p) return '(未設定)';
    return t.syntax === 'tag' ? `{${p}}` : p;
  };
  const triggerTitle = (t: OtherEffectTrigger) => (t.label && t.label.trim() ? t.label : '（無名）');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>その他演出</DialogTitle>
        </DialogHeader>

        <div className={`flex-1 min-h-0 overflow-auto ${showList ? 'grid grid-cols-6 gap-4' : ''}`}>
          {showList && (
            <div className="col-span-2 min-h-0 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">演出一覧</Label>
                <Button type="button" size="sm" variant="outline" onClick={addTrigger}>
                  <Plus className="w-4 h-4 mr-2" />
                  演出を追加
                </Button>
              </div>
              <div className="flex-1 min-h-0 overflow-auto rounded border border-border p-2 space-y-2">
                {triggers.length === 0 ? (
                  <div className="text-xs text-muted-foreground">演出がありません</div>
                ) : (
                  triggers.map((t) => (
                    <div
                      key={t.id}
                      className={`rounded border p-2 flex items-center gap-2 ${
                        selectedId === t.id ? 'border-primary' : 'border-border/60'
                      }`}
                    >
                      <button
                        type="button"
                        className="flex-1 text-left min-w-0"
                        onClick={() => setSelectedId(t.id)}
                        title={t.label}
                      >
                        <div className="text-sm truncate">{triggerTitle(t)}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {triggerDisplay(t)} / {t.match === 'exact' ? '全文合致' : '含む'}
                        </div>
                      </button>
                      <Button type="button" variant="outline" size="icon" className="h-9 w-9" onClick={() => setSelectedId(t.id)} title="編集">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-9 w-9"
                        onClick={() => deleteTrigger(t.id)}
                        title="削除"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          <div className={`${showList ? 'col-span-4' : ''} min-h-0 flex flex-col gap-3`}>
            {!selected ? (
              <div className="text-sm text-muted-foreground">左の「演出を追加」から作成してください。</div>
            ) : (
              <>
                <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
                  <TabsList>
                    <TabsTrigger value="settings">設定</TabsTrigger>
                    <TabsTrigger value="images">画像/SE</TabsTrigger>
                  </TabsList>
                  <TabsContent value="settings" className="space-y-4">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">名前</Label>
                      <Input value={selected.label} onChange={(e) => updateTrigger(selected.id, { label: e.target.value })} />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">表示時間（秒）</Label>
                      <div className="flex items-center gap-3">
                        <Slider
                          value={[Math.min(30, Math.max(0.2, selectedDurationMs / 1000))]}
                          min={0.2}
                          max={10}
                          step={0.1}
                          onValueChange={(v) => updateTrigger(selected.id, { durationMs: Math.round(v[0] * 1000) } as any)}
                          className="flex-1"
                        />
                        <Input
                          type="number"
                          step="0.1"
                          min="0.2"
                          max="30"
                          value={Math.round((selectedDurationMs / 1000) * 10) / 10}
                          onChange={(e) => {
                            const sec = Number.parseFloat(e.target.value || '0');
                            if (!Number.isFinite(sec)) return;
                            updateTrigger(selected.id, { durationMs: Math.round(Math.max(0, sec) * 1000) } as any);
                          }}
                          className="w-24 h-8"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">発動文字</Label>
                        <Input
                          value={selected.pattern}
                          onChange={(e) => updateTrigger(selected.id, { pattern: sanitizePattern(e.target.value) })}
                          placeholder="smile"
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between rounded border border-border p-2">
                          <div className="space-y-0.5">
                            <div className="text-sm">タグ形式</div>
                            <div className="text-xs text-muted-foreground">{triggerDisplay(selected)}</div>
                          </div>
                          <Switch
                            checked={selected.syntax === 'tag'}
                            onCheckedChange={(checked) => {
                              const p = sanitizePattern(selected.pattern);
                              if (checked && isReservedTag(p)) {
                                toast({ title: `{${p}} は予約タグなので使えません`, variant: 'destructive' });
                                return;
                              }
                              updateTrigger(selected.id, { syntax: checked ? 'tag' : 'plain' });
                            }}
                          />
                        </div>

                        <div className="flex items-center justify-between rounded border border-border p-2">
                          <div className="space-y-0.5">
                            <div className="text-sm">全文合致</div>
                            <div className="text-xs text-muted-foreground">
                              {selected.match === 'exact' ? 'その文字だけ送信した時' : '文章に含まれる時'}
                            </div>
                          </div>
                          <Switch
                            checked={selected.match === 'exact'}
                            onCheckedChange={(checked) => updateTrigger(selected.id, { match: checked ? 'exact' : 'contains' })}
                          />
                        </div>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="images" className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">SE（任意）</Label>
                      <div className="flex gap-2">
                        <Button type="button" variant="outline" disabled={uploading} onClick={() => seFileRef.current?.click()}>
                          <Upload className="w-4 h-4 mr-2" />
                          SEをアップロード
                        </Button>
                        <input
                          ref={seFileRef}
                          type="file"
                          accept="audio/*"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) void handleUploadSe(selected.id, f);
                          }}
                        />
                        <Button type="button" variant="outline" onClick={() => updateTrigger(selected.id, { seUrl: '' })}>
                          解除
                        </Button>
                      </div>
                      {selected.seUrl && <audio controls src={selected.seUrl} className="w-full" />}
                    </div>

                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">画像（複数可）</Label>
                      <div className="flex gap-2">
                        <input
                          ref={imgFileRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) void handleUploadImage(selected.id, f);
                          }}
                        />
                        <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={() => imgFileRef.current?.click()}>
                          <Plus className="w-4 h-4 mr-2" />
                          画像を追加
                        </Button>
                      </div>
                    </div>

                    <div className="h-[86px] overflow-x-auto overflow-y-hidden rounded border border-border p-2">
                      <div className="flex gap-2 w-max">
                        {previewItems.filter((img) => img.kind === 'image').map((img) => (
                          <div
                            key={img.id}
                            className={`relative shrink-0 w-[120px] h-[64px] rounded border ${
                              selectedTarget?.kind === 'image' && selectedTarget.imageId === img.id ? 'border-primary' : 'border-border/60'
                            }`}
                          >
                            <button
                              type="button"
                              className="absolute inset-0 p-2 text-left"
                              onClick={() => setSelectedTarget({ kind: 'image', imageId: img.id })}
                              title={img.label}
                            >
                              <img src={img.url} alt={img.label} className="absolute inset-0 w-full h-full object-contain opacity-70" />
                              <div className="absolute inset-x-0 bottom-0 bg-background/70 backdrop-blur px-2 py-1 text-xs truncate">
                                {img.label}
                              </div>
                            </button>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="absolute top-1 right-1 h-7 w-7"
                              onClick={() => deleteImage(selected.id, img.id)}
                              title="削除"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">PCごとの画像</Label>
                      {pcCharacters.length === 0 ? (
                        <div className="text-xs text-muted-foreground">PCがいません</div>
                      ) : (
                        <>
                          <Select
                            value={selectedPc?.id ?? ''}
                            onValueChange={(v) => setSelectedTarget(v ? { kind: 'pc', characterId: v } : null)}
                          >
                            <SelectTrigger className="bg-sidebar-accent border-sidebar-border text-xs">
                              <SelectValue placeholder="PCを選択" />
                            </SelectTrigger>
                            <SelectContent>
                              {pcCharacters.map((pc) => (
                                <SelectItem key={pc.id} value={pc.id}>
                                  {pc.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {selectedPc && selectedPcEffect && (
                            <div className="grid grid-cols-2 gap-2">
                              <Select
                                value={selectedPcEffect.tag ? selectedPcEffect.tag.toLowerCase() : '__none__'}
                                onValueChange={(v) => {
                                  const tag = v === '__none__' ? '' : v;
                                  updatePc(selected.id, selectedPc.id, { tag });
                                }}
                              >
                                <SelectTrigger className="bg-sidebar-accent border-sidebar-border text-xs">
                                  <SelectValue placeholder="立ち絵タグを選択" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">表示しない</SelectItem>
                                  {selectedPcOptions.map((opt) => (
                                    <SelectItem key={opt.key} value={opt.key}>
                                      {opt.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => updatePc(selected.id, selectedPc.id, { tag: '' })}
                              >
                                解除
                              </Button>
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {selectedImage && (
                      <div className="rounded border border-border p-2">
                        <div className="grid grid-cols-4 gap-2 text-xs items-end">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">拡大</Label>
                            <Slider
                              value={[selectedImage.scale]}
                              min={0.1}
                              max={5}
                              step={0.05}
                              onValueChange={(v) => updateImage(selected.id, selectedImage.id, { scale: v[0] })}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">回転</Label>
                            <Slider
                              value={[selectedImage.rotate]}
                              min={-180}
                              max={180}
                              step={1}
                              onValueChange={(v) => updateImage(selected.id, selectedImage.id, { rotate: v[0] })}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">透明</Label>
                            <Slider
                              value={[selectedImage.opacity]}
                              min={0}
                              max={1}
                              step={0.05}
                              onValueChange={(v) => updateImage(selected.id, selectedImage.id, { opacity: v[0] })}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Z</Label>
                            <Input
                              type="number"
                              value={selectedImage.z}
                              onChange={(e) => updateImage(selected.id, selectedImage.id, { z: parseInt(e.target.value || '0', 10) || 0 })}
                              className="h-8"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {selectedPc && selectedPcEffect && (
                      <div className="rounded border border-border p-2">
                        <div className="grid grid-cols-4 gap-2 text-xs items-end">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">拡大</Label>
                            <Slider
                              value={[selectedPcEffect.scale]}
                              min={0.1}
                              max={5}
                              step={0.05}
                              onValueChange={(v) => updatePc(selected.id, selectedPc.id, { scale: v[0] })}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">回転</Label>
                            <Slider
                              value={[selectedPcEffect.rotate]}
                              min={-180}
                              max={180}
                              step={1}
                              onValueChange={(v) => updatePc(selected.id, selectedPc.id, { rotate: v[0] })}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">透明</Label>
                            <Slider
                              value={[selectedPcEffect.opacity]}
                              min={0}
                              max={1}
                              step={0.05}
                              onValueChange={(v) => updatePc(selected.id, selectedPc.id, { opacity: v[0] })}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Z</Label>
                            <Input
                              type="number"
                              value={selectedPcEffect.z}
                              onChange={(e) =>
                                updatePc(selected.id, selectedPc.id, { z: parseInt(e.target.value || '0', 10) || 0 })
                              }
                              className="h-8"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="text-xs text-muted-foreground">プレビュー（ステージ比率 / ドラッグで移動 / クリックで選択）</div>
                    <div className="h-[360px] min-h-0">
                      <StageFrame ratio={16 / 9} className="w-full h-full">
                        <div
                          ref={previewRef}
                          className="absolute inset-0 rounded-lg border border-border bg-gradient-to-b from-background/70 to-background/30 overflow-hidden"
                          onPointerMove={onPointerMove}
                          onPointerUp={onPointerUp}
                          onPointerCancel={onPointerUp}
                        >
                          <div
                            className="absolute left-1/2 top-1/2"
                            style={{
                              width: EFFECT_BASE_WIDTH,
                              height: EFFECT_BASE_HEIGHT,
                              transform: `translate(-50%, -50%) scale(${previewScale})`,
                              transformOrigin: 'top left',
                            }}
                          >
                            {previewItems.map((item) => (
                              <div
                                key={item.id}
                                className={`absolute ${
                                  selectedTarget?.kind === item.kind &&
                                  ((item.kind === 'image' && selectedTarget.imageId === item.id) ||
                                    (item.kind === 'pc' && selectedTarget.characterId === item.characterId))
                                    ? 'ring-2 ring-primary'
                                    : ''
                                }`}
                                style={{
                                  left: EFFECT_BASE_WIDTH / 2 + item.x * EFFECT_BASE_WIDTH,
                                  top: EFFECT_BASE_HEIGHT / 2 + item.y * EFFECT_BASE_HEIGHT,
                                  transform: `translate(-50%, -50%) rotate(${item.rotate}deg) scale(${item.scale})`,
                                  transformOrigin: 'center',
                                  opacity: item.opacity,
                                  zIndex: item.z,
                                  cursor: 'grab',
                                  userSelect: 'none',
                                }}
                                onPointerDown={(e) => onPointerDown(e, item)}
                                title={item.label}
                              >
                                <img
                                  src={item.url}
                                  alt={item.label}
                                  className="object-contain pointer-events-none select-none"
                                  style={{ maxWidth: EFFECT_BASE_WIDTH, maxHeight: EFFECT_BASE_HEIGHT }}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      </StageFrame>
                    </div>
                  </TabsContent>
                </Tabs>
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            閉じる
          </Button>
          <Button type="button" disabled={saving} onClick={handleSave}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
