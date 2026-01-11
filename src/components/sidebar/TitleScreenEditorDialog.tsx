import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Upload, Trash2 } from 'lucide-react';
import type { Asset, Character, Room } from '@/types/trpg';
import { supabase } from '@/integrations/supabase/client';
import { uploadFile } from '@/lib/upload';
import { useToast } from '@/hooks/use-toast';
import { StageFrame } from '@/components/stage/StageFrame';
import {
  type EffectImage,
  type PcEffect,
  createId,
  resolvePortraitTagToUrl,
} from '@/lib/effects';
import {
  type TitleScreenConfig,
  normalizeTitleScreenConfig,
  loadTitleScreenConfig,
} from '@/lib/titleScreen';

const EFFECT_BASE_WIDTH = 1200;
const EFFECT_BASE_HEIGHT = 675;

type SelectedTarget =
  | { kind: 'image'; imageId: string }
  | { kind: 'pc'; characterId: string }
  | null;

const DEFAULT_PC: PcEffect = { tag: '', x: 0, y: 0, scale: 1, rotate: 0, opacity: 1, z: 0 };

export function TitleScreenEditorDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  room: Room | null;
  characters: Character[];
  assets: Asset[];
  onSaved?: (next: TitleScreenConfig) => void;
}) {
  const { open, onOpenChange, room, characters, assets, onSaved } = props;
  const { toast } = useToast();
  const roomId = room?.id || '';
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [config, setConfig] = useState<TitleScreenConfig>({ images: [], pc: {}, bgmUrl: '' });
  const [selectedTarget, setSelectedTarget] = useState<SelectedTarget>(null);
  const imgFileRef = useRef<HTMLInputElement>(null);
  const bgmFileRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewSize, setPreviewSize] = useState<{ width: number; height: number }>({ width: 720, height: 405 });
  const pcCharacters = useMemo(() => characters.filter((c) => !c.is_npc), [characters]);
  const bgmAssets = useMemo(() => assets.filter((a) => a.kind === 'bgm'), [assets]);
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
    setConfig(loadTitleScreenConfig(room));
    setSelectedTarget(null);
  }, [open, roomId]);

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

  const updateImage = (imageId: string, patch: Partial<EffectImage>) => {
    setConfig((prev) => {
      const next = normalizeTitleScreenConfig(prev);
      next.images = (next.images || []).map((img) => (img.id === imageId ? { ...img, ...patch } : img));
      return next;
    });
  };

  const addImage = (url: string, label: string) => {
    setConfig((prev) => {
      const next = normalizeTitleScreenConfig(prev);
      const img: EffectImage = {
        id: createId(),
        label: label || '画像',
        url,
        x: 0,
        y: 0,
        scale: 1,
        rotate: 0,
        opacity: 1,
        z: (next.images?.length ?? 0) + 1,
      };
      next.images = [...(next.images || []), img];
      return next;
    });
  };

  const deleteImage = (imageId: string) => {
    setConfig((prev) => {
      const next = normalizeTitleScreenConfig(prev);
      next.images = (next.images || []).filter((x) => x.id !== imageId);
      return next;
    });
    setSelectedTarget((prev) => (prev && prev.kind === 'image' && prev.imageId === imageId ? null : prev));
  };

  const updatePc = (characterId: string, patch: Partial<PcEffect>) => {
    setConfig((prev) => {
      const next = normalizeTitleScreenConfig(prev);
      const pc = { ...(next.pc || {}) };
      const current = pc[characterId] || { ...DEFAULT_PC };
      pc[characterId] = { ...current, ...patch };
      next.pc = pc;
      return next;
    });
  };

  const handleUploadImage = async (file: File) => {
    if (!roomId) return;
    setUploading(true);
    try {
      const url = await uploadFile(file, `title-screens/${roomId}`);
      if (!url) throw new Error('upload failed');
      addImage(url, file.name || '画像');
      toast({ title: '画像を追加しました' });
    } catch (e) {
      toast({ title: 'アップロードに失敗しました', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const handleUploadBgm = async (file: File) => {
    if (!roomId) return;
    setUploading(true);
    try {
      const url = await uploadFile(file, `title-bgm/${roomId}`);
      if (!url) throw new Error('upload failed');
      setConfig((prev) => ({ ...normalizeTitleScreenConfig(prev), bgmUrl: url }));
      toast({ title: 'BGMを設定しました' });
    } catch {
      toast({ title: 'アップロードに失敗しました', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const selectedImage = useMemo(() => {
    if (!selectedTarget || selectedTarget.kind !== 'image') return null;
    return (config.images || []).find((x) => x.id === selectedTarget.imageId) ?? null;
  }, [config.images, selectedTarget]);

  const selectedPc = useMemo(() => {
    if (!selectedTarget || selectedTarget.kind !== 'pc') return null;
    return pcCharacters.find((c) => c.id === selectedTarget.characterId) ?? null;
  }, [selectedTarget, pcCharacters]);

  const selectedPcEffect = useMemo(() => {
    if (!selectedPc) return null;
    return (config.pc || {})[selectedPc.id] || { ...DEFAULT_PC };
  }, [config.pc, selectedPc]);

  const selectedPcOptions = useMemo(() => {
    if (!selectedPc) return [];
    return portraitOptionsByPc.get(selectedPc.id) || [];
  }, [portraitOptionsByPc, selectedPc]);

  const draggingRef = useRef<{
    target: SelectedTarget;
    startX: number;
    startY: number;
    baseXRel: number;
    baseYRel: number;
    width: number;
    height: number;
  } | null>(null);

  const onPointerDown = (
    e: React.PointerEvent,
    item: { kind: 'image' | 'pc'; id: string; characterId?: string; x: number; y: number }
  ) => {
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
      width: previewSize.width,
      height: previewSize.height,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = draggingRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    const x = drag.baseXRel + dx / Math.max(1, drag.width);
    const y = drag.baseYRel + dy / Math.max(1, drag.height);
    const next = { x: Math.round(x * 10000) / 10000, y: Math.round(y * 10000) / 10000 };
    if (drag.target.kind === 'pc') {
      updatePc(drag.target.characterId, next);
    } else {
      updateImage(drag.target.imageId, next);
    }
  };

  const onPointerUp = () => {
    draggingRef.current = null;
  };

  const handleSave = async () => {
    if (!roomId) return;
    const next = normalizeTitleScreenConfig(config);
    setSaving(true);
    try {
      const { error } = await supabase.from('rooms').update({ title_screen: next } as any).eq('id', roomId);
      if (error) throw error;
      toast({ title: 'タイトル画面を保存しました' });
      onSaved?.(next);
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: '保存に失敗しました', description: e?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const renderItems = useMemo(() => {
    const out: Array<EffectImage & { kind: 'image' | 'pc'; characterId?: string; name?: string }> = [];
    (config.images || []).forEach((img) => {
      out.push({ ...img, kind: 'image' });
    });
    pcCharacters.forEach((pc) => {
      const eff = (config.pc || {})[pc.id];
      if (!eff || !eff.tag) return;
      const resolved = resolvePortraitTagToUrl(assets, pc.id, eff.tag);
      if (!resolved) return;
      out.push({
        id: `pc:${pc.id}`,
        label: resolved.label || pc.name,
        url: resolved.url,
        x: eff.x,
        y: eff.y,
        scale: eff.scale,
        rotate: eff.rotate,
        opacity: eff.opacity,
        z: eff.z,
        kind: 'pc',
        characterId: pc.id,
        name: pc.name,
      });
    });
    return out.sort((a, b) => (a.z || 0) - (b.z || 0));
  }, [config, pcCharacters, assets]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col overflow-y-auto">
        <DialogHeader>
          <DialogTitle>タイトル画面を編集</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[260px,1fr]">
            <div className="space-y-3">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">画像一覧</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    disabled={uploading}
                    onClick={() => imgFileRef.current?.click()}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    画像を追加
                  </Button>
                  <input
                    ref={imgFileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleUploadImage(file);
                      e.currentTarget.value = '';
                    }}
                  />
                </div>
                <div className="max-h-52 overflow-y-auto space-y-2 rounded-md border border-border/40 p-2">
                  {(config.images || []).length === 0 ? (
                    <div className="text-xs text-muted-foreground">画像がありません</div>
                  ) : (
                    (config.images || []).map((img) => (
                      <button
                        key={img.id}
                        type="button"
                        className={`w-full flex items-center gap-2 rounded-md border px-2 py-1 text-left text-sm ${
                          selectedTarget?.kind === 'image' && selectedTarget.imageId === img.id
                            ? 'border-primary text-primary'
                            : 'border-border/40'
                        }`}
                        onClick={() => setSelectedTarget({ kind: 'image', imageId: img.id })}
                      >
                        <div className="h-8 w-8 rounded bg-cover bg-center border border-border/40" style={{ backgroundImage: `url(${img.url})` }} />
                        <div className="flex-1 truncate">{img.label || '画像'}</div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteImage(img.id);
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">PC画像（PCごと）</Label>
                {pcCharacters.length === 0 ? (
                  <div className="text-xs text-muted-foreground">PCがありません</div>
                ) : (
                  <div className="space-y-2">
                    {pcCharacters.map((pc) => {
                      const eff = (config.pc || {})[pc.id] || { ...DEFAULT_PC };
                      const options = portraitOptionsByPc.get(pc.id) || [];
                      return (
                        <div
                          key={pc.id}
                          className={`rounded-md border px-2 py-2 text-sm ${
                            selectedTarget?.kind === 'pc' && selectedTarget.characterId === pc.id
                              ? 'border-primary text-primary'
                              : 'border-border/40'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <button
                              type="button"
                              className="flex-1 text-left truncate"
                              onClick={() => setSelectedTarget({ kind: 'pc', characterId: pc.id })}
                            >
                              {pc.name}
                            </button>
                            {eff.tag && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => updatePc(pc.id, { tag: '' })}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                          <div className="mt-2">
                            <Select
                              value={eff.tag || 'none'}
                              onValueChange={(v) => {
                                updatePc(pc.id, { tag: v === 'none' ? '' : v });
                                setSelectedTarget({ kind: 'pc', characterId: pc.id });
                              }}
                            >
                              <SelectTrigger className="h-7 text-xs">
                                <SelectValue placeholder="立ち絵タグを選択" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">表示しない</SelectItem>
                                {options.map((opt) => (
                                  <SelectItem key={opt.key} value={opt.key}>
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">タイトル画面BGM</Label>
                <Select
                  value={config.bgmUrl ? `url:${config.bgmUrl}` : 'none'}
                  onValueChange={(v) => {
                    if (v === 'none') {
                      setConfig((prev) => ({ ...normalizeTitleScreenConfig(prev), bgmUrl: '' }));
                      return;
                    }
                    if (v.startsWith('url:')) {
                      setConfig((prev) => ({ ...normalizeTitleScreenConfig(prev), bgmUrl: v.slice(4) }));
                    }
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="BGMを選択" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">なし</SelectItem>
                    {bgmAssets.map((a) => (
                      <SelectItem key={a.id} value={`url:${a.url}`}>
                        {a.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={uploading}
                  onClick={() => bgmFileRef.current?.click()}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  BGMをアップロード
                </Button>
                <input
                  ref={bgmFileRef}
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleUploadBgm(file);
                    e.currentTarget.value = '';
                  }}
                />
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-xs text-muted-foreground">プレビュー</Label>
              <div ref={previewRef} className="w-full">
                <StageFrame className="w-full" ratio={16 / 9}>
                  <div
                    className="relative h-full w-full bg-muted/10"
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerLeave={onPointerUp}
                  >
                    <div
                      className="absolute left-0 top-0"
                      style={{
                        width: EFFECT_BASE_WIDTH,
                        height: EFFECT_BASE_HEIGHT,
                        transform: `scale(${previewSize.width / EFFECT_BASE_WIDTH}, ${previewSize.height / EFFECT_BASE_HEIGHT})`,
                        transformOrigin: 'top left',
                      }}
                    >
                      {renderItems.map((item) => (
                        <div
                          key={item.id}
                          className={`absolute ${selectedTarget && ((selectedTarget.kind === 'image' && item.kind === 'image' && selectedTarget.imageId === item.id) || (selectedTarget.kind === 'pc' && item.kind === 'pc' && selectedTarget.characterId === item.characterId)) ? 'ring-2 ring-primary' : ''}`}
                          style={{
                            left: EFFECT_BASE_WIDTH / 2 + item.x * EFFECT_BASE_WIDTH,
                            top: EFFECT_BASE_HEIGHT / 2 + item.y * EFFECT_BASE_HEIGHT,
                            transform: `translate(-50%, -50%) rotate(${item.rotate}deg) scale(${item.scale})`,
                            transformOrigin: 'center',
                            opacity: item.opacity,
                            zIndex: item.z,
                          }}
                          onPointerDown={(e) =>
                            onPointerDown(e, {
                              kind: item.kind,
                              id: item.id,
                              characterId: item.characterId,
                              x: item.x,
                              y: item.y,
                            })
                          }
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
                </StageFrame>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {selectedImage && (
                  <div className="space-y-3">
                    <Label className="text-xs text-muted-foreground">選択中の画像</Label>
                    <Input
                      value={selectedImage.label}
                      onChange={(e) => updateImage(selectedImage.id, { label: e.target.value })}
                    />
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">拡大</Label>
                      <Slider
                        min={0.2}
                        max={3}
                        step={0.01}
                        value={[selectedImage.scale]}
                        onValueChange={(v) => updateImage(selectedImage.id, { scale: v[0] })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">回転</Label>
                      <Slider
                        min={-180}
                        max={180}
                        step={1}
                        value={[selectedImage.rotate]}
                        onValueChange={(v) => updateImage(selectedImage.id, { rotate: v[0] })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">透明</Label>
                      <Slider
                        min={0}
                        max={1}
                        step={0.01}
                        value={[selectedImage.opacity]}
                        onValueChange={(v) => updateImage(selectedImage.id, { opacity: v[0] })}
                      />
                    </div>
                  </div>
                )}

                {selectedPc && selectedPcEffect && (
                  <div className="space-y-3">
                    <Label className="text-xs text-muted-foreground">選択中のPC</Label>
                    <Select
                      value={selectedPcEffect.tag || 'none'}
                      onValueChange={(v) => updatePc(selectedPc.id, { tag: v === 'none' ? '' : v })}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="立ち絵タグを選択" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">表示しない</SelectItem>
                        {selectedPcOptions.map((opt) => (
                          <SelectItem key={opt.key} value={opt.key}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">拡大</Label>
                      <Slider
                        min={0.2}
                        max={3}
                        step={0.01}
                        value={[selectedPcEffect.scale]}
                        onValueChange={(v) => updatePc(selectedPc.id, { scale: v[0] })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">回転</Label>
                      <Slider
                        min={-180}
                        max={180}
                        step={1}
                        value={[selectedPcEffect.rotate]}
                        onValueChange={(v) => updatePc(selectedPc.id, { rotate: v[0] })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">透明</Label>
                      <Slider
                        min={0}
                        max={1}
                        step={0.01}
                        value={[selectedPcEffect.opacity]}
                        onValueChange={(v) => updatePc(selectedPc.id, { opacity: v[0] })}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            閉じる
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
