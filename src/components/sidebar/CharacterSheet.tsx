import { useEffect, useMemo, useState } from 'react';
import { Edit2, Save, X, Image as ImageIcon, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import type { Character, CharacterStats, CharacterDerived } from '@/types/trpg';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { PortraitManager } from './PortraitManager';
import {
  buildDefaultSkills,
  buildSkillPointBreakdownFromTotals,
  computeTotalSkills,
  COC6_SKILL_CATEGORIES,
  normalizeSkillNameCoc6,
  type SkillPointBreakdown,
} from '@/lib/coc6';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface CharacterSheetProps {
  character: Character;
  editable: boolean;
  isGM: boolean;
  roomId: string;
  onUpdate: () => void;
  npcDisclosure?: NpcDisclosureSettings;
  onUpdateNpcDisclosure?: (patch: Partial<NpcDisclosureSettings>) => void;
}

export type NpcDisclosureSettings = {
  showStats: boolean;
  showDerived: boolean;
  showSkills: boolean;
  showMemo: boolean;
};

const STAT_LABELS: Record<keyof CharacterStats, string> = {
  STR: '筋力',
  CON: '体力',
  POW: '精神力',
  DEX: '敏捷性',
  APP: '外見',
  SIZ: '体格',
  INT: '知性',
  EDU: '教育',
};

const COMMON_SKILLS = [
  '目星', '聞き耳', '図書館', '心理学', '説得', '言いくるめ',
  '回避', '隠れる', '忍び歩き', '応急手当', 'オカルト', '歴史',
  '母国語', '英語', '運転', '医学', '精神分析', 'クトゥルフ神話',
  // 戦闘系（よく使うもの）
  '格闘', 'キック', '組み付き', '投擲',
  '拳銃', 'ライフル', 'ショットガン', 'サブマシンガン',
  '刀剣', '弓', 'マーシャルアーツ',
];

export function CharacterSheet({
  character,
  editable,
  isGM,
  roomId,
  onUpdate,
  npcDisclosure,
  onUpdateNpcDisclosure,
}: CharacterSheetProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [stats, setStats] = useState<CharacterStats>(character.stats);
  const [derived, setDerived] = useState<CharacterDerived>(character.derived);
  const [skills, setSkills] = useState<Record<string, number>>(character.skills);
  const [skillPoints, setSkillPoints] = useState<SkillPointBreakdown>(() => {
    const existing = (character as any).skill_points;
    if (existing && typeof existing === 'object') {
      return {
        occupation: existing.occupation || {},
        interest: existing.interest || {},
        other: existing.other || {},
      };
    }
    return buildSkillPointBreakdownFromTotals(character.stats, character.skills);
  });
  const [memo, setMemo] = useState(character.memo);
  const [showPortraitManager, setShowPortraitManager] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { toast } = useToast();

  const isNpc = character.is_npc;
  const defaultNpcDisclosure: NpcDisclosureSettings = { showStats: false, showDerived: false, showSkills: false, showMemo: false };
  const disclosure = npcDisclosure ?? defaultNpcDisclosure;

  // Keep local edit buffers in sync when character changes
  useEffect(() => {
    setStats(character.stats);
    setDerived(character.derived);
    setSkills(character.skills);
    {
      const existing = (character as any).skill_points;
      if (existing && typeof existing === 'object') {
        setSkillPoints({
          occupation: existing.occupation || {},
          interest: existing.interest || {},
          other: existing.other || {},
        });
      } else {
        setSkillPoints(buildSkillPointBreakdownFromTotals(character.stats, character.skills));
      }
    }
    setMemo(character.memo);
    setIsEditing(false);
  }, [character.id]);

  const defaultSkills = useMemo(() => buildDefaultSkills(stats), [stats]);
  const computedSkills = useMemo(() => computeTotalSkills(stats, skillPoints), [stats, skillPoints]);

  const combinedSkillNames = useMemo(() => {
    return Array.from(
      new Set([...COMMON_SKILLS, ...Object.keys(defaultSkills), ...Object.keys(skills), ...Object.keys(computedSkills)]),
    )
      .map(normalizeSkillNameCoc6)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'ja'));
  }, [defaultSkills, skills, computedSkills]);

  const occupationLimit = stats.EDU * 20;
  const interestLimit = stats.INT * 10;
  const occupationUsed = Object.values(skillPoints.occupation || {}).reduce((sum, v) => sum + (Number.isFinite(v) ? Number(v) : 0), 0);
  const interestUsed = Object.values(skillPoints.interest || {}).reduce((sum, v) => sum + (Number.isFinite(v) ? Number(v) : 0), 0);

  const categorizedSkillGroups = useMemo(() => {
    const categoryOrder = COC6_SKILL_CATEGORIES.map((c) => ({
      key: c.key,
      label: c.label,
      skills: c.skills.map(normalizeSkillNameCoc6).filter(Boolean),
    }));

    const inCategory = new Set<string>();
    categoryOrder.forEach((c) => c.skills.forEach((s) => inCategory.add(s)));

    const extras = combinedSkillNames.filter((s) => !inCategory.has(s));
    const groups = [...categoryOrder];
    if (extras.length > 0) {
      groups.push({ key: 'other', label: 'その他', skills: extras });
    }
    return groups;
  }, [combinedSkillNames]);

  const handleSave = async () => {
    const nextTotals = computeTotalSkills(stats, skillPoints);
    const { error } = await (supabase
      .from('characters')
      .update({
        stats: stats as any,
        derived: derived as any,
        skills: nextTotals as any,
        skill_points: skillPoints as any,
        memo,
      })
      .eq('id', character.id) as any);

    if (error) {
      toast({
        title: '保存に失敗しました',
        variant: 'destructive',
      });
      return;
    }

    toast({ title: '保存しました' });
    setIsEditing(false);
    onUpdate();
  };

  const handleCancel = () => {
    setStats(character.stats);
    setDerived(character.derived);
    setSkills(character.skills);
    {
      const existing = (character as any).skill_points;
      if (existing && typeof existing === 'object') {
        setSkillPoints({
          occupation: existing.occupation || {},
          interest: existing.interest || {},
          other: existing.other || {},
        });
      } else {
        setSkillPoints(buildSkillPointBreakdownFromTotals(character.stats, character.skills));
      }
    }
    setMemo(character.memo);
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (!editable) return;
    setDeleting(true);
    try {
      // Best-effort: remove any active portrait for this character so stage doesn't keep stale entry
      try {
        const { data: stage } = await supabase
          .from('stage_states')
          .select('active_portraits')
          .eq('room_id', roomId)
          .single();
        const current = (stage as any)?.active_portraits;
        if (Array.isArray(current)) {
          const next = current.filter((p: any) => p?.characterId !== character.id);
          if (next.length !== current.length) {
            await supabase
              .from('stage_states')
              .update({ active_portraits: next, updated_at: new Date().toISOString() } as any)
              .eq('room_id', roomId);
          }
        }
      } catch {
        // ignore
      }

      const { error } = await supabase.from('characters').delete().eq('id', character.id);
      if (error) {
        toast({ title: '削除に失敗しました', variant: 'destructive' });
        return;
      }
      toast({ title: 'キャラクターを削除しました' });
      onUpdate();
    } finally {
      setDeleting(false);
    }
  };

  const updateStat = (key: keyof CharacterStats, value: number) => {
    setStats(prev => ({ ...prev, [key]: value }));
  };

  const updateDerived = (key: keyof CharacterDerived, value: number | string) => {
    setDerived(prev => ({ ...prev, [key]: value }));
  };

  const updateSkill = (name: string, value: number) => {
    setSkills(prev => ({ ...prev, [name]: value }));
  };

  const skillNames = combinedSkillNames;
  const skillTotal = Object.values(computedSkills).reduce((sum, v) => sum + (Number.isFinite(v) ? v : 0), 0);
  const skillLimit = occupationLimit + interestLimit;
  const skillOver = skillTotal > skillLimit;

  const canViewStats = !isNpc || isGM || disclosure.showStats;
  const canViewDerived = !isNpc || isGM || disclosure.showDerived;
  const canViewSkills = !isNpc || isGM || disclosure.showSkills;
  const canViewMemo = !isNpc || isGM || disclosure.showMemo;
  const canViewAnything = canViewStats || canViewDerived || canViewSkills || canViewMemo;

  return (
    <div className="bg-sidebar-accent rounded-lg p-4 space-y-4">
      {/* Edit Controls */}
      {editable && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowPortraitManager(true)}>
            <ImageIcon className="w-4 h-4 mr-1" />
            立ち絵
          </Button>
          {isEditing ? (
            <>
              <Button size="sm" variant="ghost" onClick={handleCancel}>
                <X className="w-4 h-4 mr-1" />
                キャンセル
              </Button>
              <Button size="sm" onClick={handleSave}>
                <Save className="w-4 h-4 mr-1" />
                保存
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setIsEditing(true)}>
              <Edit2 className="w-4 h-4 mr-1" />
              編集
            </Button>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="outline" className="text-destructive" disabled={deleting}>
                <Trash2 className="w-4 h-4 mr-1" />
                削除
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>本当にキャラクターを削除しますか？</AlertDialogTitle>
                <AlertDialogDescription>この操作は取り消せません。</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>キャンセル</AlertDialogCancel>
                <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={handleDelete}>
                  はい
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}

      {/* NPC disclosure controls (GM only) */}
      {isNpc && isGM && onUpdateNpcDisclosure && (
        <div className="rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-3 space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            PLに開示
          </h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <label className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">能力値</span>
              <Switch checked={disclosure.showStats} onCheckedChange={(v) => onUpdateNpcDisclosure({ showStats: v })} />
            </label>
            <label className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">派生値</span>
              <Switch checked={disclosure.showDerived} onCheckedChange={(v) => onUpdateNpcDisclosure({ showDerived: v })} />
            </label>
            <label className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">技能</span>
              <Switch checked={disclosure.showSkills} onCheckedChange={(v) => onUpdateNpcDisclosure({ showSkills: v })} />
            </label>
            <label className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">メモ/所持品</span>
              <Switch checked={disclosure.showMemo} onCheckedChange={(v) => onUpdateNpcDisclosure({ showMemo: v })} />
            </label>
          </div>
        </div>
      )}

      {isNpc && !isGM && !canViewAnything && (
        <div className="text-sm text-muted-foreground">
          このNPCの情報はまだ開示されていません。
        </div>
      )}

      {/* Stats Grid */}
      {canViewStats && (
        <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          能力値
        </h4>
        <div className="grid grid-cols-4 gap-2">
          {(Object.keys(STAT_LABELS) as Array<keyof CharacterStats>).map(key => (
            <div key={key} className="text-center">
              <p className="text-xs text-muted-foreground">{STAT_LABELS[key]}</p>
              {isEditing ? (
                <Input
                  type="number"
                  value={stats[key]}
                  onChange={(e) => updateStat(key, parseInt(e.target.value) || 0)}
                  className="h-8 text-center text-sm"
                />
              ) : (
                <p className="text-lg font-bold text-foreground">{stats[key]}</p>
              )}
            </div>
          ))}
        </div>
        </div>
      )}

      {/* Derived Stats */}
      {canViewDerived && (
        <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          派生値
        </h4>
        <div className="grid grid-cols-4 gap-2">
          <div className="text-center">
            <p className="text-xs text-muted-foreground">HP</p>
            {isEditing ? (
              <Input
                type="number"
                value={derived.HP}
                onChange={(e) => updateDerived('HP', parseInt(e.target.value) || 0)}
                className="h-8 text-center text-sm"
              />
            ) : (
              <p className="text-lg font-bold text-dice-success">{derived.HP}</p>
            )}
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">MP</p>
            {isEditing ? (
              <Input
                type="number"
                value={derived.MP}
                onChange={(e) => updateDerived('MP', parseInt(e.target.value) || 0)}
                className="h-8 text-center text-sm"
              />
            ) : (
              <p className="text-lg font-bold text-primary">{derived.MP}</p>
            )}
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">SAN</p>
            {isEditing ? (
              <Input
                type="number"
                value={derived.SAN}
                onChange={(e) => updateDerived('SAN', parseInt(e.target.value) || 0)}
                className="h-8 text-center text-sm"
              />
            ) : (
              <p className="text-lg font-bold text-accent">{derived.SAN}</p>
            )}
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">DB</p>
            {isEditing ? (
              <Input
                value={derived.DB}
                onChange={(e) => updateDerived('DB', e.target.value)}
                className="h-8 text-center text-sm"
              />
            ) : (
              <p className="text-lg font-bold text-foreground">{derived.DB}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-2">
          <div className="text-center">
            <p className="text-xs text-muted-foreground">IDE</p>
            <p className="text-lg font-bold text-foreground">{stats.INT * 5}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">幸運</p>
            <p className="text-lg font-bold text-foreground">{stats.POW * 5}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">知識</p>
            <p className="text-lg font-bold text-foreground">{stats.EDU * 5}</p>
          </div>
        </div>
        </div>
      )}

      {/* Skills */}
      {canViewSkills && (
        <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          技能
        </h4>
        {isEditing ? (
          <>
            <div className={cn('text-xs mb-1', skillOver ? 'text-destructive' : 'text-muted-foreground')}>
              合計: {skillTotal} / 上限(目安): {skillLimit}（職業P: EDU×20={occupationLimit}、興味P: INT×10={interestLimit}）
            </div>
            <div
              className={cn(
                'text-xs mb-2',
                occupationUsed > occupationLimit || interestUsed > interestLimit ? 'text-destructive' : 'text-muted-foreground',
              )}
            >
              職業P: {occupationUsed}/{occupationLimit}　興味P: {interestUsed}/{interestLimit}
            </div>

            <div className="grid grid-cols-1 gap-2 text-sm">
              {categorizedSkillGroups.map((group) => (
                <div key={group.key} className="rounded-md border border-border/40 bg-background/10">
                  <div className="px-2 py-2 text-xs font-semibold text-muted-foreground">
                    {group.label}
                  </div>
                  <div className="px-2 pb-2">
                    <div className="flex items-center gap-2 px-2 py-1 text-[11px] text-muted-foreground">
                      <span className="flex-1">技能</span>
                      <span className="w-10 text-right">初期</span>
                      <span className="w-14 text-right">職業P</span>
                      <span className="w-14 text-right">興味P</span>
                      <span className="w-12 text-right">合計</span>
                    </div>
                    {group.skills.map((skillName) => {
                      const base = defaultSkills[skillName] ?? 0;
                      const occ = (skillPoints.occupation || {})[skillName] ?? 0;
                      const intr = (skillPoints.interest || {})[skillName] ?? 0;
                      const total = computedSkills[skillName] ?? base;
                      // Hide truly empty unknown skills to reduce noise
                      const hasAny = base !== 0 || occ !== 0 || intr !== 0 || total !== 0;
                      if (!hasAny) return null;
                      return (
                        <div
                          key={skillName}
                          className="flex items-start justify-between gap-2 px-2 py-1 rounded hover:bg-background/50 min-w-0"
                        >
                          <span className="text-muted-foreground flex-1 min-w-0 whitespace-normal break-words leading-snug">
                            {skillName}
                          </span>
                          <span className="w-10 text-right text-xs text-muted-foreground">{base}</span>
                          <Input
                            type="number"
                            value={occ}
                            onChange={(e) => {
                              const n = Number.parseInt(e.target.value || '0', 10) || 0;
                              setSkillPoints((prev) => ({
                                ...prev,
                                occupation: { ...(prev.occupation || {}), [skillName]: Math.max(0, Math.min(999, n)) },
                              }));
                            }}
                            className="w-14 h-6 text-center text-xs"
                          />
                          <Input
                            type="number"
                            value={intr}
                            onChange={(e) => {
                              const n = Number.parseInt(e.target.value || '0', 10) || 0;
                              setSkillPoints((prev) => ({
                                ...prev,
                                interest: { ...(prev.interest || {}), [skillName]: Math.max(0, Math.min(999, n)) },
                              }));
                            }}
                            className="w-14 h-6 text-center text-xs"
                          />
                          <span className="w-12 text-right font-mono text-foreground">{total}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="space-y-2">
            {categorizedSkillGroups.map((group) => {
              const visible = group.skills
                .map((s) => ({ name: s, value: computedSkills[s] ?? 0 }))
                .filter((x) => x.value !== 0);
              if (visible.length === 0) return null;
              return (
                <div key={group.key} className="rounded-md border border-border/40 bg-background/10">
                  <div className="px-2 py-2 text-xs font-semibold text-muted-foreground">
                    {group.label}
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-sm px-2 pb-2">
                    {visible.map(({ name: skillName, value }) => (
                      <div
                        key={skillName}
                        className="flex items-start justify-between gap-2 px-2 py-1 rounded hover:bg-background/50 min-w-0"
                      >
                        <span className="text-muted-foreground flex-1 min-w-0 whitespace-normal break-words leading-snug">
                          {skillName}
                        </span>
                        <span className="font-mono text-foreground">{value}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        </div>
      )}

      {/* Memo */}
      {canViewMemo && (
        <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          メモ / 所持品
        </h4>
        {isEditing ? (
          <Textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            className="min-h-[80px] text-sm"
            placeholder="メモや所持品を入力..."
          />
        ) : (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {memo || '(なし)'}
          </p>
        )}
        </div>
      )}

      {/* Portrait Manager Dialog */}
      <PortraitManager
        open={showPortraitManager}
        onOpenChange={setShowPortraitManager}
        roomId={roomId}
        characterId={character.id}
        characterName={character.name}
        onUpdate={onUpdate}
      />
    </div>
  );
}
