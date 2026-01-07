import { useState } from 'react';
import { Settings, Book, Download, ScrollText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { exportReplay } from '@/lib/replayExport';
import { getDisplayText } from '@/lib/expressionTag';
import type { Room, Message, StageState, Participant, Character } from '@/types/trpg';

interface StageToolbarProps {
  room: Room | null;
  messages: Message[];
  stageState: StageState | null;
  participants: Participant[];
  participant: Participant | null;
  isGM: boolean;
  canViewSecret?: boolean;
  characters: Character[];
  onUpdateRoom: (updates: Partial<Room>) => void;
}

export function StageToolbar({
  room,
  messages,
  stageState,
  participants,
  participant,
  isGM,
  canViewSecret = false,
  characters,
  onUpdateRoom,
}: StageToolbarProps) {
  const [showHouseRules, setShowHouseRules] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [houseRulesEdit, setHouseRulesEdit] = useState(room?.house_rules || '');
  const [isEditing, setIsEditing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const { toast } = useToast();

  const logMessages = messages.filter((msg) => {
    if (msg.channel === 'chat') return false;
    if (msg.channel !== 'secret') return true;
    if (isGM || canViewSecret) return true;
    if (!participant) return false;
    const allowList = Array.isArray(msg.secret_allow_list) ? msg.secret_allow_list : [];
    return allowList.includes(participant.id);
  });

  const handleSaveHouseRules = async () => {
    await onUpdateRoom({ house_rules: houseRulesEdit });
    setIsEditing(false);
  };

  const handleExportReplay = async () => {
    if (!room) return;
    
    setExporting(true);
    try {
      await exportReplay({
        room,
        messages,
        stageState,
        characters,
        participants,
        participantId: participant?.id,
        isGM,
      });
      toast({ title: 'リプレイをエクスポートしました' });
    } catch (error) {
      console.error('Export error:', error);
      toast({ title: 'エクスポートに失敗しました', variant: 'destructive' });
    }
    setExporting(false);
  };

  return (
    <>
      <div className="flex items-center justify-end gap-1 px-4 py-2 border-b border-border/30">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs opacity-70 hover:opacity-100"
          onClick={() => setShowHouseRules(true)}
        >
          <Book className="w-3 h-3 mr-1" />
          ルール
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs opacity-70 hover:opacity-100"
          onClick={() => setShowLog(true)}
        >
          <ScrollText className="w-3 h-3 mr-1" />
          ログ
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs opacity-70 hover:opacity-100"
          onClick={handleExportReplay}
          disabled={exporting}
        >
          <Download className="w-3 h-3 mr-1" />
          {exporting ? '...' : 'リプレイ'}
        </Button>
      </div>

      {/* House Rules Dialog */}
      <Dialog open={showHouseRules} onOpenChange={setShowHouseRules}>
        <DialogContent className="max-w-lg max-h-[70vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Book className="w-5 h-5" />
              ハウスルール
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1">
            {isEditing ? (
              <Textarea
                value={houseRulesEdit}
                onChange={(e) => setHouseRulesEdit(e.target.value)}
                className="min-h-[200px]"
                placeholder="このセッションのハウスルールを入力..."
              />
            ) : (
              <div className="whitespace-pre-wrap text-sm">
                {room?.house_rules || 'ハウスルールは設定されていません'}
              </div>
            )}
          </ScrollArea>
          {isGM && (
            <div className="flex justify-end gap-2 pt-4 border-t">
              {isEditing ? (
                <>
                  <Button variant="outline" onClick={() => setIsEditing(false)}>キャンセル</Button>
                  <Button onClick={handleSaveHouseRules}>保存</Button>
                </>
              ) : (
                <Button onClick={() => { setHouseRulesEdit(room?.house_rules || ''); setIsEditing(true); }}>
                  編集
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Log Dialog */}
      <Dialog open={showLog} onOpenChange={setShowLog}>
        <DialogContent className="max-w-2xl h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>セッションログ</DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1 min-h-0">
            <div className="space-y-2 text-sm">
              {logMessages.map((msg) => {
                const text = getDisplayText(msg.text);
                if (!text) return null;
                return (
                  <div key={msg.id} className="py-1 border-b border-border/30">
                    <span className="text-muted-foreground text-xs">
                      {new Date(msg.created_at).toLocaleTimeString()}
                    </span>
                    <span className="font-medium ml-2">{msg.speaker_name}:</span>
                    <span className="ml-2 whitespace-pre-wrap">{text}</span>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
