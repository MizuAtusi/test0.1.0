import { useEffect, useMemo, useState } from 'react';
import { Dice6 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { CharacterDerived, CharacterStats } from '@/types/trpg';
import { buildDefaultSkills, buildDerivedFromStats, buildSkillPointBreakdownFromTotals, normalizeSkillNameCoc6 } from '@/lib/coc6';

interface CharacterCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomId: string;
  participantId?: string;
  isGM: boolean;
  onCreated: () => void;
}

export function CharacterCreateDialog({
  open,
  onOpenChange,
  roomId,
  participantId,
  isGM,
  onCreated,
}: CharacterCreateDialogProps) {
  const [name, setName] = useState('');
  const [isNpc, setIsNpc] = useState(false);
  const [importText, setImportText] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const [stats, setStats] = useState<CharacterStats>({
    STR: 10,
    CON: 10,
    POW: 10,
    DEX: 10,
    APP: 10,
    SIZ: 10,
    INT: 10,
    EDU: 10,
  });
  const [rollCounts, setRollCounts] = useState<Record<keyof CharacterStats | 'ALL', number>>({
    STR: 0,
    CON: 0,
    POW: 0,
    DEX: 0,
    APP: 0,
    SIZ: 0,
    INT: 0,
    EDU: 0,
    ALL: 0,
  });

  const rollDie = (sides: number) => Math.floor(Math.random() * sides) + 1;
  const roll3d6 = () => rollDie(6) + rollDie(6) + rollDie(6);
  const roll2d6Plus6 = () => rollDie(6) + rollDie(6) + 6;

  const rollStat = (key: keyof CharacterStats) => {
    const value = key === 'SIZ' || key === 'INT' ? roll2d6Plus6() : roll3d6();
    setStats(prev => ({ ...prev, [key]: value }));
    setRollCounts(prev => ({ ...prev, [key]: (prev[key] ?? 0) + 1 }));
  };

  const rollAllStats = () => {
    const next: CharacterStats = {
      STR: roll3d6(),
      CON: roll3d6(),
      POW: roll3d6(),
      DEX: roll3d6(),
      APP: roll3d6(),
      SIZ: roll2d6Plus6(),
      INT: roll2d6Plus6(),
      EDU: roll3d6(),
    };
    setStats(next);
    setRollCounts(prev => ({ ...prev, ALL: (prev.ALL ?? 0) + 1 }));
  };

  const computeDamageBonus = (str: number, siz: number): string => {
    const sum = str + siz;
    if (sum <= 12) return '-1d6';
    if (sum <= 16) return '-1d4';
    if (sum <= 24) return '0';
    if (sum <= 32) return '+1d4';
    if (sum <= 40) return '+1d6';
    return '+2d6';
  };

  const parseIacharaChatPalette = (raw: string) => {
    const lines = raw
      .split(/\r?\n/g)
      .map((l) => l.trim())
      .filter(Boolean);

    const parsedStats: Partial<CharacterStats> = {};
    const parsedSkills: Record<string, number> = {};

    const normalizeSkillName = (s: string) => normalizeSkillNameCoc6(s);

    const setStat = (key: keyof CharacterStats, value: number) => {
      if (!Number.isFinite(value)) return;
      parsedStats[key] = Math.max(0, Math.min(99, Math.trunc(value)));
    };

    const parseThreshold = (thresholdRaw: string): number | null => {
      const t = String(thresholdRaw ?? '').trim();
      if (!t) return null;
      const mMul = t.match(/^(\d+)\s*\*\s*5$/i);
      if (mMul) return Number.parseInt(mMul[1], 10);
      const mNum = t.match(/^(\d+)$/);
      if (mNum) return Number.parseInt(mNum[1], 10);
      const mVar = t.match(/^\{([^}]+)\}$/);
      if (mVar) {
        const v = String(mVar[1] ?? '').trim();
        // Resolve a few known variables from already parsed stats/skills
        if (/^(STR|CON|POW|DEX|APP|SIZ|INT|EDU)$/i.test(v)) {
          const key = v.toUpperCase() as keyof CharacterStats;
          const n = parsedStats[key];
          if (typeof n === 'number') return n * 5;
          return null;
        }
        if (v.toUpperCase() === 'SAN') {
          const pow = parsedStats.POW;
          if (typeof pow === 'number') return pow * 5;
          return null;
        }
        const normalized = normalizeSkillName(v);
        if (normalized && typeof parsedSkills[normalized] === 'number') return parsedSkills[normalized];
        return null;
      }
      return null;
    };

    for (const line of lines) {
      // Example:
      // - CCB<=65 【アイデア】
      // - CC<=15 威圧
      const m =
        line.match(/^(?:CCB|CC)\s*<=\s*([^\s]+)\s*【([^】]+)】/i) ||
        line.match(/^(?:CCB|CC)\s*<=\s*([^\s]+)\s+(.+)$/i);
      if (!m) continue;

      const thresholdRaw = m[1];
      const label = String(m[2] ?? '').trim();
      if (!label) continue;

      const threshold = parseThreshold(thresholdRaw);
      if (threshold === null) continue;

      // Stats x5 lines (either "13*5" or already 65)
      const statX5 = label.match(/\b(STR|CON|POW|DEX|APP|SIZ|INT|EDU)\b/i);
      const looksLikeX5 = /(\*|×)\s*5/.test(label) || /\b\d+\s*\*\s*5\b/i.test(thresholdRaw);
      if (statX5 && looksLikeX5) {
        const key = statX5[1].toUpperCase() as keyof CharacterStats;
        // If input was 65, convert to 13; if input was 13*5, parseThreshold already returned 13.
        const value = /\b\d+\s*\*\s*5\b/i.test(thresholdRaw) ? threshold : Math.floor(threshold / 5);
        setStat(key, value);
        continue;
      }

      // Keep アイデア/幸運/知識 as skills (CoC6 chat palette often includes them)

      // Ignore obvious non-skill entries
      if (label.includes('ダメージ') || label.includes('判定') || label.includes('ロール')) {
        continue;
      }

      const skillName = normalizeSkillName(label);
      if (!skillName) continue;
      parsedSkills[skillName] = threshold;
    }

    const resolvedStats: CharacterStats = {
      STR: parsedStats.STR ?? 10,
      CON: parsedStats.CON ?? 10,
      POW: parsedStats.POW ?? 10,
      DEX: parsedStats.DEX ?? 10,
      APP: parsedStats.APP ?? 10,
      SIZ: parsedStats.SIZ ?? 10,
      INT: parsedStats.INT ?? 10,
      EDU: parsedStats.EDU ?? 10,
    };

    const resolvedDerived: CharacterDerived = buildDerivedFromStats(resolvedStats);
    const defaultSkills = buildDefaultSkills(resolvedStats);
    return { stats: resolvedStats, derived: resolvedDerived, skills: { ...defaultSkills, ...parsedSkills } };
  };

  const derived: CharacterDerived = useMemo(() => {
    return {
      HP: Math.floor((stats.CON + stats.SIZ) / 2),
      MP: stats.POW,
      SAN: stats.POW * 5,
      DB: computeDamageBonus(stats.STR, stats.SIZ),
    };
  }, [stats]);

  // Reset draft when dialog opens
  useEffect(() => {
    if (!open) return;
    setName('');
    setIsNpc(false);
    setImportText('');
    setLoading(false);
    setStats({
      STR: 10,
      CON: 10,
      POW: 10,
      DEX: 10,
      APP: 10,
      SIZ: 10,
      INT: 10,
      EDU: 10,
    });
    setRollCounts({
      STR: 0,
      CON: 0,
      POW: 0,
      DEX: 0,
      APP: 0,
      SIZ: 0,
      INT: 0,
      EDU: 0,
      ALL: 0,
    });
  }, [open]);

  const handleCreate = async () => {
    if (!name.trim()) {
      toast({ title: 'キャラクター名を入力してください', variant: 'destructive' });
      return;
    }

    setLoading(true);

    const basePayload: any = {
      room_id: roomId,
      // Ownership is used for edit permissions; NPCs are owned by the creator too.
      owner_participant_id: participantId,
      name: name.trim(),
      is_npc: isNpc,
      stats,
      derived,
      skills: buildDefaultSkills(stats),
    };

    let data: any = null;
    let error: any = null;
    const withSkillPoints = await supabase
      .from('characters')
      .insert({ ...basePayload, skill_points: { occupation: {}, interest: {}, other: {} } } as any)
      .select('id')
      .single();
    data = withSkillPoints.data;
    error = withSkillPoints.error;

    // Backward compatibility: if DB doesn't have skill_points yet, retry without it.
    if (error) {
      const msg = String(error?.message || '');
      const looksLikeMissingSkillPoints =
        msg.includes('skill_points') && (msg.includes('column') || msg.includes('schema') || msg.includes('does not exist'));
      if (looksLikeMissingSkillPoints) {
        const withoutSkillPoints = await supabase.from('characters').insert(basePayload).select('id').single();
        data = withoutSkillPoints.data;
        error = withoutSkillPoints.error;
      }
    }

    setLoading(false);

    if (error) {
      console.error('Character create error:', error);
      toast({ title: `作成に失敗しました: ${String(error.message || error)}`, variant: 'destructive' });
      return;
    }

    // Create default disclosure settings for NPCs (hidden by default)
    if (isNpc && data?.id) {
      try {
        await supabase.from('npc_disclosures').insert({
          room_id: roomId,
          character_id: data.id,
          show_stats: false,
          show_derived: false,
          show_skills: false,
          show_memo: false,
        } as any);
      } catch {
        // ignore (table might not exist yet)
      }
    }

    toast({ title: 'キャラクターを作成しました' });
    onOpenChange(false);
    onCreated();
  };

  const handleImport = async () => {
    if (!importText.trim()) {
      toast({ title: 'インポートデータを入力してください', variant: 'destructive' });
      return;
    }

    setLoading(true);

    try {
      let charName = name.trim() || '名無し';
      let stats: CharacterStats;
      let derived: CharacterDerived;
      let skills: Record<string, number> = {};
      let memo = '';
      let skillPoints: any = { occupation: {}, interest: {}, other: {} };

      // Try to parse as JSON (iachara format)
      try {
        const data = JSON.parse(importText);

        // Cocoforia command export (charaeno/iachara)
        const cocoforia = data?.kind === 'character' && data?.data && typeof data.data === 'object';
        if (cocoforia) {
          const d = data.data;
          charName = (d.name || charName) as string;

          const params: Array<{ label: string; value: string | number }> = Array.isArray(d.params) ? d.params : [];
          const status: Array<{ label: string; value: number; max?: number }> = Array.isArray(d.status) ? d.status : [];
          const getParam = (label: string) => {
            const row = params.find((p) => String(p.label).trim() === label);
            const n = row ? Number.parseInt(String(row.value ?? '0'), 10) : NaN;
            return Number.isFinite(n) ? n : null;
          };
          const getStatus = (label: string) => {
            const row = status.find((s: any) => String(s.label).trim() === label);
            const n = row ? Number(row.value ?? 0) : NaN;
            return Number.isFinite(n) ? n : null;
          };
          const getStatusMax = (label: string) => {
            const row = status.find((s: any) => String(s.label).trim() === label);
            const n = row ? Number((row as any).max ?? 0) : NaN;
            return Number.isFinite(n) ? n : null;
          };

          stats = {
            STR: getParam('STR') ?? 10,
            CON: getParam('CON') ?? 10,
            POW: getParam('POW') ?? 10,
            DEX: getParam('DEX') ?? 10,
            APP: getParam('APP') ?? 10,
            SIZ: getParam('SIZ') ?? 10,
            INT: getParam('INT') ?? 10,
            EDU: getParam('EDU') ?? 10,
          };

          const hp = getStatus('HP') ?? Math.floor((stats.CON + stats.SIZ) / 2);
          const mp = getStatus('MP') ?? stats.POW;
          const san = getStatus('SAN') ?? stats.POW * 5;
          const dbText = (() => {
            const row = params.find((p) => String(p.label).trim() === 'DB');
            return row ? String(row.value ?? '') : '';
          })();

          derived = {
            HP: hp,
            MP: mp,
            SAN: san,
            DB: dbText || buildDerivedFromStats(stats).DB,
          };

          const defaults = buildDefaultSkills(stats);
          skills = { ...defaults };

          // Parse commands
          const commandsRaw: string = String(d.commands ?? '');
          const lines = commandsRaw.split(/\r?\n/g).map((l) => l.trim()).filter(Boolean);
          const resolveMacro = (token: string) => {
            const t = String(token || '').trim();
            const m = t.match(/^\{([^}]+)\}$/);
            const inner = m ? String(m[1] || '').trim() : t;
            const up = inner.toUpperCase();
            if (up === 'SAN') return derived.SAN;
            if (up === 'HP') return derived.HP;
            if (up === 'MP') return derived.MP;
            if (up === 'STR') return stats.STR * 5;
            if (up === 'CON') return stats.CON * 5;
            if (up === 'POW') return stats.POW * 5;
            if (up === 'DEX') return stats.DEX * 5;
            if (up === 'APP') return stats.APP * 5;
            if (up === 'SIZ') return stats.SIZ * 5;
            if (up === 'INT') return stats.INT * 5;
            if (up === 'EDU') return stats.EDU * 5;
            const normalized = normalizeSkillNameCoc6(inner);
            const v = skills[normalized];
            if (Number.isFinite(v)) return v;
            return null;
          };

          for (const line of lines) {
            const m =
              line.match(/^(?:CCB|CC)\s*<=\s*([^\s]+)\s*【([^】]+)】/i) ||
              line.match(/^(?:CCB|CC)\s*<=\s*([^\s]+)\s+(.+)$/i);
            if (!m) continue;
            const token = String(m[1] ?? '').trim();
            const labelRaw = String(m[2] ?? '').trim();
            const label = labelRaw.replace(/^【|】$/g, '').trim();
            if (!label) continue;

            // Ignore non-skill rolls / derived checks
            const ignore = new Set([
              '正気度ロール', 'アイデア', '幸運', '知識',
              'STR', 'CON', 'POW', 'DEX', 'APP', 'SIZ', 'INT', 'EDU',
            ]);
            if (ignore.has(label)) continue;
            // Ability x5 lines like "STR×5"
            if (/^(STR|CON|POW|DEX|APP|SIZ|INT|EDU)\s*(?:×|\*)\s*5$/i.test(label)) continue;

            const n = Number.parseInt(token, 10);
            const value = Number.isFinite(n) ? n : resolveMacro(token);
            if (value === null) continue;
            const skillName = normalizeSkillNameCoc6(label);
            if (!skillName) continue;
            const v = Math.max(0, Math.trunc(value));
            // Some exports output 0 as placeholder; don't clobber defaults in that case.
            if (v === 0 && Number.isFinite(defaults[skillName]) && (defaults[skillName] ?? 0) > 0) continue;
            skills[skillName] = v;
          }

          memo = String(d.memo ?? '');
          skillPoints = buildSkillPointBreakdownFromTotals(stats, skills);
        } else {
          // Legacy iachara JSON
          charName = data.name || data.pc_name || charName;
          stats = {
            STR: parseInt(data.STR || data.str || 10),
            CON: parseInt(data.CON || data.con || 10),
            POW: parseInt(data.POW || data.pow || 10),
            DEX: parseInt(data.DEX || data.dex || 10),
            APP: parseInt(data.APP || data.app || 10),
            SIZ: parseInt(data.SIZ || data.siz || 10),
            INT: parseInt(data.INT || data.int || 10),
            EDU: parseInt(data.EDU || data.edu || 10),
          };

          derived = {
            HP: parseInt(data.HP || data.hp || Math.floor((stats.CON + stats.SIZ) / 2)),
            MP: parseInt(data.MP || data.mp || stats.POW),
            SAN: parseInt(data.SAN || data.san || data.現在SAN || stats.POW * 5),
            DB: data.DB || data.db || buildDerivedFromStats(stats).DB,
          };

          // Extract skills
          if (data.skills || data.技能) {
            const skillData = data.skills || data.技能;
            if (typeof skillData === 'object') {
              Object.entries(skillData).forEach(([key, value]) => {
                if (typeof value === 'number') {
                  skills[key] = value;
                }
              });
            }
          }

          memo = data.memo || data.メモ || '';
          const defaults = buildDefaultSkills(stats);
          skills = { ...defaults, ...skills };
          skillPoints = buildSkillPointBreakdownFromTotals(stats, skills);
        }
      } catch {
        // Fallback: parse chat palette output
        const parsed = parseIacharaChatPalette(importText);
        stats = parsed.stats;
        derived = parsed.derived;
        skills = parsed.skills;
        skillPoints = buildSkillPointBreakdownFromTotals(stats, skills);
      }

      const { data: created, error } = await supabase
        .from('characters')
        .insert((() => {
          const payload: any = {
            room_id: roomId,
            // Ownership is used for edit permissions; NPCs are owned by the creator too.
            owner_participant_id: participantId,
            name: charName,
            is_npc: isNpc,
            stats,
            derived,
            skills,
            skill_points: skillPoints,
            memo,
          };
          return payload;
        })())
        .select('id')
        .single();

      if (error) {
        const msg = String((error as any)?.message || '');
        const looksLikeMissingSkillPoints =
          msg.includes('skill_points') && (msg.includes('column') || msg.includes('schema') || msg.includes('does not exist'));
        if (looksLikeMissingSkillPoints) {
          const retry = await supabase
            .from('characters')
            .insert({
              room_id: roomId,
              owner_participant_id: participantId,
              name: charName,
              is_npc: isNpc,
              stats,
              derived,
              skills,
              memo,
            } as any)
            .select('id')
            .single();
          if (retry.error) throw retry.error;
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const createdFallback = retry.data;
        } else {
          throw error;
        }
      }

      if (isNpc && created?.id) {
        try {
          await supabase.from('npc_disclosures').insert({
            room_id: roomId,
            character_id: created.id,
            show_stats: false,
            show_derived: false,
            show_skills: false,
            show_memo: false,
          } as any);
        } catch {
          // ignore
        }
      }

      toast({ title: 'インポートしました' });
      setImportText('');
      setIsNpc(false);
      onOpenChange(false);
      onCreated();
    } catch (e) {
      toast({ title: 'インポートに失敗しました。JSONまたはチャットパレット形式を確認してください。', variant: 'destructive' });
    }

    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">キャラクター作成</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="manual">
          <TabsList className="w-full">
            <TabsTrigger value="manual" className="flex-1">手動作成</TabsTrigger>
            <TabsTrigger value="import" className="flex-1">インポート</TabsTrigger>
          </TabsList>

          <TabsContent value="manual" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="name">キャラクター名</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="キャラクター名を入力"
              />
            </div>

            {isGM && (
              <div className="flex items-center justify-between">
                <Label htmlFor="npc">NPCとして作成</Label>
                <Switch
                  id="npc"
                  checked={isNpc}
                  onCheckedChange={setIsNpc}
                />
              </div>
            )}

            {/* Dice Roll Stats */}
            <TooltipProvider delayDuration={150}>
              <div className="space-y-2 rounded-lg border border-border bg-secondary/30 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">能力値</p>
                    <p className="text-xs text-muted-foreground">手入力 or ダイス（3d6、SIZ/INTは2d6+6）</p>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button type="button" variant="outline" size="sm" onClick={rollAllStats}>
                        <Dice6 className="w-4 h-4 mr-2" />
                        一括ロール
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>一括ロール回数: {rollCounts.ALL}</TooltipContent>
                  </Tooltip>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {(Object.keys(stats) as Array<keyof CharacterStats>).map((key) => (
                    <div key={key} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">{key}</Label>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2"
                              onClick={() => rollStat(key)}
                            >
                              <Dice6 className="w-4 h-4 mr-1" />
                              ロール
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{key} ロール回数: {rollCounts[key]}</TooltipContent>
                        </Tooltip>
                      </div>
                      <Input
                        type="number"
                        inputMode="numeric"
                        value={stats[key]}
                        onChange={(e) => {
                          const value = Number.parseInt(e.target.value || '0', 10) || 0;
                          setStats(prev => ({ ...prev, [key]: Math.max(0, Math.min(99, value)) }));
                        }}
                        className="h-9"
                      />
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-4 gap-2 pt-2 border-t border-border/50">
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground">HP</p>
                    <p className="text-sm font-semibold">{derived.HP}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground">MP</p>
                    <p className="text-sm font-semibold">{derived.MP}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground">SAN</p>
                    <p className="text-sm font-semibold">{derived.SAN}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground">DB</p>
                    <p className="text-sm font-semibold">{derived.DB}</p>
                  </div>
                </div>
              </div>
            </TooltipProvider>

            <Button 
              onClick={handleCreate} 
              disabled={loading} 
              className="w-full"
            >
              作成
            </Button>
          </TabsContent>

          <TabsContent value="import" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>いあきゃら JSON / チャットパレット</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="キャラクター名（任意。チャットパレットのみの場合に使用）"
              />
              <Textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder="キャラクターシートのJSON、またはチャットパレット出力を貼り付け..."
                className="min-h-[200px] font-mono text-xs"
              />
            </div>

            {isGM && (
              <div className="flex items-center justify-between">
                <Label htmlFor="npc-import">NPCとして作成</Label>
                <Switch
                  id="npc-import"
                  checked={isNpc}
                  onCheckedChange={setIsNpc}
                />
              </div>
            )}

            <Button 
              onClick={handleImport} 
              disabled={loading} 
              className="w-full"
            >
              インポート
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
