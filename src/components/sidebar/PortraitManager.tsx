import { useEffect, useState, useRef, useCallback } from 'react';
import { Plus, Trash2, GripVertical, Upload, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { uploadFile } from '@/lib/upload';
import { getPortraitTransform, setPortraitTransform } from '@/lib/portraitTransforms';
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
  scale: number;
  offsetX: number;
  offsetY: number;
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
      setVariants(
        data.map((a: any) => ({
          id: a.id,
          displayName: a.label,
          tag: a.tag || '',
          url: a.url,
          isDefault: a.is_default || false,
          scale: (() => {
            if (typeof a.scale === 'number') return a.scale;
            const t = getPortraitTransform(characterId, a.tag || a.label);
            return t?.scale ?? 1;
          })(),
          offsetX: (() => {
            if (typeof a.offset_x === 'number') return a.offset_x;
            const t = getPortraitTransform(characterId, a.tag || a.label);
            return t?.offsetX ?? 0;
          })(),
          offsetY: (() => {
            if (typeof a.offset_y === 'number') return a.offset_y;
            const t = getPortraitTransform(characterId, a.tag || a.label);
            return t?.offsetY ?? 0;
          })(),
        }))
      );
    }
    setLoading(false);
  }, [characterId]);

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
        scale: 1,
        offsetX: 0,
        offsetY: 0,
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
        scale: 1,
        offsetX: 0,
        offsetY: 0,
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
          scale: Number.isFinite(variant.scale) ? variant.scale : 1,
          offset_x: Number.isFinite(variant.offsetX) ? Math.trunc(variant.offsetX) : 0,
          offset_y: Number.isFinite(variant.offsetY) ? Math.trunc(variant.offsetY) : 0,
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
          message.includes('scale') || message.includes('offset_x') || message.includes('offset_y');

        if (!looksLikeMissingColumns) throw insertWithTransforms.error;

        const legacyRows = resolved.map(({ scale, offset_x, offset_y, ...rest }) => rest);
        const legacyInsert = await supabase.from('assets').insert(legacyRows);
        if (legacyInsert.error) throw legacyInsert.error;
      }

      // Persist transforms locally (fallback when DB columns are missing)
      for (const v of normalizedVariants) {
        const keys = new Set<string>();
        if (v.tag.trim()) keys.add(v.tag);
        if (v.displayName.trim()) keys.add(v.displayName);
        for (const key of keys) {
          setPortraitTransform(characterId, key, { scale: v.scale, offsetX: v.offsetX, offsetY: v.offsetY });
        }
      }

      // Delete old assets after successful insert
      if (existingIds.length > 0) {
        const { error: deleteError } = await supabase.from('assets').delete().in('id', existingIds);
        if (deleteError) throw deleteError;
      }

      toast({ title: '立ち絵を保存しました' });
      onUpdate();
      onOpenChange(false);
    } catch (error) {
      console.error('Save error:', error);
      toast({ title: '保存に失敗しました', variant: 'destructive' });
    }

    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{characterName} - 立ち絵管理</DialogTitle>
        </DialogHeader>

        <div
          className="flex-1 min-h-0 flex flex-col"
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
          <ScrollArea className="flex-1">
            <div className="space-y-3">
              {variants.map((variant, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 p-3 bg-secondary rounded-lg"
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
                    <div>
                      <Label className="text-xs">倍率</Label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.05"
                        value={String(variant.scale)}
                        onChange={(e) => updateVariant(index, { scale: Number.parseFloat(e.target.value) || 1 })}
                        className="h-8"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Xずれ(px)</Label>
                        <Input
                          type="number"
                          inputMode="numeric"
                          step="1"
                          value={String(variant.offsetX)}
                          onChange={(e) => updateVariant(index, { offsetX: Number.parseInt(e.target.value || '0', 10) || 0 })}
                          className="h-8"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Yずれ(px)</Label>
                        <Input
                          type="number"
                          inputMode="numeric"
                          step="1"
                          value={String(variant.offsetY)}
                          onChange={(e) => updateVariant(index, { offsetY: Number.parseInt(e.target.value || '0', 10) || 0 })}
                          className="h-8"
                        />
                      </div>
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
