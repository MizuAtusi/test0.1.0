import { useState, useRef } from 'react';
import { Palette, Upload, RotateCcw, Type, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { uploadFile } from '@/lib/upload';
import { useToast } from '@/hooks/use-toast';
import type { Room, RoomTheme } from '@/types/trpg';

interface ThemeSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  room: Room | null;
  onUpdateRoom: (updates: Partial<Room>) => void;
}

const DEFAULT_THEME: RoomTheme = {
  textWindowBg: undefined,
  textWindowOpacity: 0.95,
  buttonImage: undefined,
  fontFamily: undefined,
  fontSize: 16,
  lineHeight: 1.8,
  padding: 24,
  borderColor: undefined,
  textColor: undefined,
};

export function ThemeSettings({
  open,
  onOpenChange,
  room,
  onUpdateRoom,
}: ThemeSettingsProps) {
  const [theme, setTheme] = useState<RoomTheme>(room?.theme || DEFAULT_THEME);
  const [saving, setSaving] = useState(false);
  const bgFileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const updateTheme = (updates: Partial<RoomTheme>) => {
    setTheme(prev => ({ ...prev, ...updates }));
  };

  const handleBgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = await uploadFile(file, `themes/${room?.id}`);
    if (url) {
      updateTheme({ textWindowBg: url });
    } else {
      toast({ title: 'アップロードに失敗しました', variant: 'destructive' });
    }
  };

  const handleReset = () => {
    setTheme(DEFAULT_THEME);
  };

  const handleSave = async () => {
    setSaving(true);
    await onUpdateRoom({ theme });
    toast({ title: 'テーマを保存しました' });
    setSaving(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette className="w-5 h-5" />
            テーマ設定
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1">
          <div className="space-y-6 p-1">
            {/* Text Window Background */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4" />
                テキストウィンドウ背景
              </Label>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => bgFileRef.current?.click()}
                  className="flex-1"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  画像をアップロード
                </Button>
                {theme.textWindowBg && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => updateTheme({ textWindowBg: undefined })}
                  >
                    <RotateCcw className="w-4 h-4" />
                  </Button>
                )}
              </div>
              <input
                ref={bgFileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleBgUpload}
              />
              {theme.textWindowBg && (
                <div className="h-20 rounded-lg bg-cover bg-center border" 
                  style={{ backgroundImage: `url(${theme.textWindowBg})` }} 
                />
              )}
            </div>

            {/* Opacity */}
            <div className="space-y-2">
              <Label>背景不透明度: {Math.round((theme.textWindowOpacity || 0.95) * 100)}%</Label>
              <Slider
                value={[(theme.textWindowOpacity || 0.95) * 100]}
                onValueChange={([v]) => updateTheme({ textWindowOpacity: v / 100 })}
                min={50}
                max={100}
                step={5}
              />
            </div>

            {/* Font Size */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Type className="w-4 h-4" />
                文字サイズ: {theme.fontSize || 16}px
              </Label>
              <Slider
                value={[theme.fontSize || 16]}
                onValueChange={([v]) => updateTheme({ fontSize: v })}
                min={12}
                max={24}
                step={1}
              />
            </div>

            {/* Line Height */}
            <div className="space-y-2">
              <Label>行間: {theme.lineHeight || 1.8}</Label>
              <Slider
                value={[(theme.lineHeight || 1.8) * 10]}
                onValueChange={([v]) => updateTheme({ lineHeight: v / 10 })}
                min={12}
                max={30}
                step={1}
              />
            </div>

            {/* Padding */}
            <div className="space-y-2">
              <Label>パディング: {theme.padding || 24}px</Label>
              <Slider
                value={[theme.padding || 24]}
                onValueChange={([v]) => updateTheme({ padding: v })}
                min={8}
                max={48}
                step={4}
              />
            </div>

            {/* Text Color */}
            <div className="space-y-2">
              <Label>文字色</Label>
              <Input
                type="color"
                value={theme.textColor || '#e8e4d9'}
                onChange={(e) => updateTheme({ textColor: e.target.value })}
                className="h-10 w-20"
              />
            </div>

            {/* Border Color */}
            <div className="space-y-2">
              <Label>枠色</Label>
              <Input
                type="color"
                value={theme.borderColor || '#7c3aed'}
                onChange={(e) => updateTheme({ borderColor: e.target.value })}
                className="h-10 w-20"
              />
            </div>

            {/* Preview */}
            <div className="space-y-2">
              <Label>プレビュー</Label>
              <div
                className="rounded-lg p-4 border"
                style={{
                  backgroundImage: theme.textWindowBg ? `url(${theme.textWindowBg})` : undefined,
                  backgroundColor: theme.textWindowBg ? undefined : `rgba(0,0,0,${theme.textWindowOpacity || 0.95})`,
                  backgroundSize: 'cover',
                  fontSize: `${theme.fontSize || 16}px`,
                  lineHeight: theme.lineHeight || 1.8,
                  padding: `${theme.padding || 24}px`,
                  color: theme.textColor || '#e8e4d9',
                  borderColor: theme.borderColor || '#7c3aed',
                }}
              >
                <p className="font-bold mb-2">発言者名</p>
                <p>これはテキストのプレビューです。セッション中の発言がこのように表示されます。</p>
              </div>
            </div>
          </div>
        </ScrollArea>

        {/* Actions */}
        <div className="flex justify-between pt-4 border-t">
          <Button variant="ghost" onClick={handleReset}>
            <RotateCcw className="w-4 h-4 mr-2" />
            リセット
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              キャンセル
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
