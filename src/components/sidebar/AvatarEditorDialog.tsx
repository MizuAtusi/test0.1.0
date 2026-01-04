import { useEffect, useMemo, useRef, useState } from 'react';
import { Upload, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { supabase } from '@/integrations/supabase/client';
import { uploadFile } from '@/lib/upload';
import { clearCharacterAvatar, getCharacterAvatarState, setCharacterAvatarState } from '@/lib/characterAvatar';
import { useToast } from '@/hooks/use-toast';
import type { Character } from '@/types/trpg';

const PREVIEW_SIZE = 200;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

export function AvatarEditorDialog({
  open,
  onOpenChange,
  character,
  editable,
  onUpdated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  character: Character;
  editable: boolean;
  onUpdated: () => void;
}) {
  const { toast } = useToast();
  const [sourceUrl, setSourceUrl] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [scale, setScale] = useState<number>(1);
  const [offsetX, setOffsetX] = useState<number>(0);
  const [offsetY, setOffsetY] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [imgMeta, setImgMeta] = useState<{ w: number; h: number; baseScale: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; startOffsetX: number; startOffsetY: number } | null>(null);

  const currentUrl = character.avatar_url || '';
  const localState = getCharacterAvatarState(character.id);
  const localUrl = localState?.url || '';

  useEffect(() => {
    if (!open) return;
    setSourceUrl(currentUrl || localUrl);
    setFile(null);
    setScale(
      typeof character.avatar_scale === 'number'
        ? character.avatar_scale
        : (localState?.scale ?? 1),
    );
    setOffsetX(
      typeof character.avatar_offset_x === 'number'
        ? character.avatar_offset_x
        : (localState?.offsetX ?? 0),
    );
    setOffsetY(
      typeof character.avatar_offset_y === 'number'
        ? character.avatar_offset_y
        : (localState?.offsetY ?? 0),
    );
  }, [open, currentUrl, localUrl, localState?.scale, localState?.offsetX, localState?.offsetY, character.avatar_scale, character.avatar_offset_x, character.avatar_offset_y, character.id]);

  const previewTransform = useMemo(() => {
    return `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
  }, [offsetX, offsetY, scale]);

  const clampOffsets = (nextOffsetX: number, nextOffsetY: number, nextScale: number) => {
    if (!imgMeta) return { x: nextOffsetX, y: nextOffsetY };
    const scaledW = imgMeta.w * imgMeta.baseScale * nextScale;
    const scaledH = imgMeta.h * imgMeta.baseScale * nextScale;
    const maxX = Math.max(0, (scaledW - PREVIEW_SIZE) / 2);
    const maxY = Math.max(0, (scaledH - PREVIEW_SIZE) / 2);
    return {
      x: clamp(nextOffsetX, -maxX, maxX),
      y: clamp(nextOffsetY, -maxY, maxY),
    };
  };

  // Load image metadata for preview scaling/clamping
  useEffect(() => {
    if (!open) return;
    if (!sourceUrl) {
      setImgMeta(null);
      return;
    }
    let canceled = false;
    loadImage(sourceUrl)
      .then((img) => {
        if (canceled) return;
        const baseScale = Math.max(PREVIEW_SIZE / img.width, PREVIEW_SIZE / img.height);
        setImgMeta({ w: img.width, h: img.height, baseScale });
      })
      .catch(() => {
        if (canceled) return;
        setImgMeta(null);
      });
    return () => {
      canceled = true;
    };
  }, [open, sourceUrl]);

  // Clamp offsets whenever scale/meta changes (prevents empty crop)
  useEffect(() => {
    if (!imgMeta) return;
    const clamped = clampOffsets(offsetX, offsetY, scale);
    if (clamped.x !== offsetX) setOffsetX(clamped.x);
    if (clamped.y !== offsetY) setOffsetY(clamped.y);
  }, [imgMeta, scale]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    if (!f) return;
    if (!f.type.startsWith('image/')) return;
    setFile(f);
    const url = URL.createObjectURL(f);
    setSourceUrl(url);
    setScale(1);
    setOffsetX(0);
    setOffsetY(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const buildCroppedAvatar = async (src: string) => {
    const img = await loadImage(src);
    const canvas = document.createElement('canvas');
    const size = 256;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas');

    const baseScale = Math.max(size / img.width, size / img.height);
    const appliedScale = baseScale * scale;
    const scaledW = img.width * appliedScale;
    const scaledH = img.height * appliedScale;

    const clamped = clampOffsets(offsetX, offsetY, scale);
    const safeOffsetX = clamped.x;
    const safeOffsetY = clamped.y;

    const ratio = size / PREVIEW_SIZE;
    const dx = (size - scaledW) / 2 + safeOffsetX * ratio;
    const dy = (size - scaledH) / 2 + safeOffsetY * ratio;

    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(img, dx, dy, scaledW, scaledH);

    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => {
        if (!b) reject(new Error('toBlob'));
        else resolve(b);
      }, 'image/png');
    });
    return new File([blob], `avatar-${character.id}.png`, { type: 'image/png' });
  };

  const saveToDb = async (avatarUrl: string) => {
    // Always keep local cache
    setCharacterAvatarState(character.id, {
      url: avatarUrl,
      scale,
      offsetX,
      offsetY,
    });

    // Always upsert shared avatar via assets (so others can see it even without avatar columns)
    const del = await supabase
      .from('assets')
      .delete()
      .eq('character_id', character.id)
      .eq('kind', 'portrait')
      .eq('tag', '__avatar__');
    if (del.error) throw del.error;

    const label = `avatar|scale=${scale}|x=${Math.trunc(offsetX)}|y=${Math.trunc(offsetY)}`;
    const ins = await supabase.from('assets').insert({
      room_id: character.room_id,
      character_id: character.id,
      kind: 'portrait',
      url: avatarUrl,
      label,
      tag: '__avatar__',
      is_default: false,
      layer_order: 0,
    } as any);
    if (ins.error) throw ins.error;

    const payload = {
      avatar_url: avatarUrl,
      avatar_scale: scale,
      avatar_offset_x: Math.trunc(offsetX),
      avatar_offset_y: Math.trunc(offsetY),
    };

    const result = await supabase.from('characters').update(payload as any).eq('id', character.id);
    if (!result.error) return;

    // Backward compatibility: if columns aren't applied yet, store only url (or nothing)
    const message = result.error.message || '';
    const looksLikeMissingColumns =
      message.includes('avatar_') || message.includes('column') || message.includes('schema');
    if (!looksLikeMissingColumns) throw result.error;

    const legacy = await supabase.from('characters').update({ avatar_url: avatarUrl } as any).eq('id', character.id);
    if (legacy.error) {
      // ignore; shared assets + local cache already written
    }
  };

  const handleSave = async () => {
    if (!editable) return;
    if (!sourceUrl) {
      toast({ title: '画像を選択してください', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const cropped = await buildCroppedAvatar(sourceUrl);
      const uploadedUrl = await uploadFile(cropped, `avatars/${character.id}`);
      if (!uploadedUrl) throw new Error('upload');
      await saveToDb(uploadedUrl);
      toast({ title: 'アイコンを保存しました' });
      onUpdated();
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      toast({ title: '保存に失敗しました', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!editable) return;
    setSaving(true);
    try {
      const result = await supabase
        .from('characters')
        .update({ avatar_url: null, avatar_scale: 1, avatar_offset_x: 0, avatar_offset_y: 0 } as any)
        .eq('id', character.id);
      if (result.error) {
        const legacy = await supabase.from('characters').update({ avatar_url: null } as any).eq('id', character.id);
        // ignore legacy errors; we still delete shared assets + local
        void legacy;
      }
      await supabase
        .from('assets')
        .delete()
        .eq('character_id', character.id)
        .eq('kind', 'portrait')
        .eq('tag', '__avatar__');
      clearCharacterAvatar(character.id);
      toast({ title: 'アイコンを削除しました' });
      onUpdated();
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      toast({ title: '削除に失敗しました', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{character.name} - アイコン設定</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={!editable}>
              <Upload className="w-4 h-4 mr-2" />
              画像を選択
            </Button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            <Button type="button" variant="ghost" className="text-destructive" onClick={handleRemove} disabled={!editable}>
              <Trash2 className="w-4 h-4 mr-2" />
              削除
            </Button>
          </div>

          <div className="flex justify-center">
            <div
              className="relative rounded-lg border border-border bg-secondary/30 overflow-hidden"
              style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE }}
              onMouseDown={(e) => {
                if (!editable) return;
                if (!sourceUrl) return;
                dragRef.current = { startX: e.clientX, startY: e.clientY, startOffsetX: offsetX, startOffsetY: offsetY };
              }}
              onMouseMove={(e) => {
                const st = dragRef.current;
                if (!st) return;
                const dx = e.clientX - st.startX;
                const dy = e.clientY - st.startY;
                const next = clampOffsets(st.startOffsetX + dx, st.startOffsetY + dy, scale);
                setOffsetX(next.x);
                setOffsetY(next.y);
              }}
              onMouseUp={() => {
                dragRef.current = null;
              }}
              onMouseLeave={() => {
                dragRef.current = null;
              }}
            >
              <div className="absolute inset-0 pointer-events-none opacity-40" style={{
                backgroundImage:
                  'linear-gradient(to right, rgba(255,255,255,0.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.12) 1px, transparent 1px)',
                backgroundSize: '20px 20px',
              }} />
              {sourceUrl ? (
                <img
                  src={sourceUrl}
                  alt="avatar"
                  className="absolute left-1/2 top-1/2 select-none"
                  style={{
                    transform: `translate(-50%, -50%) ${previewTransform}`,
                    transformOrigin: 'center',
                    maxWidth: 'none',
                    maxHeight: 'none',
                    width: imgMeta ? `${imgMeta.w * imgMeta.baseScale}px` : undefined,
                    height: imgMeta ? `${imgMeta.h * imgMeta.baseScale}px` : undefined,
                  }}
                  draggable={false}
                />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground">
                  画像を選択してください
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="space-y-2">
              <Label>拡大率</Label>
              <div className="flex items-center gap-3">
                <Slider
                  value={[scale]}
                  min={0.5}
                  max={3}
                  step={0.01}
                  onValueChange={(v) => {
                    const nextScale = clamp(v[0] ?? 1, 0.5, 3);
                    setScale(nextScale);
                    const next = clampOffsets(offsetX, offsetY, nextScale);
                    setOffsetX(next.x);
                    setOffsetY(next.y);
                  }}
                  disabled={!editable}
                />
                <div className="w-20">
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.05"
                    value={String(scale)}
                    onChange={(e) => {
                      const nextScale = clamp(Number.parseFloat(e.target.value) || 1, 0.5, 3);
                      setScale(nextScale);
                      const next = clampOffsets(offsetX, offsetY, nextScale);
                      setOffsetX(next.x);
                      setOffsetY(next.y);
                    }}
                    disabled={!editable}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">画像をドラッグして位置調整できます</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Xずれ(px)</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={String(offsetX)}
                  onChange={(e) => {
                    const nextX = Number.parseInt(e.target.value || '0', 10) || 0;
                    const next = clampOffsets(nextX, offsetY, scale);
                    setOffsetX(next.x);
                    setOffsetY(next.y);
                  }}
                  disabled={!editable}
                />
              </div>
              <div className="space-y-1">
                <Label>Yずれ(px)</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={String(offsetY)}
                  onChange={(e) => {
                    const nextY = Number.parseInt(e.target.value || '0', 10) || 0;
                    const next = clampOffsets(offsetX, nextY, scale);
                    setOffsetX(next.x);
                    setOffsetY(next.y);
                  }}
                  disabled={!editable}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              閉じる
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving || !editable}>
              {saving ? '保存中...' : '保存'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
