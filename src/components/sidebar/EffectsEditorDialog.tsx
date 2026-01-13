import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { Upload, Plus, Trash2 } from 'lucide-react';
import type { Asset, Character, Room } from '@/types/trpg';
import { supabase } from '@/integrations/supabase/client';
import { uploadFile } from '@/lib/upload';
import { useToast } from '@/hooks/use-toast';
import { StageFrame } from '@/components/stage/StageFrame';
import {
  DEFAULT_EFFECTS,
  type EffectKind,
  type EffectsConfig,
  type EffectImage,
  createId,
  buildEffectsConfigCommand,
  loadEffectsConfig,
  normalizeEffectsConfig,
  resolvePortraitTagToUrl,
  saveEffectsConfigLocal,
} from '@/lib/effects';
import { getImageSize } from '@/lib/imageSize';
import { convertCenterRelToTopLeftRel } from '@/lib/effectsPosition';

const EFFECT_BASE_WIDTH = 1200;
const EFFECT_BASE_HEIGHT = 675;

type SelectedTarget =
  | { kind: 'image'; effect: EffectKind; imageId: string }
  | { kind: 'pc'; effect: EffectKind; characterId: string }
  | null;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function EffectsEditorDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  room: Room | null;
  characters: Character[];
  assets: Asset[];
  onSaved?: (next: EffectsConfig) => void;
}) {
  const { open, onOpenChange, room, characters, assets, onSaved } = props;
  const { toast } = useToast();
  const roomId = room?.id || '';
  const [tab, setTab] = useState<EffectKind>('critical');
  const [config, setConfig] = useState<EffectsConfig>(DEFAULT_EFFECTS);
  const [selected, setSelected] = useState<SelectedTarget>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const imgFileRef = useRef<HTMLInputElement>(null);
  const seFileRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewSize, setPreviewSize] = useState<{ width: number; height: number }>({ width: 720, height: 405 });
  const previewScale = Math.min(
    previewSize.width / EFFECT_BASE_WIDTH,
    previewSize.height / EFFECT_BASE_HEIGHT
  ) || 1;

  const pcCharacters = useMemo(() => characters.filter((c) => !c.is_npc), [characters]);

  const convertImageToTopLeft = useCallback(async (img: EffectImage) => {
    if (!img?.url) return img;
    if (img.anchor === 'top-left') return img;
    const size = await getImageSize(img.url);
    if (!size) return img;
    const next = convertCenterRelToTopLeftRel({
      x: img.x,
      y: img.y,
      scale: img.scale ?? 1,
      size,
      baseWidth: EFFECT_BASE_WIDTH,
      baseHeight: EFFECT_BASE_HEIGHT,
    });
    return { ...img, x: next.x, y: next.y, anchor: 'top-left' };
  }, []);

  const convertPcToTopLeft = useCallback(
    async (pc: any, characterId: string) => {
      if (!pc?.tag || pc.anchor === 'top-left') return pc;
      const resolved = resolvePortraitTagToUrl(assets, characterId, pc.tag);
      if (!resolved?.url) return pc;
      const size = await getImageSize(resolved.url);
      if (!size) return pc;
      const next = convertCenterRelToTopLeftRel({
        x: pc.x,
        y: pc.y,
        scale: pc.scale ?? 1,
        size,
        baseWidth: EFFECT_BASE_WIDTH,
        baseHeight: EFFECT_BASE_HEIGHT,
      });
      return { ...pc, x: next.x, y: next.y, anchor: 'top-left' };
    },
    [assets]
  );

  useEffect(() => {
    if (!open) return;
    const base = normalizeEffectsConfig(loadEffectsConfig(room)) ?? DEFAULT_EFFECTS;
    setConfig(base);
    setSelected(null);
    setTab('critical');
    let cancelled = false;
    const run = async () => {
      const normalizeKind = async (kind: EffectKind) => {
        const images = await Promise.all(((base as any)[kind]?.images || []).map(convertImageToTopLeft));
        return { ...(base as any)[kind], images };
      };
      const [critical, fumble] = await Promise.all([normalizeKind('critical'), normalizeKind('fumble')]);
      const pcEntries = Object.entries(base.pc || {});
      const pcConverted = await Promise.all(
        pcEntries.map(async ([characterId, entry]) => {
          const criticalPc = (entry as any)?.critical ? await convertPcToTopLeft((entry as any).critical, characterId) : undefined;
          const fumblePc = (entry as any)?.fumble ? await convertPcToTopLeft((entry as any).fumble, characterId) : undefined;
          return [characterId, { ...entry, critical: criticalPc, fumble: fumblePc }] as const;
        })
      );
      const pc = pcConverted.reduce<Record<string, any>>((acc, [id, value]) => {
        acc[id] = value;
        return acc;
      }, {});
      if (!cancelled) {
        setConfig({
          ...base,
          critical,
          fumble,
          pc,
        });
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [open, roomId, convertImageToTopLeft, convertPcToTopLeft]);

  const images = (config[tab]?.images || []) as EffectImage[];
  const seUrl = String(config[tab]?.seUrl || '');
  const durationMs = Number.isFinite((config as any)[tab]?.durationMs) ? Number((config as any)[tab]?.durationMs) : 2000;

  const selectedImage = useMemo(() => {
    if (!selected || selected.kind !== 'image' || selected.effect !== tab) return null;
    return images.find((i) => i.id === selected.imageId) ?? null;
  }, [selected, images, tab]);

  const selectedPc = useMemo(() => {
    if (!selected || selected.kind !== 'pc' || selected.effect !== tab) return null;
    return pcCharacters.find((c) => c.id === selected.characterId) ?? null;
  }, [selected, pcCharacters, tab]);

  const pcEffect = useMemo(() => {
    if (!selectedPc) return null;
    const entry = config.pc?.[selectedPc.id]?.[tab];
    return entry || { tag: '', x: 0, y: 0, anchor: 'top-left', scale: 1, rotate: 0, opacity: 1, z: 0 };
  }, [config.pc, selectedPc, tab]);

  const portraitOptionsByPc = useMemo(() => {
    const map = new Map<string, Array<{ key: string; label: string; url: string }>>();
    for (const pc of pcCharacters) {
      const list = assets
        .filter((a) => a.kind === 'portrait' && a.character_id === pc.id && a.tag !== '__avatar__')
        .map((a) => ({
          key: (a.tag || a.label || '').toLowerCase(),
          label: a.tag ? `${a.tag}（${a.label}）` : a.label,
          url: a.url,
        }))
        .filter((x) => x.key)
        .sort((a, b) => a.label.localeCompare(b.label, 'ja'));
      map.set(pc.id, list);
    }
    return map;
  }, [assets, pcCharacters]);

  const updateImage = (imageId: string, patch: Partial<EffectImage>) => {
    setConfig((prev) => {
      const next = normalizeEffectsConfig(prev);
      const arr = (next[tab]?.images || []).map((img) => (img.id === imageId ? { ...img, ...patch } : img));
      (next as any)[tab] = { ...(next as any)[tab], images: arr };
      return next;
    });
  };

  const addImage = (url: string, label: string) => {
    setConfig((prev) => {
      const next = normalizeEffectsConfig(prev);
      const img: EffectImage = {
        id: createId(),
        label: label || '画像',
        url,
        x: 0,
        y: 0,
        anchor: 'top-left',
        scale: 1,
        rotate: 0,
        opacity: 1,
        z: (next[tab]?.images?.length ?? 0) + 1,
      };
      (next as any)[tab] = { ...(next as any)[tab], images: [...(next[tab]?.images || []), img] };
      return next;
    });
  };

  const deleteImage = (imageId: string) => {
    setConfig((prev) => {
      const next = normalizeEffectsConfig(prev);
      (next as any)[tab] = { ...(next as any)[tab], images: (next[tab]?.images || []).filter((x) => x.id !== imageId) };
      return next;
    });
    setSelected((prev) => (prev && prev.kind === 'image' && prev.imageId === imageId ? null : prev));
  };

  const updateTabPatch = (patch: Record<string, any>) => {
    setConfig((prev) => {
      const next = normalizeEffectsConfig(prev);
      (next as any)[tab] = { ...(next as any)[tab], ...patch };
      return next;
    });
  };

  const updatePc = (characterId: string, patch: Partial<NonNullable<EffectsConfig['pc']>[string][EffectKind]>) => {
    setConfig((prev) => {
      const next = normalizeEffectsConfig(prev);
      const pc = { ...(next.pc || {}) };
      const current = pc[characterId] || {};
      const currentEffect = (current as any)[tab] || { tag: '', x: 0, y: 0, anchor: 'top-left', scale: 1, rotate: 0, opacity: 1, z: 0 };
      (current as any)[tab] = { ...currentEffect, ...patch };
      pc[characterId] = current;
      next.pc = pc;
      return next;
    });
  };

  const previewItems = useMemo(() => {
    const c = normalizeEffectsConfig(config);
    const list: Array<
      | ({ kind: 'image' } & EffectImage)
      | ({ kind: 'pc'; characterId: string; name: string; placeholder?: boolean } & EffectImage)
    > = [];
    for (const img of c[tab]?.images || []) list.push({ kind: 'image', ...img });
    const pcsToShow =
      selectedPc
        ? pcCharacters.filter((x) => x.id === selectedPc.id)
        : [];
    for (const pc of pcsToShow) {
      const eff = c.pc?.[pc.id]?.[tab];
      if (!eff) continue;
      const resolved = eff.tag ? resolvePortraitTagToUrl(assets, pc.id, eff.tag) : null;
      list.push({
        kind: 'pc',
        characterId: pc.id,
        name: pc.name,
        id: `pc:${pc.id}:${tab}`,
        label: pc.name,
        url: resolved?.url ?? '',
        x: eff.x,
        y: eff.y,
        anchor: eff.anchor,
        scale: eff.scale,
        rotate: eff.rotate,
        opacity: eff.opacity,
        z: eff.z,
        placeholder: !resolved,
      });
    }
    return list.sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
  }, [config, tab, pcCharacters, assets, selectedPc?.id]);

  const draggingRef = useRef<{
    target: SelectedTarget;
    startX: number;
    startY: number;
    baseXRel: number;
    baseYRel: number;
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      setPreviewSize({ width: Math.max(1, rect.width), height: Math.max(1, rect.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  const onPointerDown = (e: React.PointerEvent, item: any) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (item.kind === 'image') setSelected({ kind: 'image', effect: tab, imageId: item.id });
    if (item.kind === 'pc') setSelected({ kind: 'pc', effect: tab, characterId: item.characterId });
    draggingRef.current = {
      target:
        item.kind === 'image'
          ? { kind: 'image', effect: tab, imageId: item.id }
          : { kind: 'pc', effect: tab, characterId: item.characterId },
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
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    const x = drag.baseXRel + dx / Math.max(1, drag.width);
    const y = drag.baseYRel + dy / Math.max(1, drag.height);
    const round = (n: number) => Math.round(n * 10000) / 10000;
    if (drag.target.kind === 'image') updateImage(drag.target.imageId, { x, y });
    if (drag.target.kind === 'pc') updatePc(drag.target.characterId, { x: round(x), y: round(y) } as any);
  };

  const onPointerUp = () => {
    draggingRef.current = null;
  };

  const handleUploadImage = async (file: File) => {
    if (!roomId) return;
    setUploading(true);
    try {
      const url = await uploadFile(file, `effects/${roomId}`);
      if (!url) throw new Error('アップロードに失敗しました');
      addImage(url, file.name.replace(/\.[^.]+$/, ''));
      toast({ title: '画像を追加しました' });
    } catch (e: any) {
      toast({ title: String(e?.message || 'アップロードに失敗しました'), variant: 'destructive' });
    } finally {
      setUploading(false);
      if (imgFileRef.current) imgFileRef.current.value = '';
    }
  };

  const addPcPlaceholders = () => {
    setConfig((prev) => {
      const next = normalizeEffectsConfig(prev);
      const pc = { ...(next.pc || {}) };
      const spacing = 220 / 1200;
      const y = 120 / 675;
      const added = pcCharacters.filter((c) => (pc[c.id] as any)?.[tab]).length;
      pcCharacters.forEach((c, idx) => {
        const cur = pc[c.id] || {};
        if ((cur as any)[tab]) return;
        const x = (added + idx - (pcCharacters.length - 1) / 2) * spacing;
        (cur as any)[tab] = { tag: '', x, y, anchor: 'top-left', scale: 1, rotate: 0, opacity: 1, z: 100 };
        pc[c.id] = cur;
      });
      next.pc = pc;
      return next;
    });
  };

  const handleUploadSe = async (file: File) => {
    if (!roomId) return;
    setUploading(true);
    try {
      const url = await uploadFile(file, `effects-se/${roomId}`);
      if (!url) throw new Error('アップロードに失敗しました');
      setConfig((prev) => {
        const next = normalizeEffectsConfig(prev);
        (next as any)[tab] = { ...(next as any)[tab], seUrl: url };
        return next;
      });
      toast({ title: 'SEを設定しました' });
    } catch (e: any) {
      toast({ title: String(e?.message || 'アップロードに失敗しました'), variant: 'destructive' });
    } finally {
      setUploading(false);
      if (seFileRef.current) seFileRef.current.value = '';
    }
  };

  const handleSave = async () => {
    if (!roomId) return;
    setSaving(true);
    const next = normalizeEffectsConfig(config);
    try {
      const { error } = await supabase.from('rooms').update({ effects: next } as any).eq('id', roomId);
      if (error) {
        const msg = String(error.message || '');
        const looksLikeMissingColumn = msg.includes('effects') && (msg.includes('column') || msg.includes('schema') || msg.includes('does not exist'));
        if (!looksLikeMissingColumn) throw error;
        // Shared fallback: broadcast config via hidden system command
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>演出（クリティカル / ファンブル）</DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-auto">
          <div className="grid grid-cols-6 gap-4 min-h-0">
            <div className="col-span-6 space-y-3 min-h-0 flex flex-col">
            <Tabs value={tab} onValueChange={(v) => setTab(v as EffectKind)}>
              <TabsList className="w-full">
                <TabsTrigger className="flex-1" value="critical">クリティカル</TabsTrigger>
                <TabsTrigger className="flex-1" value="fumble">ファンブル</TabsTrigger>
              </TabsList>
              <TabsContent value={tab} className="space-y-3">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">SE（任意）</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      disabled={uploading}
                      onClick={() => seFileRef.current?.click()}
                    >
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
                        if (f) void handleUploadSe(f);
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        setConfig((prev) => {
                          const next = normalizeEffectsConfig(prev);
                          (next as any)[tab] = { ...(next as any)[tab], seUrl: '' };
                          return next;
                        })
                      }
                    >
                      解除
                    </Button>
                  </div>
                  {seUrl && (
                    <audio controls src={seUrl} className="w-full" />
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">表示時間（秒）</Label>
                  <div className="flex items-center gap-3">
                    <Slider
                      value={[Math.min(30, Math.max(0.2, durationMs / 1000))]}
                      min={0.2}
                      max={10}
                      step={0.1}
                      onValueChange={(v) => updateTabPatch({ durationMs: Math.round(v[0] * 1000) })}
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      step="0.1"
                      min="0.2"
                      max="30"
                      value={Math.round((durationMs / 1000) * 10) / 10}
                      onChange={(e) => {
                        const sec = Number.parseFloat(e.target.value || '0');
                        if (!Number.isFinite(sec)) return;
                        updateTabPatch({ durationMs: Math.round(Math.max(0, sec) * 1000) });
                      }}
                      className="w-24 h-8"
                    />
                  </div>
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
                        if (f) void handleUploadImage(f);
                      }}
                    />
                    <Button type="button" size="sm" variant="outline" onClick={addPcPlaceholders}>
                      立ち絵を追加
                    </Button>
                    <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={() => imgFileRef.current?.click()}>
                      <Plus className="w-4 h-4 mr-2" />
                      画像を追加
                    </Button>
                  </div>
                </div>

                <div className="h-[86px] overflow-x-auto overflow-y-hidden rounded border border-border p-2">
                  <div className="flex gap-2 w-max">
                    {images
                      .slice()
                      .sort((a, b) => (a.z ?? 0) - (b.z ?? 0))
                      .map((img) => {
                        const isSelected = selected?.kind === 'image' && selected.imageId === img.id;
                        return (
                          <button
                            key={img.id}
                            type="button"
                            className={`shrink-0 w-[120px] h-[64px] rounded border relative ${
                              isSelected ? 'border-primary' : 'border-border/60'
                            }`}
                            onClick={() => setSelected({ kind: 'image', effect: tab, imageId: img.id })}
                            title={img.label}
                          >
                            <img src={img.url} alt={img.label} className="absolute inset-0 w-full h-full object-contain opacity-70" />
                            <div className="absolute inset-x-0 bottom-0 bg-background/70 backdrop-blur px-2 py-1 text-xs truncate">
                              {img.label}
                            </div>
                          </button>
                        );
                      })}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">PC画像（PCごと）</Label>
                  <div className="space-y-2 max-h-[160px] overflow-auto rounded border border-border p-2">
                    {pcCharacters.length === 0 ? (
                      <div className="text-xs text-muted-foreground">PCがいません</div>
                    ) : (
                      pcCharacters.map((pc) => {
                        const eff = config.pc?.[pc.id]?.[tab];
                        const value = eff?.tag || '';
                        const isAdded = !!eff;
                        const options = portraitOptionsByPc.get(pc.id) || [];
                        const isEditing = selected?.kind === 'pc' && selected.characterId === pc.id && selected.effect === tab;
                        return (
                          <div
                            key={pc.id}
                            className={`flex items-center gap-2 rounded px-1 py-1 ${
                              isEditing ? 'bg-accent/30 ring-1 ring-primary/40' : ''
                            }`}
                            onClick={() => setSelected({ kind: 'pc', effect: tab, characterId: pc.id })}
                            role="button"
                            tabIndex={0}
                          >
                            <div className="text-sm w-28 truncate">{pc.name}</div>
                            <Select
                              value={value || '__none__'}
                              onValueChange={(v) => {
                                if (v === '__none__') {
                                  updatePc(pc.id, { tag: '' } as any);
                                } else {
                                  updatePc(pc.id, { tag: v } as any);
                                }
                              }}
                            >
                              <SelectTrigger className="h-8 text-xs flex-1">
                                <SelectValue placeholder="立ち絵タグを選択（なしなら非表示）" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">（表示しない）</SelectItem>
                                {options.map((o) => (
                                  <SelectItem key={o.key} value={o.key}>
                                    {o.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelected({ kind: 'pc', effect: tab, characterId: pc.id });
                              }}
                              disabled={!isAdded}
                            >
                              調整
                            </Button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="rounded border border-border p-3 space-y-3">
                  <Label className="text-xs text-muted-foreground">選択中の調整</Label>
                  {selectedImage ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Label className="text-xs w-12">名前</Label>
                        <Input
                          value={selectedImage.label}
                          onChange={(e) => updateImage(selectedImage.id, { label: e.target.value })}
                          className="h-8"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          onClick={() => deleteImage(selectedImage.id)}
                          title="削除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-3 gap-3 text-xs">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">拡大</Label>
                          <Slider
                            value={[selectedImage.scale]}
                            min={0.1}
                            max={5}
                            step={0.05}
                            onValueChange={(v) => updateImage(selectedImage.id, { scale: v[0] })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">回転</Label>
                          <Slider
                            value={[selectedImage.rotate]}
                            min={-180}
                            max={180}
                            step={1}
                            onValueChange={(v) => updateImage(selectedImage.id, { rotate: v[0] })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">透明</Label>
                          <Slider
                            value={[selectedImage.opacity]}
                            min={0}
                            max={1}
                            step={0.05}
                            onValueChange={(v) => updateImage(selectedImage.id, { opacity: v[0] })}
                          />
                        </div>
                      </div>
                    </div>
                  ) : selectedPc && pcEffect ? (
                    <div className="space-y-3">
                      <div className="text-sm font-medium">{selectedPc.name}</div>
                      <div className="grid grid-cols-3 gap-3 text-xs">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">拡大</Label>
                          <Slider
                            value={[pcEffect.scale]}
                            min={0.1}
                            max={5}
                            step={0.05}
                            onValueChange={(v) => updatePc(selectedPc.id, { scale: v[0] } as any)}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">回転</Label>
                          <Slider
                            value={[pcEffect.rotate]}
                            min={-180}
                            max={180}
                            step={1}
                            onValueChange={(v) => updatePc(selectedPc.id, { rotate: v[0] } as any)}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">透明</Label>
                          <Slider
                            value={[pcEffect.opacity]}
                            min={0}
                            max={1}
                            step={0.05}
                            onValueChange={(v) => updatePc(selectedPc.id, { opacity: v[0] } as any)}
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">画像またはPCを選択してください。</div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
            </div>
          </div>

          <div className="col-span-6 min-h-0 flex flex-col">
            <div className="text-xs text-muted-foreground mt-1 mb-2">プレビュー（ステージ比率 / ドラッグで移動 / クリックで選択）</div>
            <div className="w-full h-[520px] max-h-[60vh] min-h-[360px]">
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
                    {previewItems.map((item) => {
                      const isSelected =
                        (selected?.kind === 'image' && item.kind === 'image' && selected.imageId === item.id) ||
                        (selected?.kind === 'pc' && item.kind === 'pc' && selected.characterId === item.characterId);
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
                          className={`absolute ${isSelected ? 'ring-2 ring-primary' : ''}`}
                          style={{
                            left,
                            top,
                            transform: `${baseTransform} rotate(${item.rotate}deg) scale(${item.scale})`,
                            transformOrigin,
                            opacity: item.opacity,
                            zIndex: item.z,
                            cursor: 'grab',
                            userSelect: 'none',
                          }}
                          onPointerDown={(e) => onPointerDown(e, item)}
                          title={item.label}
                        >
                          {item.url ? (
                            <img
                              src={item.url}
                              alt={item.label}
                              className="object-contain pointer-events-none select-none"
                              style={{ maxWidth: EFFECT_BASE_WIDTH, maxHeight: EFFECT_BASE_HEIGHT }}
                            />
                          ) : (
                            <div className="w-[200px] h-[120px] rounded bg-background/60 border border-border flex items-center justify-center text-sm">
                              {item.label}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </StageFrame>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            閉じる
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
