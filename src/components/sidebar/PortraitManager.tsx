import { useEffect, useState, useRef, useCallback } from 'react';
import { Plus, Trash2, GripVertical, Upload, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { uploadFile } from '@/lib/upload';
import { getPortraitTransform, setPortraitTransform } from '@/lib/portraitTransforms';
import {
  buildPortraitTransformCommand,
  savePortraitTransformSet,
  loadPortraitTransformSet,
  type PortraitTransformSet,
} from '@/lib/portraitTransformsShared';
import { useToast } from '@/hooks/use-toast';
import type { Asset } from '@/types/trpg';

interface PortraitManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomId: string;
  characterId: string;
  characterName: string;
  onUpdate: () => void;
}

interface PortraitVariant {
  id?: string;
  displayName: string;
  tag: string;
  url: string;
  isDefault: boolean;
  file?: File;
  scaleLeft: number;
  offsetXLeft: number; // relative (0.1 = 10% of stage width)
  offsetYLeft: number; // relative (0.1 = 10% of stage height)
  scaleCenter: number;
  offsetXCenter: number; // relative
  offsetYCenter: number; // relative
  scaleRight: number;
  offsetXRight: number; // relative
  offsetYRight: number; // relative
}

export function PortraitManager({
  open,
  onOpenChange,
  roomId,
  characterId,
  characterName,
  onUpdate,
}: PortraitManagerProps) {
  const [variants, setVariants] = useState<PortraitVariant[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [previewPos, setPreviewPos] = useState<'left' | 'center' | 'right'>('center');
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewSize, setPreviewSize] = useState<{ width: number; height: number }>({ width: 1200, height: 675 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Fetch existing assets
  const fetchAssets = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('assets')
      .select('*')
      .eq('character_id', characterId)
      .eq('kind', 'portrait')
      .or('tag.is.null,tag.neq.__avatar__')
      .order('layer_order', { ascending: true });

    if (!error && data) {
      const nextVariants =
        data.map((a: any) => ({
          id: a.id,
          displayName: a.label,
          tag: a.tag || '',
          url: a.url,
          isDefault: a.is_default || false,
          ...((): PortraitVariant extends infer T ? Partial<PortraitVariant> : never => {
            const key = a.tag || a.label;
            const set = loadPortraitTransformSet(roomId, characterId, key);
            if (set) {
              return {
                scaleLeft: set.left.scale,
                offsetXLeft: set.left.x,
                offsetYLeft: set.left.y,
                scaleCenter: set.center.scale,
                offsetXCenter: set.center.x,
                offsetYCenter: set.center.y,
                scaleRight: set.right.scale,
                offsetXRight: set.right.x,
                offsetYRight: set.right.y,
              } as any;
            }
            const legacy = getPortraitTransform(characterId, key);
            return {
              scaleLeft: legacy?.scale ?? 1,
              offsetXLeft: 0,
              offsetYLeft: 0,
              scaleCenter: legacy?.scale ?? 1,
              offsetXCenter: 0,
              offsetYCenter: 0,
              scaleRight: legacy?.scale ?? 1,
              offsetXRight: 0,
              offsetYRight: 0,
            } as any;
          })(),
        }));
      setVariants(nextVariants);
      setSelectedIndex((prev) => {
        if (nextVariants.length === 0) return 0;
        return Math.min(Math.max(0, prev), nextVariants.length - 1);
      });
    }
    setLoading(false);
  }, [characterId, roomId]);

  // Load assets when dialog opens
  useEffect(() => {
    if (open) fetchAssets();
  }, [open, fetchAssets]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;

      const url = URL.createObjectURL(file);
      const newVariant: PortraitVariant = {
        displayName: file.name.split('.')[0],
        tag: '',
        url,
        isDefault: variants.length === 0,
        file,
        scaleLeft: 1,
        offsetXLeft: 0,
        offsetYLeft: 0,
        scaleCenter: 1,
        offsetXCenter: 0,
        offsetYCenter: 0,
        scaleRight: 1,
        offsetXRight: 0,
        offsetYRight: 0,
      };
      setVariants(prev => [...prev, newVariant]);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;

      const url = URL.createObjectURL(file);
      const newVariant: PortraitVariant = {
        displayName: file.name.split('.')[0],
        tag: '',
        url,
        isDefault: variants.length === 0,
        file,
        scaleLeft: 1,
        offsetXLeft: 0,
        offsetYLeft: 0,
        scaleCenter: 1,
        offsetXCenter: 0,
        offsetYCenter: 0,
        scaleRight: 1,
        offsetXRight: 0,
        offsetYRight: 0,
      };
      setVariants(prev => [...prev, newVariant]);
    }
  }, [variants.length]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const updateVariant = (index: number, updates: Partial<PortraitVariant>) => {
    setVariants(prev => prev.map((v, i) => (i === index ? { ...v, ...updates } : v)));
  };

  const removeVariant = (index: number) => {
    setVariants(prev => prev.filter((_, i) => i !== index));
    setSelectedIndex((prev) => (prev >= index ? Math.max(0, prev - 1) : prev));
  };

  const setDefaultVariant = (index: number) => {
    setVariants(prev =>
      prev.map((v, i) => ({
        ...v,
        isDefault: i === index,
      }))
    );
  };

  const handleSave = async () => {
    setSaving(true);

    try {
      const RESERVED_TAGS = new Set(['delete', 'blindd']);
      const normalizedVariants =
        variants.length > 0 && !variants.some(v => v.isDefault)
          ? variants.map((v, i) => ({ ...v, isDefault: i === 0 }))
          : variants;

      // Upload files first
      const resolved: Array<{
        room_id: string;
        character_id: string;
        kind: 'portrait';
        label: string;
        tag: string;
        url: string;
        is_default: boolean;
        layer_order: number;
        scale: number;
        offset_x: number;
        offset_y: number;
      }> = [];
      for (let i = 0; i < normalizedVariants.length; i++) {
        const variant = normalizedVariants[i];
        if (!variant.displayName.trim()) {
          throw new Error('表示名が空です');
        }
        const tagNormalized = variant.tag.trim().toLowerCase();
        if (tagNormalized && RESERVED_TAGS.has(tagNormalized)) {
          throw new Error(`このタグは使用できません: ${variant.tag}`);
        }

        let url = variant.url;
        if (variant.file) {
          const uploadedUrl = await uploadFile(variant.file, `portraits/${characterId}`);
          if (!uploadedUrl) {
            throw new Error(`${variant.displayName}のアップロードに失敗しました`);
          }
          url = uploadedUrl;
        }

        resolved.push({
          room_id: roomId,
          character_id: characterId,
          kind: 'portrait' as const,
          label: variant.displayName.trim(),
          tag: variant.tag.trim().toLowerCase(),
          url,
          is_default: variant.isDefault,
          layer_order: i,
          scale: Number.isFinite(variant.scaleCenter) ? variant.scaleCenter : 1,
          offset_x: 0,
          offset_y: 0,
        });
      }

      // Snapshot existing ids (delete only after successful insert)
      const { data: existing, error: existingError } = await supabase
        .from('assets')
        .select('id')
        .eq('character_id', characterId)
        .eq('kind', 'portrait')
        .or('tag.is.null,tag.neq.__avatar__');
      if (existingError) throw existingError;
      const existingIds = (existing || []).map((r: { id: string }) => r.id);

      // Insert new asset records (batch). If DB migration isn't applied yet, retry without new columns.
      const insertWithTransforms = await supabase.from('assets').insert(resolved);
      if (insertWithTransforms.error) {
        const message = insertWithTransforms.error.message || '';
        const looksLikeMissingColumns =
          message.includes('scale') ||
          message.includes('offset_x') ||
          message.includes('offset_y');

        if (!looksLikeMissingColumns) throw insertWithTransforms.error;
        const minimalRows = resolved.map(({ scale, offset_x, offset_y, ...rest }) => rest);
        const minimalInsert = await supabase.from('assets').insert(minimalRows as any);
        if (minimalInsert.error) throw minimalInsert.error;
      }

      // Persist transforms locally (fallback when DB columns are missing)
      for (const v of normalizedVariants) {
        const keys = new Set<string>();
        if (v.tag.trim()) keys.add(v.tag);
        if (v.displayName.trim()) keys.add(v.displayName);
        for (const key of keys) {
          setPortraitTransform(characterId, key, { scale: v.scaleCenter, offsetX: 0, offsetY: 0 });
        }
      }

      // Persist shared transforms (room-wide) via hidden system message
      const commands: string[] = [];
      for (const v of normalizedVariants) {
        const key = v.tag.trim() || v.displayName.trim();
        if (!key) continue;
        const set: PortraitTransformSet = {
          left: { scale: v.scaleLeft, x: v.offsetXLeft, y: v.offsetYLeft },
          center: { scale: v.scaleCenter, x: v.offsetXCenter, y: v.offsetYCenter },
          right: { scale: v.scaleRight, x: v.offsetXRight, y: v.offsetYRight },
        };
        savePortraitTransformSet(roomId, characterId, key, set);
        const cmd = buildPortraitTransformCommand({ characterId, key, set });
        if (cmd) commands.push(cmd);
      }
      if (commands.length > 0) {
        await supabase.from('messages').insert({
          room_id: roomId,
          type: 'system',
          text: commands.join('\n'),
          speaker_name: 'システム',
          channel: 'public',
          secret_allow_list: [],
        } as any);
      }

      // Delete old assets after successful insert
      if (existingIds.length > 0) {
        const { error: deleteError } = await supabase.from('assets').delete().in('id', existingIds);
        if (deleteError) throw deleteError;
      }

      if (!insertWithTransforms.error) toast({ title: '立ち絵を保存しました' });
      onUpdate();
      onOpenChange(false);
    } catch (error) {
      console.error('Save error:', error);
      toast({
        title: '保存に失敗しました',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    }

    setSaving(false);
  };

  const selectedVariant = variants[selectedIndex] ?? null;
  const dragRef = useRef<{
    pos: 'left' | 'center' | 'right';
    startX: number;
    startY: number;
    startOffsetXRel: number;
    startOffsetYRel: number;
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      setPreviewSize({
        width: Math.max(1, rect.width),
        height: Math.max(1, rect.height),
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const el = previewRef.current;
    if (!el) return;
    const id = window.requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect();
      setPreviewSize({ width: Math.max(1, rect.width), height: Math.max(1, rect.height) });
    });
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  const onPreviewPointerDown = (pos: 'left' | 'center' | 'right') => (e: React.PointerEvent) => {
    if (!selectedVariant) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const base =
      pos === 'left'
        ? { x: selectedVariant.offsetXLeft, y: selectedVariant.offsetYLeft }
      : pos === 'right'
          ? { x: selectedVariant.offsetXRight, y: selectedVariant.offsetYRight }
          : { x: selectedVariant.offsetXCenter, y: selectedVariant.offsetYCenter };
    dragRef.current = {
      pos,
      startX: e.clientX,
      startY: e.clientY,
      startOffsetXRel: base.x,
      startOffsetYRel: base.y,
      width: previewSize.width,
      height: previewSize.height,
    };
  };

  const onPreviewPointerMove = (e: React.PointerEvent) => {
    const st = dragRef.current;
    if (!st) return;
    const dx = e.clientX - st.startX;
    const dy = e.clientY - st.startY;
    const nextXRel = st.startOffsetXRel + dx / Math.max(1, st.width);
    const nextYRel = st.startOffsetYRel + dy / Math.max(1, st.height);
    const round = (n: number) => Math.round(n * 10000) / 10000;
    if (st.pos === 'left') updateVariant(selectedIndex, { offsetXLeft: round(nextXRel), offsetYLeft: round(nextYRel) });
    if (st.pos === 'center') updateVariant(selectedIndex, { offsetXCenter: round(nextXRel), offsetYCenter: round(nextYRel) });
    if (st.pos === 'right') updateVariant(selectedIndex, { offsetXRight: round(nextXRel), offsetYRight: round(nextYRel) });
  };

  const onPreviewPointerUp = () => {
    dragRef.current = null;
  };

  const alignAllToDefault = () => {
    const def = variants.find((v) => v.isDefault) ?? variants[0];
    if (!def) return;
    setVariants((prev) =>
      prev.map((v) => {
        if (v === def) return v;
        return {
          ...v,
          scaleLeft: def.scaleLeft,
          offsetXLeft: def.offsetXLeft,
          offsetYLeft: def.offsetYLeft,
          scaleCenter: def.scaleCenter,
          offsetXCenter: def.offsetXCenter,
          offsetYCenter: def.offsetYCenter,
          scaleRight: def.scaleRight,
          offsetXRight: def.offsetXRight,
          offsetYRight: def.offsetYRight,
        };
      }),
    );
  };

  const alignAllToCenter = () => {
    setVariants((prev) =>
      prev.map((v) => ({
        ...v,
        scaleLeft: v.scaleCenter,
        offsetXLeft: v.offsetXCenter,
        offsetYLeft: v.offsetYCenter,
        scaleRight: v.scaleCenter,
        offsetXRight: v.offsetXCenter,
        offsetYRight: v.offsetYCenter,
      })),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{characterName} - 立ち絵管理</DialogTitle>
        </DialogHeader>

        <div
          className="flex-1 min-h-0 overflow-auto flex flex-col"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
          {/* Upload Area */}
          <div
            className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary transition-colors cursor-pointer mb-4"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              クリックまたはドラッグ＆ドロップで画像を追加
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>

          {/* Variants List */}
          <ScrollArea className="h-[280px] shrink-0">
            <div className="space-y-3">
              {variants.map((variant, index) => (
                <div
                  key={index}
                  className={`flex items-center gap-3 p-3 rounded-lg border ${
                    index === selectedIndex ? 'bg-secondary border-primary/60' : 'bg-secondary border-transparent'
                  }`}
                  onClick={() => setSelectedIndex(index)}
                >
                  <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />
                  
                  {/* Preview */}
                  <div className="w-16 h-16 rounded bg-background flex items-center justify-center overflow-hidden">
                    {variant.url ? (
                      <img src={variant.url} alt={variant.displayName} className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon className="w-6 h-6 text-muted-foreground" />
                    )}
                  </div>

                  {/* Fields */}
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">表示名</Label>
                      <Input
                        value={variant.displayName}
                        onChange={(e) => updateVariant(index, { displayName: e.target.value })}
                        placeholder="笑顔"
                        className="h-8"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">タグ (例: smile)</Label>
                      <Input
                        value={variant.tag}
                        onChange={(e) => updateVariant(index, { tag: e.target.value })}
                        placeholder="smile"
                        className="h-8"
                      />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs text-muted-foreground">（倍率/ずれは下のプレビューで位置ごとに調整）</Label>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <Button
                      variant={variant.isDefault ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setDefaultVariant(index)}
                    >
                      {variant.isDefault ? 'デフォルト' : '設定'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      onClick={() => removeVariant(index)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}

              {variants.length === 0 && !loading && (
                <div className="text-center py-8 text-muted-foreground">
                  <ImageIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>まだ立ち絵がありません</p>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Preview / Drag adjust */}
          {selectedVariant && selectedVariant.url && (
            <div className="shrink-0 mt-2 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-muted-foreground">プレビュー: ドラッグで位置調整</div>
                <Tabs value={previewPos} onValueChange={(v) => setPreviewPos(v as any)}>
                  <TabsList className="h-8">
                    <TabsTrigger value="left" className="text-xs">左</TabsTrigger>
                    <TabsTrigger value="center" className="text-xs">中央</TabsTrigger>
                    <TabsTrigger value="right" className="text-xs">右</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              <AspectRatio ratio={16 / 9} className="relative w-full">
                <div
                  ref={previewRef}
                  className="absolute inset-0 rounded border border-border bg-gradient-to-b from-background/70 to-background/30 overflow-hidden"
                  onPointerMove={onPreviewPointerMove}
                  onPointerUp={onPreviewPointerUp}
                  onPointerCancel={onPreviewPointerUp}
                >
                  <div
                    className="portrait-layer cursor-grab select-none"
                    style={{
                      left: '50%',
                      maxHeight: '80%',
                      maxWidth: '80%',
                      transform:
                        previewPos === 'left'
                          ? `translate(-50%, 0) translate(${(selectedVariant.offsetXLeft - 0.225) * previewSize.width}px, ${selectedVariant.offsetYLeft * previewSize.height}px) scale(${selectedVariant.scaleLeft})`
                          : previewPos === 'right'
                            ? `translate(-50%, 0) translate(${(selectedVariant.offsetXRight + 0.225) * previewSize.width}px, ${selectedVariant.offsetYRight * previewSize.height}px) scale(${selectedVariant.scaleRight})`
                            : `translate(-50%, 0) translate(${selectedVariant.offsetXCenter * previewSize.width}px, ${selectedVariant.offsetYCenter * previewSize.height}px) scale(${selectedVariant.scaleCenter})`,
                      transformOrigin: 'bottom center',
                    }}
                    onPointerDown={onPreviewPointerDown(previewPos)}
                  >
                    <img
                      src={selectedVariant.url}
                      alt={selectedVariant.displayName}
                      className="pointer-events-none select-none object-contain"
                      style={{ maxWidth: '100%', maxHeight: '100%', height: 'auto', width: 'auto' }}
                    />
                  </div>
                </div>
              </AspectRatio>

              {variants.length >= 1 && (
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={alignAllToCenter}>
                    中央の立ち絵に座標を合わせる
                  </Button>
                  {variants.length >= 2 && (
                    <Button type="button" variant="outline" size="sm" onClick={alignAllToDefault}>
                      デフォルトの立ち絵と座標・倍率を合わせる
                    </Button>
                  )}
                </div>
              )}

              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1 rounded border border-border p-2">
                  <div className="text-xs text-muted-foreground">左</div>
                  <div className="grid grid-cols-[0.8fr_1fr_1fr] gap-2">
                    <div>
                      <Label className="text-xs">倍率</Label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.05"
                        value={String(selectedVariant.scaleLeft)}
                        onChange={(e) => updateVariant(selectedIndex, { scaleLeft: Number.parseFloat(e.target.value) || 1 })}
                        className="h-8 tabular-nums"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">X(%)</Label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.1"
                        value={selectedVariant.offsetXLeft * 100}
                        onChange={(e) =>
                          updateVariant(selectedIndex, { offsetXLeft: (Number.parseFloat(e.target.value || '0') || 0) / 100 })
                        }
                        className="h-8 tabular-nums"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Y(%)</Label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.1"
                        value={selectedVariant.offsetYLeft * 100}
                        onChange={(e) =>
                          updateVariant(selectedIndex, { offsetYLeft: (Number.parseFloat(e.target.value || '0') || 0) / 100 })
                        }
                        className="h-8 tabular-nums"
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-1 rounded border border-border p-2">
                  <div className="text-xs text-muted-foreground">中央</div>
                  <div className="grid grid-cols-[0.8fr_1fr_1fr] gap-2">
                    <div>
                      <Label className="text-xs">倍率</Label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.05"
                        value={String(selectedVariant.scaleCenter)}
                        onChange={(e) => updateVariant(selectedIndex, { scaleCenter: Number.parseFloat(e.target.value) || 1 })}
                        className="h-8 tabular-nums"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">X(%)</Label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.1"
                        value={selectedVariant.offsetXCenter * 100}
                        onChange={(e) =>
                          updateVariant(selectedIndex, { offsetXCenter: (Number.parseFloat(e.target.value || '0') || 0) / 100 })
                        }
                        className="h-8 tabular-nums"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Y(%)</Label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.1"
                        value={selectedVariant.offsetYCenter * 100}
                        onChange={(e) =>
                          updateVariant(selectedIndex, { offsetYCenter: (Number.parseFloat(e.target.value || '0') || 0) / 100 })
                        }
                        className="h-8 tabular-nums"
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-1 rounded border border-border p-2">
                  <div className="text-xs text-muted-foreground">右</div>
                  <div className="grid grid-cols-[0.8fr_1fr_1fr] gap-2">
                    <div>
                      <Label className="text-xs">倍率</Label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.05"
                        value={String(selectedVariant.scaleRight)}
                        onChange={(e) => updateVariant(selectedIndex, { scaleRight: Number.parseFloat(e.target.value) || 1 })}
                        className="h-8 tabular-nums"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">X(%)</Label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.1"
                        value={selectedVariant.offsetXRight * 100}
                        onChange={(e) =>
                          updateVariant(selectedIndex, { offsetXRight: (Number.parseFloat(e.target.value || '0') || 0) / 100 })
                        }
                        className="h-8 tabular-nums"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Y(%)</Label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.1"
                        value={selectedVariant.offsetYRight * 100}
                        onChange={(e) =>
                          updateVariant(selectedIndex, { offsetYRight: (Number.parseFloat(e.target.value || '0') || 0) / 100 })
                        }
                        className="h-8 tabular-nums"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            キャンセル
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
