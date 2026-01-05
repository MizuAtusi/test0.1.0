import { useState, useCallback } from 'react';
import { Send, Dice6, MessageSquare, Eye, ScrollText, Copy } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
  roomId?: string;
  showGmOption?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  layout?: 'single' | 'stacked';
  onSendMessage: (
    type: 'speech' | 'mono' | 'system' | 'dice',
    text: string,
    options?: { dicePayload?: any; expressionTags?: string[]; portraitOnly?: boolean; blindDice?: boolean }
  ) => void;
  characters?: Character[];
  currentCharacter?: Character | null;
}

type MessageMode = 'speech' | 'mono';

export function InputBar({ 
  participantName,
  speakerValue,
  onSpeakerValueChange,
  roomId,
  showGmOption = false,
  disabled = false,
  disabledReason,
  layout = 'single',
  onSendMessage, 
  characters = [],
  currentCharacter,
}: InputBarProps) {
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<MessageMode>('speech');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteBlind, setPaletteBlind] = useState(false);

  // NOTE: do not memoize by object reference; some character updates may keep references stable.
  // Computing these on each render keeps the chat palette always in sync with edited skills/stats.
  const diceSkills = (() => {
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
        (currentCharacter.skills as any)?.格闘 ??
        (currentCharacter.skills as any)?.['こぶし（パンチ）'] ??
        (currentCharacter.skills as any)?.['こぶし'] ??
        50,
    };
    return { ...baseSkills, ...derivedSkills };
  })();

  const paletteCharacter = (() => {
    if (!currentCharacter) return null;
    const existing = (currentCharacter as any).skill_points;
    if (existing && typeof existing === 'object') return currentCharacter;
    if (!roomId) return currentCharacter;
    try {
      const raw = localStorage.getItem(`trpg:characterSkillPoints:${roomId}:${currentCharacter.id}`);
      if (!raw) return currentCharacter;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return currentCharacter;
      return { ...currentCharacter, skill_points: parsed };
    } catch {
      return currentCharacter;
    }
  })();

  const paletteEntries = paletteCharacter ? buildPaletteEntries(paletteCharacter as any) : [];
  const paletteText = currentCharacter ? buildPaletteTextIacharaStyle(currentCharacter) : '';

  const speakerDisplay = (() => {
    if (speakerValue === 'gm') return { name: 'GM', role: '権限' };
    if (speakerValue === 'participant') return { name: participantName, role: '参加者' };
    const c = characters.find((x) => x.id === speakerValue) ?? null;
    return { name: c?.name || participantName, role: c?.is_npc ? 'NPC' : 'PC' };
  })();

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    
    const { tags, text } = parseExpressionTags(input);
    const isBlindTag = tags.includes('blindd');
    const filteredTags = tags.filter((t) => t !== 'blindd');
    const trimmed = text.trim();
    if (!trimmed && filteredTags.length === 0) return;
    if (!trimmed && filteredTags.length > 0) {
      onSendMessage(mode, '', { expressionTags: filteredTags, portraitOnly: true });
      setInput('');
      return;
    }

    // Check if it's a dice command
    const diceResult = parseDiceCommand(trimmed, diceSkills);
    
    if (diceResult) {
      const formattedText = formatDiceResult(diceResult);
      const blind = isBlindTag;
      if (blind) (diceResult as any).blind = true;
      onSendMessage('dice', formattedText, { dicePayload: diceResult, expressionTags: filteredTags, blindDice: blind });
    } else {
      onSendMessage(mode, trimmed, { expressionTags: filteredTags });
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
      <form
        onSubmit={handleSubmit}
        className={`p-3 bg-card border-t border-border ${layout === 'stacked' ? 'grid gap-2' : 'flex items-center gap-2'}`}
        style={layout === 'stacked' ? { gridTemplateRows: 'auto auto' } : undefined}
      >
        <div
          className={`flex items-center gap-2 ${
            layout === 'stacked' ? 'overflow-x-auto overflow-y-hidden -mx-1 px-1' : ''
          }`}
        >
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
              {/* Use div (not span) to avoid SelectTrigger's [&>span]:line-clamp-1 breaking flex layout */}
              <div className="flex w-full items-center gap-2 pr-6">
                <div className="min-w-0 flex-1 truncate text-left">{speakerDisplay.name}</div>
                <div className="shrink-0 text-xs text-muted-foreground text-right">{speakerDisplay.role}</div>
              </div>
            </SelectTrigger>
            <SelectContent>
              {showGmOption && (
                <SelectItem value="gm" textValue="GM 権限">
                  <span className="flex w-full items-center gap-3">
                    <span className="min-w-0 flex-1 truncate">GM</span>
                    <span className="ml-auto text-xs text-muted-foreground shrink-0">権限</span>
                  </span>
                </SelectItem>
              )}
              <SelectItem value="participant" textValue={`${participantName} 参加者`}>
                <span className="flex w-full items-center gap-3">
                  <span className="min-w-0 flex-1 truncate">{participantName}</span>
                  <span className="ml-auto text-xs text-muted-foreground shrink-0">参加者</span>
                </span>
              </SelectItem>
              {characters.map((c) => (
                <SelectItem key={c.id} value={c.id} textValue={`${c.name} ${c.is_npc ? 'NPC' : 'PC'}`}>
                  <span className="flex w-full items-center gap-3">
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground shrink-0">{c.is_npc ? 'NPC' : 'PC'}</span>
                  </span>
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
        </div>

        <div className={`flex items-center gap-2 ${layout === 'stacked' ? '' : 'flex-1'}`}>
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
            {input.toLowerCase().match(/^\d+d\\d+/) && (
              <Dice6 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-accent animate-pulse" />
            )}
          </div>

          {/* Send Button */}
          <Button type="submit" size="icon" className="bg-primary hover:bg-primary/80" disabled={disabled}>
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </form>

    <Dialog open={paletteOpen} onOpenChange={setPaletteOpen}>
      <DialogContent className="max-w-xl h-[70vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <span>チャットパレット</span>
              <label className="flex items-center gap-2 text-xs font-normal text-muted-foreground select-none">
                <Checkbox checked={paletteBlind} onCheckedChange={(v) => setPaletteBlind(!!v)} />
                非表示
              </label>
            </div>
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
                      if (!dice.skillName && e.label) dice.skillName = e.label;
                      if (paletteBlind) (dice as any).blind = true;
                      const formattedText = formatDiceResult(dice);
                      onSendMessage('dice', formattedText, { dicePayload: dice, blindDice: paletteBlind });
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
