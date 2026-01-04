import { useMemo, useState, useCallback } from 'react';
import { Send, Dice6, MessageSquare, Eye, ScrollText, Copy } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { parseDiceCommand, formatDiceResult } from '@/lib/dice';
import { parseExpressionTags } from '@/lib/expressionTag';
import { buildPaletteEntries, buildPaletteTextIacharaStyle } from '@/lib/coc6';
import type { Character } from '@/types/trpg';

interface InputBarProps {
  participantName: string;
  speakerValue: string; // 'participant' | characterId
  onSpeakerValueChange: (value: string) => void;
  showGmOption?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  onSendMessage: (
    type: 'speech' | 'mono' | 'system' | 'dice',
    text: string,
    options?: { dicePayload?: any; expressionTags?: string[]; portraitOnly?: boolean }
  ) => void;
  characters?: Character[];
  currentCharacter?: Character | null;
}

type MessageMode = 'speech' | 'mono';

export function InputBar({ 
  participantName,
  speakerValue,
  onSpeakerValueChange,
  showGmOption = false,
  disabled = false,
  disabledReason,
  onSendMessage, 
  characters = [],
  currentCharacter,
}: InputBarProps) {
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<MessageMode>('speech');
  const [paletteOpen, setPaletteOpen] = useState(false);

  const diceSkills = useMemo(() => {
    if (!currentCharacter) return {};
    const baseSkills = currentCharacter.skills || {};
    const derivedSkills = {
      SAN: currentCharacter.derived?.SAN ?? currentCharacter.stats.POW * 5,
      アイデア: currentCharacter.stats.INT * 5,
      幸運: currentCharacter.stats.POW * 5,
      知識: currentCharacter.stats.EDU * 5,
      母国語: currentCharacter.stats.EDU * 5,
      回避: currentCharacter.skills?.回避 ?? currentCharacter.stats.DEX * 2,
      格闘:
        currentCharacter.skills?.格闘 ??
        (currentCharacter.skills as any)?.['こぶし（パンチ）'] ??
        (currentCharacter.skills as any)?.['こぶし'] ??
        50,
    };
    return { ...baseSkills, ...derivedSkills };
  }, [currentCharacter]);

  const paletteEntries = useMemo(() => {
    if (!currentCharacter) return [];
    return buildPaletteEntries(currentCharacter);
  }, [currentCharacter]);

  const paletteText = useMemo(() => {
    if (!currentCharacter) return '';
    return buildPaletteTextIacharaStyle(currentCharacter);
  }, [currentCharacter]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    
    const { tags, text } = parseExpressionTags(input);
    const trimmed = text.trim();
    if (!trimmed && tags.length === 0) return;
    if (!trimmed && tags.length > 0) {
      onSendMessage(mode, '', { expressionTags: tags, portraitOnly: true });
      setInput('');
      return;
    }

    // Check if it's a dice command
    const diceResult = parseDiceCommand(trimmed, diceSkills);
    
    if (diceResult) {
      const formattedText = formatDiceResult(diceResult);
      onSendMessage('dice', formattedText, { dicePayload: diceResult, expressionTags: tags });
    } else {
      onSendMessage(mode, trimmed, { expressionTags: tags });
    }
    
    setInput('');
  }, [input, mode, onSendMessage, diceSkills]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="flex items-center gap-2 p-3 bg-card border-t border-border">
      {/* Message Type Selector */}
      <Select value={mode} onValueChange={(v) => setMode(v as MessageMode)}>
        <SelectTrigger className="w-[120px] bg-secondary border-border">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="speech">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              セリフ
            </div>
          </SelectItem>
          <SelectItem value="mono">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4" />
              心情
            </div>
          </SelectItem>
        </SelectContent>
      </Select>

      {/* Speaker Selector */}
      <Select value={speakerValue} onValueChange={onSpeakerValueChange}>
        <SelectTrigger className="w-[160px] bg-secondary border-border">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {showGmOption && (
            <SelectItem value="gm">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">GM</span>
                <span className="text-xs text-muted-foreground shrink-0">権限</span>
              </div>
            </SelectItem>
          )}
          <SelectItem value="participant">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate">{participantName}</span>
              <span className="text-xs text-muted-foreground shrink-0">参加者</span>
            </div>
          </SelectItem>
          {characters.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">{c.name}</span>
                <span className="text-xs text-muted-foreground shrink-0">{c.is_npc ? 'NPC' : 'PC'}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Chat Palette */}
      <Button
        type="button"
        variant="outline"
        className="shrink-0"
        disabled={!currentCharacter || disabled}
        onClick={() => setPaletteOpen(true)}
        title={currentCharacter ? 'チャットパレット' : 'キャラクターを選択してください'}
      >
        <ScrollText className="w-4 h-4 mr-2" />
        パレット
      </Button>

      {/* Input Field */}
      <div className="flex-1 relative">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? (disabledReason || '入力できません') : 'Ctrl+Enterで送信'}
          className="bg-input border-border pr-10 text-foreground placeholder:text-muted-foreground"
          disabled={disabled}
        />
        {input.toLowerCase().match(/^\d+d\d+/) && (
          <Dice6 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-accent animate-pulse" />
        )}
      </div>

      {/* Send Button */}
      <Button type="submit" size="icon" className="bg-primary hover:bg-primary/80" disabled={disabled}>
        <Send className="w-4 h-4" />
      </Button>
    </form>

    <Dialog open={paletteOpen} onOpenChange={setPaletteOpen}>
      <DialogContent className="max-w-xl h-[70vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2">
            <span>チャットパレット</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!paletteText}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(paletteText);
                } catch {
                  // ignore
                }
              }}
              title="いあきゃら風のテキストをコピー"
            >
              <Copy className="w-4 h-4 mr-2" />
              コピー
            </Button>
          </DialogTitle>
        </DialogHeader>

        {!currentCharacter ? (
          <div className="text-sm text-muted-foreground">キャラクターを選択してください。</div>
        ) : (
          <ScrollArea className="flex-1 min-h-0">
            <div className="space-y-2">
              {paletteEntries.map((e) => (
                <button
                  key={`${e.label}:${e.command}`}
                  type="button"
                  className="w-full text-left rounded-md border border-border bg-secondary/30 hover:bg-secondary/50 px-3 py-2"
                  onClick={() => {
                    // Roll immediately (cocoforia-like)
                    const dice = parseDiceCommand(e.command, diceSkills);
                    if (dice) {
                      const formattedText = formatDiceResult(dice);
                      onSendMessage('dice', formattedText, { dicePayload: dice });
                    } else {
                      setInput(e.command);
                    }
                    setPaletteOpen(false);
                  }}
                  title={e.command}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{e.label}</span>
                    <span className="text-xs text-muted-foreground font-mono">{e.command}</span>
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}
