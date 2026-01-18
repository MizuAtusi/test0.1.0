import { useEffect, useLayoutEffect, useState, useRef, useCallback } from 'react';
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
  getPortraitTransformStorageKey,
  savePortraitTransformSet,
  loadPortraitTransformSet,
  type PortraitTransformSet,
  type PortraitPosition,
} from '@/lib/portraitTransformsShared';
import {
  getAssetTransformRel,
  getPortraitPositionShiftRel,
  getPortraitRenderMetrics,
  hasPositionTransformColumns,
  legacyTransformToRel,
  relToBasePxX,
  relToBasePxY,
} from '@/lib/portraitTransformUtils';
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
  const isPortraitDebug = () => {
    try {
      return localStorage.getItem('trpg:debugPortrait') === '1';
    } catch {
      return false;
    }
  };
  const [variants, setVariants] = useState<PortraitVariant[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [previewPos, setPreviewPos] = useState<PortraitPosition>('center');
  const previewFrameRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const previewItemRef = useRef<HTMLDivElement>(null);
  const [previewSize, setPreviewSize] = useState<{ width: number; height: number }>({ width: 1200, height: 675 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const previewPositions: PortraitPosition[] = ['left', 'center', 'right'];
  const isDefaultTransform = (value: { scale?: number; x?: number; y?: number } | null | undefined) => {
    if (!value) return true;
    const scale = typeof value.scale === 'number' ? value.scale : 1;
    const x = typeof value.x === 'number' ? value.x : 0;
    const y = typeof value.y === 'number' ? value.y : 0;
    return Math.abs(scale - 1) < 0.0001 && Math.abs(x) < 0.0001 && Math.abs(y) < 0.0001;
  };
  const resolveTransform = (
    asset: Asset,
    position: PortraitPosition,
    shared: PortraitTransformSet | null,
    legacy: ReturnType<typeof getPortraitTransform>
  ) => {
    const hasPosition = hasPositionTransformColumns(asset, position);
    const assetRel = getAssetTransformRel(asset, position);
    const sharedRel = shared?.[position] ?? null;
    if (hasPosition && assetRel) {
      if (!isDefaultTransform(sharedRel) && isDefaultTransform(assetRel)) {
        return {
          scale: sharedRel?.scale ?? 1,
          x: sharedRel?.x ?? 0,
          y: sharedRel?.y ?? 0,
        };
      }
      return {
        scale: assetRel.scale ?? 1,
        x: assetRel.x ?? 0,
        y: assetRel.y ?? 0,
      };
    }

    if (sharedRel) {
      return {
        scale: sharedRel.scale ?? 1,
        x: sharedRel.x ?? 0,
        y: sharedRel.y ?? 0,
      };
    }

    const assetFallback = !hasPosition ? assetRel : null;
    if (assetFallback) {
      return {
        scale: assetFallback.scale ?? 1,
        x: assetFallback.x ?? 0,
        y: assetFallback.y ?? 0,
      };
    }

    const legacyRel = legacyTransformToRel(legacy);
    return {
      scale: legacyRel?.scale ?? 1,
      x: legacyRel?.x ?? 0,
      y: legacyRel?.y ?? 0,
    };
  };

  const getVariantTransform = (variant: PortraitVariant, pos: PortraitPosition) => {
    const shift = getPortraitPositionShiftRel(pos);
    if (pos === 'left') {
      return { shift, scale: variant.scaleLeft, offsetX: variant.offsetXLeft, offsetY: variant.offsetYLeft };
    }
    if (pos === 'right') {
      return { shift, scale: variant.scaleRight, offsetX: variant.offsetXRight, offsetY: variant.offsetYRight };
    }
    return { shift, scale: variant.scaleCenter, offsetX: variant.offsetXCenter, offsetY: variant.offsetYCenter };
  };

  const getPreviewMetrics = (variant: PortraitVariant, pos: PortraitPosition) => {
    const { scale, offsetX, offsetY } = getVariantTransform(variant, pos);
    return getPortraitRenderMetrics({
      containerWidth: previewSize.width,
      containerHeight: previewSize.height,
      scale,
      offsetXRel: offsetX,
      offsetYRel: offsetY,
      position: pos,
    });
  };

  const getPreviewStyle = (variant: PortraitVariant, pos: PortraitPosition) => {
    const { heightPx, offsetXPx, offsetYPx } = getPreviewMetrics(variant, pos);
    return {
      left: '50%',
      height: heightPx,
      width: 'auto',
      maxHeight: 'none',
      maxWidth: 'none',
      transform: `translate(-50%, 0) translate(${offsetXPx}px, ${offsetYPx}px)`,
      transformOrigin: 'bottom center',
    } as const;
  };

  const getNormalizedRect = (variantIndex: number, pos: PortraitPosition) => {
    const root = measureRef.current;
    const frame = previewRef.current;
    if (!root || !frame) return null;
    const isActive = variantIndex === selectedIndex && pos === previewPos;
    const target = (isActive ? previewItemRef.current : null)
      ?? root.querySelector<HTMLElement>(`[data-measure="${variantIndex}-${pos}"]`);
    if (!target) return null;
    const frameRect = frame.getBoundingClientRect();
    const rect = target.getBoundingClientRect();
    if (!frameRect.width || !frameRect.height || !rect.width || !rect.height) return null;
    const round = (n: number) => Math.round(n * 10000) / 10000;
    const x = (rect.left - frameRect.left) / frameRect.width;
    const y = (rect.top - frameRect.top) / frameRect.height;
    const w = rect.width / frameRect.width;
    const h = rect.height / frameRect.height;
    if (isPortraitDebug()) {
      // Debug measurement units and normalization.
      console.log('[PortraitSave][measure]', {
        pos,
        source: isActive ? 'preview' : 'measure',
        frameRect: {
          left: frameRect.left,
          top: frameRect.top,
          width: frameRect.width,
          height: frameRect.height,
        },
        rect: {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        },
        normalized: { x: round(x), y: round(y), w: round(w), h: round(h) },
      });
    }
    return {
      x: round(x),
      y: round(y),
      w: round(w),
      h: round(h),
    };
  };

  const selectedVariant = variants[selectedIndex] ?? null;
  const previewStyle = selectedVariant ? getPreviewStyle(selectedVariant, previewPos) : null;

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
        data.map((raw: any) => {
          const asset = raw as Asset;
          const key = asset.tag || asset.label;
          const shared = key ? loadPortraitTransformSet(roomId, characterId, key) : null;
          const legacy = key ? getPortraitTransform(characterId, key) : null;
          const left = resolveTransform(asset, 'left', shared, legacy);
          const center = resolveTransform(asset, 'center', shared, legacy);
          const right = resolveTransform(asset, 'right', shared, legacy);
          return {
            id: asset.id,
            displayName: asset.label,
            tag: asset.tag || '',
            url: asset.url,
            isDefault: asset.is_default || false,
            scaleLeft: left.scale,
            offsetXLeft: left.x,
            offsetYLeft: left.y,
            scaleCenter: center.scale,
            offsetXCenter: center.x,
            offsetYCenter: center.y,
            scaleRight: right.scale,
            offsetXRight: right.x,
            offsetYRight: right.y,
          };
        });
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
    const activeSnapshot = (() => {
      const frame = previewRef.current;
      const target = previewItemRef.current;
      if (!frame || !target) return null;
      const frameRect = frame.getBoundingClientRect();
      const rect = target.getBoundingClientRect();
      if (!frameRect.width || !frameRect.height || !rect.width || !rect.height) return null;
      const round = (n: number) => Math.round(n * 10000) / 10000;
      const x = (rect.left - frameRect.left) / frameRect.width;
      const y = (rect.top - frameRect.top) / frameRect.height;
      const w = rect.width / frameRect.width;
      const h = rect.height / frameRect.height;
      if (isPortraitDebug()) {
        const v = variants[selectedIndex];
        console.log('[PortraitSave][before]', {
          selectedIndex,
          previewPos,
          scale: v ? getVariantTransform(v, previewPos).scale : undefined,
          offsetX: v ? getVariantTransform(v, previewPos).offsetX : undefined,
          offsetY: v ? getVariantTransform(v, previewPos).offsetY : undefined,
        });
        console.log('[PortraitSave][snapshot]', {
          frameRect: {
            left: frameRect.left,
            top: frameRect.top,
            width: frameRect.width,
            height: frameRect.height,
          },
          rect: {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
          },
          normalized: { x: round(x), y: round(y), w: round(w), h: round(h) },
        });
      }
      return { x: round(x), y: round(y), w: round(w), h: round(h) };
    })();

    setSaving(true);

    try {
      const RESERVED_TAGS = new Set(['delete', 'blindd']);
      const normalizedVariants =
        variants.length > 0 && !variants.some(v => v.isDefault)
          ? variants.map((v, i) => ({ ...v, isDefault: i === 0 }))
          : variants;
      const rectsByIndex = normalizedVariants.map((_, index) => ({
        left: index === selectedIndex && previewPos === 'left' ? activeSnapshot : getNormalizedRect(index, 'left'),
        center: index === selectedIndex && previewPos === 'center' ? activeSnapshot : getNormalizedRect(index, 'center'),
        right: index === selectedIndex && previewPos === 'right' ? activeSnapshot : getNormalizedRect(index, 'right'),
      }));

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
        scale_left: number;
        offset_x_left: number;
        offset_y_left: number;
        scale_center: number;
        offset_x_center: number;
        offset_y_center: number;
        scale_right: number;
        offset_x_right: number;
        offset_y_right: number;
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

        const safeScale = (value: number) => (Number.isFinite(value) ? value : 1);
        const safeRel = (value: number) => (Number.isFinite(value) ? value : 0);
        const scaleLeft = safeScale(variant.scaleLeft);
        const scaleCenter = safeScale(variant.scaleCenter);
        const scaleRight = safeScale(variant.scaleRight);
        const offsetXLeftRel = safeRel(variant.offsetXLeft);
        const offsetYLeftRel = safeRel(variant.offsetYLeft);
        const offsetXCenterRel = safeRel(variant.offsetXCenter);
        const offsetYCenterRel = safeRel(variant.offsetYCenter);
        const offsetXRightRel = safeRel(variant.offsetXRight);
        const offsetYRightRel = safeRel(variant.offsetYRight);
        const offsetXLeft = relToBasePxX(offsetXLeftRel);
        const offsetYLeft = relToBasePxY(offsetYLeftRel);
        const offsetXCenter = relToBasePxX(offsetXCenterRel);
        const offsetYCenter = relToBasePxY(offsetYCenterRel);
        const offsetXRight = relToBasePxX(offsetXRightRel);
        const offsetYRight = relToBasePxY(offsetYRightRel);

        resolved.push({
          room_id: roomId,
          character_id: characterId,
          kind: 'portrait' as const,
          label: variant.displayName.trim(),
          tag: variant.tag.trim().toLowerCase(),
          url,
          is_default: variant.isDefault,
          layer_order: i,
          scale: scaleCenter,
          offset_x: offsetXCenter,
          offset_y: offsetYCenter,
          scale_left: scaleLeft,
          offset_x_left: offsetXLeft,
          offset_y_left: offsetYLeft,
          scale_center: scaleCenter,
          offset_x_center: offsetXCenter,
          offset_y_center: offsetYCenter,
          scale_right: scaleRight,
          offset_x_right: offsetXRight,
          offset_y_right: offsetYRight,
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
        const looksLikeMissingColumns = message.includes('column') && message.includes('does not exist');
        if (!looksLikeMissingColumns) throw insertWithTransforms.error;
        const legacyRows = resolved.map(({
          scale_left,
          offset_x_left,
          offset_y_left,
          scale_center,
          offset_x_center,
          offset_y_center,
          scale_right,
          offset_x_right,
          offset_y_right,
          ...rest
        }) => rest);
        const insertLegacy = await supabase.from('assets').insert(legacyRows as any);
        if (insertLegacy.error) {
          const legacyMessage = insertLegacy.error.message || '';
          const legacyMissingColumns = legacyMessage.includes('column') && legacyMessage.includes('does not exist');
          if (!legacyMissingColumns) throw insertLegacy.error;
          const minimalRows = legacyRows.map(({ scale, offset_x, offset_y, ...rest }) => rest);
          const minimalInsert = await supabase.from('assets').insert(minimalRows as any);
          if (minimalInsert.error) throw minimalInsert.error;
        }
      }

      // Persist transforms locally (fallback when DB columns are missing)
      for (const v of normalizedVariants) {
        const keys = new Set<string>();
        if (v.tag.trim()) keys.add(v.tag);
        if (v.displayName.trim()) keys.add(v.displayName);
        for (const key of keys) {
          setPortraitTransform(characterId, key, {
            scale: Number.isFinite(v.scaleCenter) ? v.scaleCenter : 1,
            offsetX: relToBasePxX(Number.isFinite(v.offsetXCenter) ? v.offsetXCenter : 0),
            offsetY: relToBasePxY(Number.isFinite(v.offsetYCenter) ? v.offsetYCenter : 0),
          });
        }
      }

      // Persist shared transforms (room-wide) via hidden system message
      const commands: string[] = [];
      normalizedVariants.forEach((v, i) => {
        const key = v.tag.trim() || v.displayName.trim();
        if (!key) return;
        const rects = rectsByIndex[i];
        const withRect = (base: { scale: number; x: number; y: number }, rect?: { x: number; y: number; w: number; h: number } | null) => {
          if (!rect) return base;
          const round = (n: number) => Math.round(n * 10000) / 10000;
          const yTopNormFromTop = rect.y;
          const yBottomNormFromTop = rect.y + rect.h;
          const topFromBottom = round(1 - yTopNormFromTop);
          const bottomFromBottom = round(1 - yBottomNormFromTop);
          const anchorX = round(rect.x + rect.w / 2);
          return {
            ...base,
            rectX: rect.x,
            rectY: rect.y,
            rectW: rect.w,
            rectH: rect.h,
            anchorX,
            topFromBottom,
            bottomFromBottom,
          };
        };
        const set: PortraitTransformSet = {
          left: withRect({ scale: v.scaleLeft, x: v.offsetXLeft, y: v.offsetYLeft }, rects?.left),
          center: withRect({ scale: v.scaleCenter, x: v.offsetXCenter, y: v.offsetYCenter }, rects?.center),
          right: withRect({ scale: v.scaleRight, x: v.offsetXRight, y: v.offsetYRight }, rects?.right),
        };
        savePortraitTransformSet(roomId, characterId, key, set);
        if (isPortraitDebug()) {
          const storageKey = getPortraitTransformStorageKey(roomId, characterId, key);
          console.log('[PortraitSave][storage]', {
            key: storageKey,
            value: localStorage.getItem(storageKey),
            savedAt: new Date().toISOString(),
          });
        }
        try {
          window.dispatchEvent(new CustomEvent('trpg:portraitTransformChanged', { detail: { roomId, characterId, key } }));
        } catch {
          // ignore
        }
        const cmd = buildPortraitTransformCommand({ characterId, key, set });
        if (cmd) commands.push(cmd);
      });
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

  const dragRef = useRef<{
    pos: PortraitPosition;
    startX: number;
    startY: number;
    startOffsetXRel: number;
    startOffsetYRel: number;
    width: number;
    height: number;
  } | null>(null);

  const syncPreviewSize = useCallback(() => {
    const el = previewFrameRef.current;
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    setPreviewSize({
      width: Math.max(1, rect.width),
      height: Math.max(1, rect.height),
    });
    return true;
  }, []);

  useEffect(() => {
    if (!open) return;
    let ro: ResizeObserver | null = null;
    let raf = 0;
    const attach = () => {
      const el = previewFrameRef.current;
      if (!el) {
        raf = window.requestAnimationFrame(attach);
        return;
      }
      ro = new ResizeObserver((entries) => {
        const rect = entries[0]?.contentRect;
        if (!rect) return;
        setPreviewSize({
          width: Math.max(1, rect.width),
          height: Math.max(1, rect.height),
        });
      });
      ro.observe(el);
    };
    attach();
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    let raf = 0;
    let tries = 0;
    const tick = () => {
      if (syncPreviewSize()) return;
      tries += 1;
      if (tries < 8) {
        raf = window.requestAnimationFrame(tick);
      }
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [open, selectedIndex, previewPos, variants.length, syncPreviewSize]);

  useEffect(() => {
    if (!open) return;
    if (!open || !selectedVariant) return;
    const key = selectedVariant.tag.trim() || selectedVariant.displayName.trim();
    if (!key) return;
    const set = loadPortraitTransformSet(roomId, characterId, key);
    if (isPortraitDebug()) {
      console.log('[PortraitOpen][rehydrate]', { key, set });
    }
  }, [open, selectedVariant, roomId, characterId]);

  useEffect(() => {
    if (!open || !selectedVariant) return;
    if (isPortraitDebug()) {
      const { scale, offsetX, offsetY } = getVariantTransform(selectedVariant, previewPos);
      const metrics = getPreviewMetrics(selectedVariant, previewPos);
      const style = getPreviewStyle(selectedVariant, previewPos);
      console.log('[PortraitPreview][style]', {
        previewPos,
        previewSize,
        scale,
        offsetX,
        offsetY,
        heightPx: metrics.heightPx,
        offsetXPx: metrics.offsetXPx,
        offsetYPx: metrics.offsetYPx,
        baseHeightPx: metrics.baseHeightPx,
        transform: style.transform,
        maxHeight: style.maxHeight,
        maxWidth: style.maxWidth,
      });
    }
  }, [open, previewPos, previewSize, selectedVariant]);

  const onPreviewPointerDown = (pos: PortraitPosition) => (e: React.PointerEvent) => {
    if (!selectedVariant) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const frameRect = previewFrameRef.current?.getBoundingClientRect();
    const width = frameRect?.width && frameRect.width > 0 ? frameRect.width : previewSize.width;
    const height = frameRect?.height && frameRect.height > 0 ? frameRect.height : previewSize.height;
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
      width: Math.max(1, width),
      height: Math.max(1, height),
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
                <Tabs value={previewPos} onValueChange={(v) => setPreviewPos(v as PortraitPosition)}>
                  <TabsList className="h-8">
                    <TabsTrigger value="left" className="text-xs">左</TabsTrigger>
                    <TabsTrigger value="center" className="text-xs">中央</TabsTrigger>
                    <TabsTrigger value="right" className="text-xs">右</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              <AspectRatio ref={previewFrameRef} ratio={16 / 9} className="relative w-full">
                <div
                  ref={previewRef}
                  className="absolute inset-0 rounded border border-border bg-gradient-to-b from-background/70 to-background/30 overflow-hidden"
                  onPointerMove={onPreviewPointerMove}
                  onPointerUp={onPreviewPointerUp}
                  onPointerCancel={onPreviewPointerUp}
                >
                  <div
                    ref={measureRef}
                    aria-hidden="true"
                    className="absolute inset-0 pointer-events-none"
                    style={{ visibility: 'hidden' }}
                  >
                    <div className="relative w-full h-full">
                      {variants.map((variant, index) =>
                        variant.url
                          ? previewPositions.map((pos) => (
                              <div
                                key={`${index}-${pos}`}
                                data-measure={`${index}-${pos}`}
                                className="portrait-layer"
                                style={{
                                  ...getPreviewStyle(variant, pos),
                                  transition: 'none',
                                }}
                              >
                                <img
                                  src={variant.url}
                                  alt={variant.displayName}
                                  className="pointer-events-none select-none object-contain"
                                  style={{ height: '100%', width: 'auto', maxWidth: 'none', maxHeight: 'none' }}
                                />
                              </div>
                            ))
                          : null
                      )}
                    </div>
                  </div>
                  <div
                    className="portrait-layer cursor-grab select-none"
                    style={previewStyle ?? undefined}
                    onPointerDown={onPreviewPointerDown(previewPos)}
                    ref={previewItemRef}
                  >
                    <img
                      src={selectedVariant.url}
                      alt={selectedVariant.displayName}
                      className="pointer-events-none select-none object-contain"
                      style={{ height: '100%', width: 'auto', maxWidth: 'none', maxHeight: 'none' }}
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
