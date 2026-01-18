import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Upload, Trash2, Plus } from 'lucide-react';
import type { Asset, Room } from '@/types/trpg';
import { supabase } from '@/integrations/supabase/client';
import { uploadFile } from '@/lib/upload';
import { useToast } from '@/hooks/use-toast';
import { StageFrame } from '@/components/stage/StageFrame';
import { createId, type EffectImage } from '@/lib/effects';
import { TitleScreenCanvas } from '@/components/title/TitleScreenCanvas';
import {
  type BackgroundScreenConfig,
  normalizeBackgroundScreenConfig,
  loadBackgroundScreenConfig,
} from '@/lib/backgroundScreen';

const EFFECT_BASE_WIDTH = 1200;
const EFFECT_BASE_HEIGHT = 675;
const DEFAULT_PREVIEW_SIZE = { width: 720, height: 405 };

type SelectedTarget = { imageId: string } | null;

export function BackgroundScreenEditorDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  room: Room | null;
  assets: Asset[];
  onAssetAdded?: (asset: Asset) => void;
  onSaved?: (next: BackgroundScreenConfig) => void;
}) {
  const { open, onOpenChange, room, assets, onAssetAdded, onSaved } = props;
  const { toast } = useToast();
  const roomId = room?.id || '';
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [config, setConfig] = useState<BackgroundScreenConfig>({ images: [] });
  const [selectedTarget, setSelectedTarget] = useState<SelectedTarget>(null);
  const [newLabel, setNewLabel] = useState('');
  const imgFileRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewSize, setPreviewSize] = useState<{ width: number; height: number }>(DEFAULT_PREVIEW_SIZE);
  const [previewNonce, setPreviewNonce] = useState(0);
  const stageRect = useMemo(
    () => ({ x: 0, y: 0, width: previewSize.width, height: previewSize.height }),
    [previewSize.width, previewSize.height]
  );
  const showStageGuide = import.meta.env.DEV;
  const bgAssets = useMemo(() => assets.filter((a) => a.kind === 'background'), [assets]);

  useEffect(() => {
    if (!open) return;
    if (!room) return;
    const base = loadBackgroundScreenConfig(room);
    setConfig(base);
    setSelectedTarget(null);
  }, [open, room, room?.background_screen]);

  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) return;
      setPreviewSize({ width: rect.width, height: rect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setPreviewSize(DEFAULT_PREVIEW_SIZE);
    setPreviewNonce((prev) => prev + 1);
    const el = previewRef.current;
    if (!el) return;
    const id = window.requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) return;
      setPreviewSize({ width: rect.width, height: rect.height });
    });
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  const getMaxZ = useCallback((cfg: BackgroundScreenConfig) => {
    return Math.max(0, ...(cfg.images || []).map((x) => (Number.isFinite(x.z) ? Number(x.z) : 0)));
  }, []);

  const getMinZ = useCallback((cfg: BackgroundScreenConfig) => {
    return (cfg.images || []).length
      ? Math.min(...(cfg.images || []).map((x) => (Number.isFinite(x.z) ? Number(x.z) : 0)))
      : 0;
  }, []);

  const updateImage = (imageId: string, patch: Partial<EffectImage>) => {
    setConfig((prev) => {
      const next = normalizeBackgroundScreenConfig(prev);
      next.images = (next.images || []).map((img) => (img.id === imageId ? { ...img, ...patch } : img));
      return next;
    });
  };

  const addImage = (url: string, label: string) => {
    const id = createId();
    setConfig((prev) => {
      const next = normalizeBackgroundScreenConfig(prev);
      const nextZ = getMaxZ(next) + 1;
      const img: EffectImage = {
        id,
        label: label || '背景',
        url,
        x: 0,
        y: 0,
        anchor: 'center',
        scale: 1,
        rotate: 0,
        opacity: 1,
        z: nextZ,
      };
      next.images = [...(next.images || []), img];
      return next;
    });
    setSelectedTarget({ imageId: id });
  };

  const deleteImage = (imageId: string) => {
    setConfig((prev) => {
      const next = normalizeBackgroundScreenConfig(prev);
      next.images = (next.images || []).filter((x) => x.id !== imageId);
      return next;
    });
    setSelectedTarget((prev) => (prev && prev.imageId === imageId ? null : prev));
  };

  const handleUploadImage = async (file: File) => {
    if (!roomId) return;
    if (!newLabel.trim()) {
      toast({ title: '背景名を入力してください', variant: 'destructive' });
      return;
    }
    setUploading(true);
    try {
      const url = await uploadFile(file, `backgrounds/${roomId}`);
      if (!url) throw new Error('upload failed');
      const label = newLabel.trim();
      const payload = {
        room_id: roomId,
        kind: 'background',
        url,
        label,
        layer_order: 0,
        tag: '__bg__',
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

      if (error) throw error;
      if (data) onAssetAdded?.(data as Asset);
      addImage(url, label);
      setNewLabel('');
      toast({ title: '背景画像を追加しました' });
    } catch {
      toast({ title: 'アップロードに失敗しました', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const selectedImage = useMemo(() => {
    if (!selectedTarget) return null;
    return (config.images || []).find((x) => x.id === selectedTarget.imageId) ?? null;
  }, [config.images, selectedTarget]);

  const draggingRef = useRef<{
    startX: number;
    startY: number;
    baseXRel: number;
    baseYRel: number;
    width: number;
    height: number;
    imageId: string;
  } | null>(null);

  const onPointerDown = (e: React.PointerEvent, item: EffectImage) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setSelectedTarget({ imageId: item.id });
    draggingRef.current = {
      imageId: item.id,
      startX: e.clientX,
      startY: e.clientY,
      baseXRel: item.x,
      baseYRel: item.y,
      width: stageRect.width,
      height: stageRect.height,
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
    updateImage(drag.imageId, next);
  };

  const onPointerUp = () => {
    draggingRef.current = null;
  };

  const handleSave = async () => {
    if (!roomId) return;
    const next = normalizeBackgroundScreenConfig(config);
    setSaving(true);
    try {
      const { error } = await supabase.from('rooms').update({ background_screen: next } as any).eq('id', roomId);
      if (error) throw error;
      toast({ title: '背景を保存しました' });
      onSaved?.(next);
      onOpenChange(false);
    } catch (e: any) {
      const message = String(e?.message || '');
      const needsMigration = message.includes('background_screen') && message.includes('column');
      toast({
        title: '保存に失敗しました',
        description: needsMigration ? '背景レイヤー用のDBカラムが未適用です。マイグレーションを実行してください。' : message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const renderItems = useMemo(() => {
    return (config.images || []).slice().sort((a, b) => (a.z || 0) - (b.z || 0));
  }, [config.images]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>背景編集</DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-auto">
          <div className="grid grid-cols-6 gap-4 min-h-0">
            <div className="col-span-6 space-y-3 min-h-0 flex flex-col">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">登録済み背景から追加</Label>
                  <div className="max-h-48 overflow-y-auto space-y-2 rounded border border-border p-2">
                    {bgAssets.length === 0 ? (
                      <div className="text-xs text-muted-foreground">背景がありません</div>
                    ) : (
                      bgAssets.map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          className="w-full flex items-center gap-2 rounded-md border px-2 py-1 text-left text-sm border-border/40"
                          onClick={() => addImage(a.url, newLabel.trim() || a.label || '背景')}
                        >
                          <div className="h-8 w-8 rounded bg-cover bg-center border border-border/40" style={{ backgroundImage: `url(${a.url})` }} />
                          <div className="flex-1 truncate">{a.label || '背景'}</div>
                          <Plus className="h-4 w-4 text-muted-foreground" />
                        </button>
                      ))
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">背景名</Label>
                    <Input
                      value={newLabel}
                      onChange={(e) => setNewLabel(e.target.value)}
                      placeholder="例：森、街、屋敷…"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={uploading}
                    onClick={() => imgFileRef.current?.click()}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    背景画像をアップロード
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

                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">背景レイヤー</Label>
                  <div className="max-h-56 overflow-y-auto space-y-2 rounded border border-border p-2">
                    {(config.images || []).length === 0 ? (
                      <div className="text-xs text-muted-foreground">背景がありません</div>
                    ) : (
                      (config.images || []).map((img) => (
                        <button
                          key={img.id}
                          type="button"
                          className={`w-full flex items-center gap-2 rounded-md border px-2 py-1 text-left text-sm ${
                            selectedTarget?.imageId === img.id ? 'border-primary text-primary' : 'border-border/40'
                          }`}
                          onClick={() => setSelectedTarget({ imageId: img.id })}
                        >
                          <div className="h-8 w-8 rounded bg-cover bg-center border border-border/40" style={{ backgroundImage: `url(${img.url})` }} />
                          <div className="flex-1 truncate">{img.label || '背景'}</div>
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
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-3">
                  {selectedImage ? (
                    <div className="space-y-3">
                      <div>
                        <Label className="text-xs">ラベル</Label>
                        <Input
                          value={selectedImage.label || ''}
                          onChange={(e) => updateImage(selectedImage.id, { label: e.target.value })}
                          className="h-8 text-xs"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">X(%)</Label>
                        <Input
                          value={Math.round((selectedImage.x || 0) * 10000) / 100}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            if (!Number.isNaN(v)) updateImage(selectedImage.id, { x: v / 100 });
                          }}
                          className="h-8 text-xs"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Y(%)</Label>
                        <Input
                          value={Math.round((selectedImage.y || 0) * 10000) / 100}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            if (!Number.isNaN(v)) updateImage(selectedImage.id, { y: v / 100 });
                          }}
                          className="h-8 text-xs"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">拡大</Label>
                        <Slider
                          value={[selectedImage.scale || 1]}
                          min={0.1}
                          max={3}
                          step={0.01}
                          onValueChange={(v) => updateImage(selectedImage.id, { scale: v[0] })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">回転</Label>
                        <Slider
                          value={[selectedImage.rotate || 0]}
                          min={-180}
                          max={180}
                          step={1}
                          onValueChange={(v) => updateImage(selectedImage.id, { rotate: v[0] })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">透明</Label>
                        <Slider
                          value={[selectedImage.opacity ?? 1]}
                          min={0}
                          max={1}
                          step={0.01}
                          onValueChange={(v) => updateImage(selectedImage.id, { opacity: v[0] })}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const nextZ = getMaxZ(normalizeBackgroundScreenConfig(config)) + 1;
                            updateImage(selectedImage.id, { z: nextZ });
                          }}
                        >
                          手前に移動
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const nextZ = getMinZ(normalizeBackgroundScreenConfig(config)) - 1;
                            updateImage(selectedImage.id, { z: nextZ });
                          }}
                        >
                          背後に移動
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">背景を選択してください。</div>
                  )}
                </div>
              </div>

              <div className="col-span-6 min-h-0 flex flex-col">
                <div className="text-xs text-muted-foreground mt-1 mb-2">プレビュー（ステージ比率 / ドラッグで移動）</div>
                <div className="w-full h-[520px] max-h-[60vh] min-h-[360px]">
                  <StageFrame ratio={16 / 9} className="w-full h-full">
                    <div
                      key={previewNonce}
                      ref={previewRef}
                      className="absolute inset-0 rounded-lg border border-border bg-gradient-to-b from-background/70 to-background/30 overflow-hidden"
                      onPointerMove={onPointerMove}
                      onPointerUp={onPointerUp}
                      onPointerLeave={onPointerUp}
                    >
                      <TitleScreenCanvas
                        items={renderItems}
                        stageRect={stageRect}
                        containerWidth={previewSize.width}
                        containerHeight={previewSize.height}
                        showGuide={showStageGuide}
                        isSelected={(item) => selectedTarget?.imageId === item.id}
                        onPointerDown={(e, item) => onPointerDown(e, item)}
                      />
                    </div>
                  </StageFrame>
                </div>
              </div>
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
