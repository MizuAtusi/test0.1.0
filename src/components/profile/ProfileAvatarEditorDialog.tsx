import { useEffect, useMemo, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/hooks/use-toast';

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

export function ProfileAvatarEditorDialog({
  open,
  onOpenChange,
  currentUrl,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUrl: string | null;
  onConfirm: (file: File) => void;
}) {
  const { toast } = useToast();
  const [sourceUrl, setSourceUrl] = useState<string>('');
  const [scale, setScale] = useState<number>(1);
  const [offsetX, setOffsetX] = useState<number>(0);
  const [offsetY, setOffsetY] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [imgMeta, setImgMeta] = useState<{ w: number; h: number; baseScale: number } | null>(null);
  const [localObjectUrl, setLocalObjectUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; startOffsetX: number; startOffsetY: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    setSourceUrl(currentUrl || '');
    setScale(1);
    setOffsetX(0);
    setOffsetY(0);
  }, [open, currentUrl]);

  useEffect(() => {
    if (open) return;
    if (localObjectUrl) {
      URL.revokeObjectURL(localObjectUrl);
      setLocalObjectUrl(null);
    }
  }, [open, localObjectUrl]);

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
    if (localObjectUrl) {
      URL.revokeObjectURL(localObjectUrl);
    }
    const url = URL.createObjectURL(f);
    setSourceUrl(url);
    setLocalObjectUrl(url);
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
    return new File([blob], 'profile-avatar.png', { type: 'image/png' });
  };

  const handleSave = async () => {
    if (!sourceUrl) {
      toast({ title: '画像を選択してください', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const cropped = await buildCroppedAvatar(sourceUrl);
      onConfirm(cropped);
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      toast({ title: '保存に失敗しました', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>プロフィール画像を設定</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
              <Upload className="w-4 h-4 mr-2" />
              画像を選択
            </Button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          </div>

          <div className="flex justify-center">
            <div
              className="relative rounded-lg border border-border bg-secondary/30 overflow-hidden"
              style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE }}
              onMouseDown={(e) => {
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
              <div
                className="absolute inset-0 pointer-events-none opacity-40"
                style={{
                  backgroundImage:
                    'linear-gradient(to right, rgba(255,255,255,0.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.12) 1px, transparent 1px)',
                  backgroundSize: '20px 20px',
                }}
              />
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
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              閉じる
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
