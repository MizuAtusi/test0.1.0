import { useEffect, useMemo, useState } from 'react';
import { Edit2, Save, X, Image as ImageIcon, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import type { Character, CharacterStats, CharacterDerived, Profile } from '@/types/trpg';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { PortraitManager } from './PortraitManager';
import {
  buildDefaultSkills,
  buildSkillPointBreakdownFromTotals,
  compareCoc6SkillNames,
  computeTotalSkills,
  formatCoc6SkillNameForDisplay,
  getCoc6SkillBaseValue,
  normalizeSkillNameCoc6,
  normalizeSkillPointBreakdown,
  parseCoc6OptionalDetailSkill,
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
  '母国語', 'ほかの言語', '運転', '医学', '精神分析', 'クトゥルフ神話',
  // 戦闘系（よく使うもの）
  '格闘', 'キック', '組み付き', '投擲',
  '拳銃', 'ライフル', 'ショットガン', 'サブマシンガン',
  '刀剣', '弓', 'マーシャルアーツ',
];

const SKILL_POINTS_STORAGE_KEY_PREFIX = 'trpg:characterSkillPoints:';
const SKILL_POINTS_CONFIRMED_KEY_PREFIX = 'trpg:characterSkillPointsConfirmed:';
function skillPointsStorageKey(roomId: string, characterId: string) {
  return `${SKILL_POINTS_STORAGE_KEY_PREFIX}${roomId}:${characterId}`;
}
function skillPointsConfirmedStorageKey(roomId: string, characterId: string) {
  return `${SKILL_POINTS_CONFIRMED_KEY_PREFIX}${roomId}:${characterId}`;
}
function loadLocalSkillPoints(roomId: string, characterId: string): SkillPointBreakdown | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = localStorage.getItem(skillPointsStorageKey(roomId, characterId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return normalizeSkillPointBreakdown({
      occupation: (parsed as any).occupation || {},
      interest: (parsed as any).interest || {},
      other: (parsed as any).other || {},
    });
  } catch {
    return null;
  }
}
function loadLocalSkillPointsConfirmed(roomId: string, characterId: string) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    return localStorage.getItem(skillPointsConfirmedStorageKey(roomId, characterId)) === '1';
  } catch {
    return false;
  }
}
function saveLocalSkillPointsConfirmed(roomId: string, characterId: string) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    localStorage.setItem(skillPointsConfirmedStorageKey(roomId, characterId), '1');
  } catch {
    // ignore
  }
}
function saveLocalSkillPoints(roomId: string, characterId: string, sp: SkillPointBreakdown) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    localStorage.setItem(skillPointsStorageKey(roomId, characterId), JSON.stringify(sp));
  } catch {
    // ignore
  }
}
function clearLocalSkillPoints(roomId: string, characterId: string) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    localStorage.removeItem(skillPointsStorageKey(roomId, characterId));
  } catch {
    // ignore
  }
}

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
      return normalizeSkillPointBreakdown({
        occupation: existing.occupation || {},
        interest: existing.interest || {},
        other: existing.other || {},
      });
    }
    const local = loadLocalSkillPoints(roomId, character.id);
    if (local) return local;
    return buildSkillPointBreakdownFromTotals(character.stats, character.skills);
  });
  const [memo, setMemo] = useState(character.memo);
  const [showPortraitManager, setShowPortraitManager] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferTargets, setTransferTargets] = useState<Array<{ userId: string; name: string; role: 'PL' | 'GM' }>>([]);
  const [transferSelected, setTransferSelected] = useState<string>('none');
  const [deleting, setDeleting] = useState(false);
  const [renamingSkill, setRenamingSkill] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [renameComposing, setRenameComposing] = useState(false);
  const [addingSkill, setAddingSkill] = useState(false);
  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillComposing, setNewSkillComposing] = useState(false);
  const [newlyAddedSkills, setNewlyAddedSkills] = useState<string[]>([]);
  const [optionalDetailDrafts, setOptionalDetailDrafts] = useState<Record<string, string>>({});
  const [optionalDetailComposing, setOptionalDetailComposing] = useState<string | null>(null);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
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
        setSkillPoints(
          normalizeSkillPointBreakdown({
            occupation: existing.occupation || {},
            interest: existing.interest || {},
            other: existing.other || {},
          }),
        );
      } else {
        const local = loadLocalSkillPoints(roomId, character.id);
        if (local) setSkillPoints(local);
        else setSkillPoints(buildSkillPointBreakdownFromTotals(character.stats, character.skills));
      }
    }
    setMemo(character.memo);
    setIsEditing(false);
    setNewlyAddedSkills([]);
  }, [character.id, roomId]);

  useEffect(() => {
    if (!transferOpen || !roomId || character.is_npc) return;
    let canceled = false;
    (async () => {
      setTransferLoading(true);
      const { data: members, error } = await supabase
        .from('room_members')
        .select('user_id,role')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true });
      if (canceled) return;
      if (error) {
        setTransferTargets([]);
        setTransferLoading(false);
        return;
      }
      const memberRows = (members as any[]) || [];
      const userIds = memberRows.map((m) => m.user_id).filter(Boolean);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id,display_name,handle')
        .in('id', userIds);
      if (canceled) return;
      const profileById = new Map<string, Profile>();
      (profiles as any[] | null)?.forEach((p) => {
        if (!p?.id) return;
        profileById.set(String(p.id), p as Profile);
      });
      const targets = memberRows.map((m) => {
        const profile = profileById.get(String(m.user_id));
        const name = profile?.display_name || profile?.handle || `${String(m.user_id).slice(0, 8)}...`;
        return { userId: String(m.user_id), name, role: m.role as 'PL' | 'GM' };
      });
      setTransferTargets(targets);
      setTransferSelected(character.owner_user_id ? String(character.owner_user_id) : 'none');
      setTransferLoading(false);
    })();
    return () => {
      canceled = true;
    };
  }, [transferOpen, roomId, character.id, character.is_npc, character.owner_user_id]);

  const defaultSkills = useMemo(() => buildDefaultSkills(stats), [stats]);
  const computedSkills = useMemo(() => computeTotalSkills(stats, skillPoints), [stats, skillPoints]);

  const combinedSkillNames = useMemo(() => {
    const normalized = [...COMMON_SKILLS, ...Object.keys(defaultSkills), ...Object.keys(skills), ...Object.keys(computedSkills)]
      .map(normalizeSkillNameCoc6)
      .filter((n) => !!n && !['アイデア', '幸運', '知識'].includes(n));
    const unique = Array.from(new Set(normalized)).sort(compareCoc6SkillNames);
    const optionalBasesWithDetail = new Set<string>();
    for (const n of unique) {
      const p = parseCoc6OptionalDetailSkill(n);
      if (p.isOptionalDetail && p.detail) optionalBasesWithDetail.add(p.base);
    }
    return unique.filter((n) => {
      const p = parseCoc6OptionalDetailSkill(n);
      const isPlaceholder = p.isOptionalDetail && !p.detail && n.endsWith('（）');
      if (isPlaceholder && optionalBasesWithDetail.has(p.base)) return false;
      return true;
    });
  }, [defaultSkills, skills, computedSkills]);

  const occupationLimit = stats.EDU * 20;
  const interestLimit = stats.INT * 10;
  const occupationUsed = Object.values(skillPoints.occupation || {}).reduce((sum, v) => sum + (Number.isFinite(v) ? Number(v) : 0), 0);
  const interestUsed = Object.values(skillPoints.interest || {}).reduce((sum, v) => sum + (Number.isFinite(v) ? Number(v) : 0), 0);

  // Skills are displayed in gojuon order (no category grouping)

  const startRenameSkill = (skillName: string) => {
    setRenamingSkill(skillName);
    setRenameDraft(skillName);
    setRenameComposing(false);
  };

  const renameSkillKey = (fromName: string, toRaw: string) => {
    const nextRaw = String(toRaw || '').trim();
    const next = normalizeSkillNameCoc6(nextRaw);
    if (!next) return;
    if (next === fromName) return;
    setSkillPoints((prev) => {
      const occ = { ...(prev.occupation || {}) };
      const intr = { ...(prev.interest || {}) };
      const oth = { ...(prev.other || {}) };

      const move = (obj: Record<string, number>) => {
        const from = obj[fromName] ?? 0;
        if (from) obj[next] = (obj[next] ?? 0) + from;
        delete obj[fromName];
      };
      move(occ);
      move(intr);
      move(oth);
      return normalizeSkillPointBreakdown({ occupation: occ, interest: intr, other: oth });
    });
  };

  const commitOptionalDetailSkill = (fromName: string, base: string, draft: string) => {
    const detail = String(draft || '').trim();
    const nextRaw = detail ? `${base}（${detail}）` : base;
    const next = normalizeSkillNameCoc6(nextRaw);
    if (!next) return;

    // Update skill points: move allocation to the new key, and collapse other variants of the same base.
    setSkillPoints((prev) => {
      const occ = { ...(prev.occupation || {}) };
      const intr = { ...(prev.interest || {}) };
      const oth = { ...(prev.other || {}) };

      const collapse = (obj: Record<string, number>) => {
        let sum = 0;
        for (const k of Object.keys(obj)) {
          const p = parseCoc6OptionalDetailSkill(k);
          if (!p.isOptionalDetail || p.base !== base) continue;
          sum += Number.isFinite(obj[k]) ? Number(obj[k]) : 0;
          delete obj[k];
        }
        if (sum > 0) obj[next] = (obj[next] ?? 0) + sum;
      };
      collapse(occ);
      collapse(intr);
      collapse(oth);

      // Ensure we don't keep the old key around
      delete occ[fromName];
      delete intr[fromName];
      delete oth[fromName];

      return normalizeSkillPointBreakdown({ occupation: occ, interest: intr, other: oth });
    });

    // Update local skills map so the label doesn't "disappear" even when allocation is 0.
    setSkills((prev) => {
      const nextSkills = { ...(prev || {}) } as Record<string, number>;
      const keepValue =
        (prev as any)?.[fromName] ??
        (prev as any)?.[next] ??
        getCoc6SkillBaseValue(stats, next);

      for (const k of Object.keys(nextSkills)) {
        const p = parseCoc6OptionalDetailSkill(k);
        if (p.isOptionalDetail && p.base === base) delete nextSkills[k];
      }

      nextSkills[next] = Number.isFinite(keepValue) ? Math.max(0, Math.trunc(Number(keepValue))) : getCoc6SkillBaseValue(stats, next);
      return nextSkills;
    });

    setOptionalDetailDrafts((prev) => {
      const copy = { ...(prev || {}) };
      delete copy[fromName];
      if (detail) copy[next] = detail;
      else delete copy[next];
      return copy;
    });
  };

  const commitRenameSkill = (skillName: string) => {
    const nextRaw = String(renameDraft || '').trim();
    const next = normalizeSkillNameCoc6(nextRaw);
    if (!next) {
      setRenamingSkill(null);
      return;
    }
    if (next === skillName) {
      setRenamingSkill(null);
      return;
    }
    renameSkillKey(skillName, next);
    setRenamingSkill(null);
  };

  const commitAddSkill = () => {
    const raw = String(newSkillName || '').trim();
    const normalized = normalizeSkillNameCoc6(raw);
    if (!normalized) {
      setAddingSkill(false);
      setNewSkillName('');
      return;
    }
    setSkillPoints((prev) => {
      const other = { ...(prev.other || {}) };
      if (other[normalized] === undefined) other[normalized] = 0;
      return { ...prev, other };
    });
    setNewlyAddedSkills((prev) => (prev.includes(normalized) ? prev : [...prev, normalized]));
    setAddingSkill(false);
    setNewSkillName('');
  };

  const handleSave = async () => {
    const nextTotals = computeTotalSkills(stats, skillPoints);
    const nextTotalsFixed = { ...nextTotals } as Record<string, number>;
    // If an optional-detail skill is customized but has 0 allocated points, computeTotalSkills would still emit the placeholder.
    // Reflect the chosen name in saved totals so it persists across sessions.
    const preferredByBase = new Map<string, string>();
    for (const k of Object.keys(skills || {})) {
      const p = parseCoc6OptionalDetailSkill(k);
      if (p.isOptionalDetail && p.detail) preferredByBase.set(p.base, k);
    }
    for (const [base, preferred] of preferredByBase.entries()) {
      const placeholder = normalizeSkillNameCoc6(base);
      if (!placeholder || preferred === placeholder) continue;
      if (nextTotalsFixed[placeholder] !== undefined) {
        nextTotalsFixed[preferred] = Math.max(nextTotalsFixed[preferred] ?? 0, nextTotalsFixed[placeholder] ?? 0);
        delete nextTotalsFixed[placeholder];
      }
    }
    const normalizedSkillPoints = normalizeSkillPointBreakdown(skillPoints);
    let { error } = await (supabase
      .from('characters')
      .update({
        stats: stats as any,
        derived: derived as any,
        skills: nextTotalsFixed as any,
        skill_points: normalizedSkillPoints as any,
        memo,
      })
      .eq('id', character.id) as any);

    // Backward compatibility: if DB doesn't have skill_points yet, retry without it.
    let usedSkillPointsFallback = false;
    if (error) {
      const msg = String((error as any)?.message || '');
      const looksLikeMissingSkillPoints =
        msg.includes('skill_points') && (msg.includes('column') || msg.includes('schema') || msg.includes('does not exist'));
      if (looksLikeMissingSkillPoints) {
        usedSkillPointsFallback = true;
        const retry = await (supabase
          .from('characters')
          .update({
            stats: stats as any,
            derived: derived as any,
            skills: nextTotalsFixed as any,
            memo,
          })
          .eq('id', character.id) as any);
        error = (retry as any).error;
      }
    }

    if (error) {
      toast({
        title: '保存に失敗しました',
        variant: 'destructive',
      });
      return;
    }

    toast({ title: '保存しました' });
    saveLocalSkillPointsConfirmed(roomId, character.id);
    if (usedSkillPointsFallback) saveLocalSkillPoints(roomId, character.id, normalizedSkillPoints);
    else clearLocalSkillPoints(roomId, character.id);
    setIsEditing(false);
    setNewlyAddedSkills([]);
    onUpdate();
  };

  const handleCancel = () => {
    setStats(character.stats);
    setDerived(character.derived);
    setSkills(character.skills);
    {
      const existing = (character as any).skill_points;
      if (existing && typeof existing === 'object') {
        setSkillPoints(
          normalizeSkillPointBreakdown({
            occupation: existing.occupation || {},
            interest: existing.interest || {},
            other: existing.other || {},
          }),
        );
      } else {
        const local = loadLocalSkillPoints(roomId, character.id);
        if (local) setSkillPoints(local);
        else setSkillPoints(buildSkillPointBreakdownFromTotals(character.stats, character.skills));
      }
    }
    setMemo(character.memo);
    setIsEditing(false);
    setNewlyAddedSkills([]);
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

  const saveDerivedField = async (key: keyof CharacterDerived, value: number) => {
    if (!editable) return;
    const nextDerived = { ...derived, [key]: value } as any;
    setDerived(nextDerived);
    const { error } = await supabase
      .from('characters')
      .update({ derived: nextDerived } as any)
      .eq('id', character.id);
    if (error) {
      toast({ title: '保存に失敗しました', variant: 'destructive' });
      return;
    }
    onUpdate();
  };

  const skillNames = useMemo(() => {
    if (!isEditing || newlyAddedSkills.length === 0) return combinedSkillNames;
    const pinned = new Set(newlyAddedSkills);
    const base = combinedSkillNames.filter((n) => !pinned.has(n));
    return [...base, ...newlyAddedSkills.filter((n) => !base.includes(n))];
  }, [combinedSkillNames, isEditing, newlyAddedSkills]);
  const skillTotal = Object.values(computedSkills).reduce((sum, v) => sum + (Number.isFinite(v) ? v : 0), 0);
  const skillLimit = occupationLimit + interestLimit;
  const skillOver = skillTotal > skillLimit;

  const canViewStats = !isNpc || isGM || disclosure.showStats;
  const canViewDerived = !isNpc || isGM || disclosure.showDerived;
  const canViewSkills = !isNpc || isGM || disclosure.showSkills;
  const canViewMemo = !isNpc || isGM || disclosure.showMemo;
  const canViewAnything = canViewStats || canViewDerived || canViewSkills || canViewMemo;

  const handleTransferOwner = async () => {
    if (!roomId || character.is_npc) return;
    const nextOwner = transferSelected === 'none' ? null : transferSelected;
    setTransferLoading(true);
    const { error } = await supabase
      .from('characters')
      .update({ owner_user_id: nextOwner, owner_participant_id: null } as any)
      .eq('id', character.id);
    setTransferLoading(false);
    if (error) {
      toast({ title: 'PCの受け渡しに失敗しました', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'PCを渡しました' });
    setTransferOpen(false);
    onUpdate();
  };

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
            <>
	              <Button
	                size="sm"
	                variant="ghost"
	                onClick={() => {
	                  const existing = (character as any).skill_points;
	                  const local = loadLocalSkillPoints(roomId, character.id);
	                  const confirmed = loadLocalSkillPointsConfirmed(roomId, character.id);
	                  const estimated = buildSkillPointBreakdownFromTotals(character.stats, character.skills);
	                  const hasAnyAllocated =
	                    Object.values(estimated.other || {}).some((v) => Number.isFinite(v) && Number(v) > 0);
	                  // If there is no breakdown and the character appears to have imported/unknown allocations, confirm before resetting.
	                  const hasBreakdown = !!(existing && typeof existing === 'object') || !!local || confirmed;

	                  if (!hasBreakdown && hasAnyAllocated) {
	                    setResetConfirmOpen(true);
	                    return;
	                  }
	                  setIsEditing(true);
	                }}
              >
                <Edit2 className="w-4 h-4 mr-1" />
                編集
              </Button>

              <AlertDialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>割り振られた技能値はリセットされます。よろしいですか？</AlertDialogTitle>
                    <AlertDialogDescription>
                      ココフォリアコマ等からインポートしたキャラクターは、職業P/興味Pの内訳が保存されていないため、編集を開始すると初期値に戻してから再割り振りします。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setResetConfirmOpen(false)}>キャンセル</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        // Reset totals to base values and clear breakdown so user can re-allocate.
                        const nextSkills: Record<string, number> = {};
                        const keys = new Set<string>([
                          ...Object.keys(character.skills || {}),
                          ...Object.keys(skills || {}),
                          ...Object.keys(buildDefaultSkills(stats) || {}),
                        ]);
                        for (const k of keys) {
                          const name = normalizeSkillNameCoc6(k);
                          if (!name) continue;
                          nextSkills[name] = getCoc6SkillBaseValue(stats, name);
                        }
                        setSkills(nextSkills);
                        setSkillPoints({ occupation: {}, interest: {}, other: {} });
                        setNewlyAddedSkills([]);
                        clearLocalSkillPoints(roomId, character.id);
                        setResetConfirmOpen(false);
                        setIsEditing(true);
                      }}
                      className="bg-destructive hover:bg-destructive/90"
                    >
                      はい
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
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
              editable ? (
                <Input
                  type="number"
                  value={derived.HP}
                  onChange={(e) => updateDerived('HP', parseInt(e.target.value) || 0)}
                  onBlur={(e) => saveDerivedField('HP', parseInt(e.target.value) || 0)}
                  className="h-8 text-center text-sm"
                />
              ) : (
                <p className="text-lg font-bold text-dice-success">{derived.HP}</p>
              )
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
              editable ? (
                <Input
                  type="number"
                  value={derived.MP}
                  onChange={(e) => updateDerived('MP', parseInt(e.target.value) || 0)}
                  onBlur={(e) => saveDerivedField('MP', parseInt(e.target.value) || 0)}
                  className="h-8 text-center text-sm"
                />
              ) : (
                <p className="text-lg font-bold text-primary">{derived.MP}</p>
              )
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
              editable ? (
                <Input
                  type="number"
                  value={derived.SAN}
                  onChange={(e) => updateDerived('SAN', parseInt(e.target.value) || 0)}
                  onBlur={(e) => saveDerivedField('SAN', parseInt(e.target.value) || 0)}
                  className="h-8 text-center text-sm"
                />
              ) : (
                <p className="text-lg font-bold text-accent">{derived.SAN}</p>
              )
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
              上限(目安): {skillLimit}（職業P: EDU×20={occupationLimit}、興味P: INT×10={interestLimit}）
            </div>
            <div
              className={cn(
                'text-xs mb-2',
                occupationUsed > occupationLimit || interestUsed > interestLimit ? 'text-destructive' : 'text-muted-foreground',
              )}
            >
              職業P: {occupationUsed}/{occupationLimit}　興味P: {interestUsed}/{interestLimit}
            </div>

            <div className="grid grid-cols-1 gap-1 text-sm">
              <div className="flex items-center gap-2 px-2 py-1 text-[11px] text-muted-foreground">
                <span className="flex-1">技能</span>
                <span className="w-10 text-right">初期</span>
                <span className="w-14 text-right">職業P</span>
                <span className="w-14 text-right">興味P</span>
                <span className="w-12 text-right">合計</span>
              </div>
              {skillNames.map((skillName) => {
                const base = getCoc6SkillBaseValue(stats, skillName);
                const occ = (skillPoints.occupation || {})[skillName] ?? 0;
                const intr = (skillPoints.interest || {})[skillName] ?? 0;
                const total = computedSkills[skillName] ?? base;
                const optional = parseCoc6OptionalDetailSkill(skillName);
                const optionalDraft =
                  optionalDetailDrafts[skillName] ?? (optional.isOptionalDetail ? optional.detail : '');
                return (
                  <div
                    key={skillName}
                    className="flex items-start justify-between gap-2 px-2 py-1 rounded hover:bg-background/50 min-w-0"
                  >
                    <span className="text-muted-foreground flex-1 min-w-0 whitespace-normal break-words leading-snug">
                      {optional.isOptionalDetail ? (
                        <span className="inline-flex items-center gap-2 min-w-0">
                          <span className="shrink-0">{optional.base}</span>
                          <Input
                            value={optionalDraft}
                            onChange={(e) => {
                              const v = e.target.value;
                              setOptionalDetailDrafts((prev) => ({ ...prev, [skillName]: v }));
                            }}
                            onCompositionStart={() => setOptionalDetailComposing(skillName)}
                            onCompositionEnd={() => setOptionalDetailComposing(null)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && optionalDetailComposing !== skillName) {
                                e.preventDefault();
                                commitOptionalDetailSkill(skillName, optional.base, optionalDraft);
                              } else if (e.key === 'Escape') {
                                e.preventDefault();
                                setOptionalDetailDrafts((prev) => ({ ...prev, [skillName]: optional.detail }));
                              }
                            }}
                            onBlur={() => {
                              if (optionalDetailComposing === skillName) return;
                              commitOptionalDetailSkill(skillName, optional.base, optionalDraft);
                            }}
                            placeholder=""
                            className="h-6 w-40 text-xs"
                          />
                        </span>
                      ) : renamingSkill === skillName ? (
                        <Input
                          value={renameDraft}
                          onChange={(e) => setRenameDraft(e.target.value)}
                          onCompositionStart={() => setRenameComposing(true)}
                          onCompositionEnd={() => setRenameComposing(false)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !renameComposing) {
                              e.preventDefault();
                              commitRenameSkill(skillName);
                            } else if (e.key === 'Escape') {
                              e.preventDefault();
                              setRenamingSkill(null);
                            }
                          }}
                          onBlur={() => {
                            if (!renameComposing) commitRenameSkill(skillName);
                          }}
                          className="h-6 text-xs"
                          autoFocus
                        />
                      ) : (
                        <button
                          type="button"
                          className="text-left hover:underline"
                          onClick={() => startRenameSkill(skillName)}
                          title="クリックして技能名を変更"
                        >
                          {formatCoc6SkillNameForDisplay(skillName)}
                        </button>
                      )}
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

            <div className="pt-2">
              {addingSkill ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={newSkillName}
                    onChange={(e) => setNewSkillName(e.target.value)}
                    onCompositionStart={() => setNewSkillComposing(true)}
                    onCompositionEnd={() => setNewSkillComposing(false)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setAddingSkill(false);
                        setNewSkillName('');
                      }
                    }}
                    placeholder="例：ほかの言語（ドイツ語）、芸術（絵画）…"
                    className="h-9"
                    autoFocus
                  />
                  <Button
                    type="button"
                    onClick={() => {
                      if (newSkillComposing) return;
                      commitAddSkill();
                    }}
                  >
                    追加
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setAddingSkill(false);
                      setNewSkillName('');
                    }}
                  >
                    キャンセル
                  </Button>
                </div>
              ) : (
                <Button type="button" variant="outline" className="w-full" onClick={() => setAddingSkill(true)}>
                  技能を追加
                </Button>
              )}
            </div>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-1 text-sm">
            {skillNames.map((skillName) => {
              const occ = (skillPoints.occupation || {})[skillName] ?? 0;
              const intr = (skillPoints.interest || {})[skillName] ?? 0;
              const oth = (skillPoints.other || {})[skillName] ?? 0;
              const allocated = (Number.isFinite(occ) ? Number(occ) : 0) + (Number.isFinite(intr) ? Number(intr) : 0) + (Number.isFinite(oth) ? Number(oth) : 0);
              if (allocated <= 0) return null;
              const value = computedSkills[skillName] ?? 0;
              if (value === 0) return null;
              return (
                <div
                  key={skillName}
                  className="flex items-start justify-between gap-2 px-2 py-1 rounded hover:bg-background/50 min-w-0"
                >
                  <span className="text-muted-foreground flex-1 min-w-0 whitespace-normal break-words leading-snug">
                    {formatCoc6SkillNameForDisplay(skillName)}
                  </span>
                  <span className="font-mono text-foreground">{value}%</span>
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

      {editable && isGM && !isNpc && (
        <div>
          <Button size="sm" variant="outline" onClick={() => setTransferOpen(true)}>
            PCを渡す
          </Button>
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

      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>PCを渡す</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              渡したい相手を選択してください。
            </div>
            {transferLoading ? (
              <div className="text-sm text-muted-foreground">読み込み中...</div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                <button
                  type="button"
                  className={`w-full text-left px-3 py-2 rounded border ${
                    transferSelected === 'none' ? 'border-primary' : 'border-border/60'
                  }`}
                  onClick={() => setTransferSelected('none')}
                >
                  未割り当て（KP管理）
                </button>
                {transferTargets.map((target) => (
                  <button
                    key={target.userId}
                    type="button"
                    className={`w-full text-left px-3 py-2 rounded border ${
                      transferSelected === target.userId ? 'border-primary' : 'border-border/60'
                    }`}
                    onClick={() => setTransferSelected(target.userId)}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm">{target.name}</span>
                      <span className="text-xs text-muted-foreground">{target.role}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setTransferOpen(false)}>
              閉じる
            </Button>
            <Button onClick={() => void handleTransferOwner()} disabled={transferLoading}>
              確定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
