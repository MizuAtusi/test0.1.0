import type { CharacterStats, CharacterDerived, Character } from '@/types/trpg';

type SkillValue = number | ((stats: CharacterStats) => number);

const COC6_NON_SKILL_DERIVED = new Set(['アイデア', '幸運', '知識']);

const JAPANESE_SKILL_READINGS: Record<string, string> = {
  アイデア: 'あいであ',
  応急手当: 'おうきゅうてあて',
  オカルト: 'おかると',
  回避: 'かいひ',
  化学: 'かがく',
  鍵開け: 'かぎあけ',
  こぶし: 'こぶし',
  組みつき: 'くみつき',
  クトゥルフ神話: 'くとぅるふしんわ',
  経理: 'けいり',
  考古学: 'こうこがく',
  コンピューター: 'こんぴゅーたー',
  サブマシンガン: 'さぶましんがん',
  写真術: 'しゃしんじゅつ',
  ショットガン: 'しょっとがん',
  心理学: 'しんりがく',
  水泳: 'すいえい',
  説得: 'せっとく',
  精神分析: 'せいしんぶんせき',
  天文学: 'てんもんがく',
  電子工学: 'でんしこうがく',
  電気修理: 'でんきしゅうり',
  投擲: 'とうてき',
  登攀: 'とうはん',
  '運転（）': 'うんてん',
  忍び歩き: 'しのびあるき',
  追跡: 'ついせき',
  跳躍: 'ちょうやく',
  変装: 'へんそう',
  博物学: 'はくぶつがく',
  歴史: 'れきし',
  法律: 'ほうりつ',
  物理学: 'ぶつりがく',
  薬学: 'やくがく',
  機械修理: 'きかいしゅうり',
  重機械操作: 'じゅうきかいそうさ',
  乗馬: 'じょうば',
  生物学: 'せいぶつがく',
  地質学: 'ちしつがく',
  人類学: 'じんるいがく',
  医学: 'いがく',
  図書館: 'としょかん',
  ナビゲート: 'なびげーと',
  値切り: 'ねぎり',
  隠す: 'かくす',
  隠れる: 'かくれる',
  聞き耳: 'ききみみ',
  目星: 'めぼし',
  '芸術（）': 'げいじゅつ',
  '製作（）': 'せいさく',
  '操縦（）': 'そうじゅう',
  'ほかの言語（）': 'ほかのげんご',
  '母国語（）': 'ぼこくご',
  幸運: 'こううん',
  知識: 'ちしき',
  信用: 'しんよう',
  言いくるめ: 'いいくるめ',
  拳銃: 'けんじゅう',
  キック: 'きっく',
  頭突き: 'ずつき',
  マーシャルアーツ: 'まーしゃるあーつ',
  マシンガン: 'ましんがん',
  ライフル: 'らいふる',
};

const DEFAULT_SKILL_SORT_COLLATOR = new Intl.Collator('ja-JP', {
  usage: 'sort',
  sensitivity: 'base',
  numeric: true,
  ignorePunctuation: true,
});

const katakanaToHiragana = (s: string) =>
  s.replace(/[\u30A1-\u30F6]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));

const normalizeSkillLabelForSort = (s: string) =>
  katakanaToHiragana(String(s || ''))
    .replace(/[（）()[\]【】\s・／/]/g, '')
    .trim();

const normalizeSkillNameForReading = (name: string) => {
  const n = normalizeSkillNameCoc6(name);
  if (!n) return '';
  if (n.includes('（') && n.includes('）')) return n.replace(/（[^）]*）/g, '（）');
  return n;
};

export function getCoc6SkillSortKey(name: string): string {
  const normalized = normalizeSkillNameCoc6(name);
  const base = normalizeSkillNameForReading(normalized);
  const reading = JAPANESE_SKILL_READINGS[normalized] ?? JAPANESE_SKILL_READINGS[base] ?? normalizeSkillLabelForSort(base || normalized);
  return `${reading}\u0000${normalizeSkillLabelForSort(normalized)}`;
}

export function compareCoc6SkillNames(a: string, b: string): number {
  const ka = getCoc6SkillSortKey(a);
  const kb = getCoc6SkillSortKey(b);
  if (ka < kb) return -1;
  if (ka > kb) return 1;
  return DEFAULT_SKILL_SORT_COLLATOR.compare(a, b);
}

export const COC6_OPTIONAL_DETAIL_SKILL_BASES = ['ほかの言語', '母国語', '操縦', '製作', '芸術', '運転'] as const;
export type Coc6OptionalDetailSkillBase = (typeof COC6_OPTIONAL_DETAIL_SKILL_BASES)[number];

function collectOptionalDetailBases(names: Iterable<string>): Set<string> {
  const bases = new Set<string>();
  for (const name of names) {
    const parsed = parseCoc6OptionalDetailSkill(name);
    if (parsed.isOptionalDetail && parsed.detail) bases.add(parsed.base);
  }
  return bases;
}

export function parseCoc6OptionalDetailSkill(nameRaw: string): {
  isOptionalDetail: boolean;
  base: string;
  detail: string;
  normalized: string;
} {
  const normalized = normalizeSkillNameCoc6(nameRaw);
  if (!normalized) return { isOptionalDetail: false, base: '', detail: '', normalized: '' };

  const m = normalized.match(/^(.+?)（([^）]*)）$/);
  if (m) {
    const base = m[1];
    const detail = (m[2] || '').trim();
    const isOptionalDetail = (COC6_OPTIONAL_DETAIL_SKILL_BASES as readonly string[]).includes(base);
    return { isOptionalDetail, base, detail, normalized };
  }

  const isOptionalDetail = (COC6_OPTIONAL_DETAIL_SKILL_BASES as readonly string[]).includes(normalized);
  return { isOptionalDetail, base: normalized, detail: '', normalized };
}

export function formatCoc6SkillNameForDisplay(nameRaw: string): string {
  const parsed = parseCoc6OptionalDetailSkill(nameRaw);
  if (!parsed.normalized) return '';
  if (!parsed.isOptionalDetail) return parsed.normalized;
  if (!parsed.detail) return parsed.base;
  return `${parsed.base}（${parsed.detail}）`;
}

export function getCoc6SkillBaseValue(stats: CharacterStats, nameRaw: string): number {
  const name = normalizeSkillNameCoc6(nameRaw);
  if (!name) return 0;
  const compute = (v: SkillValue | undefined) => {
    if (v === undefined) return undefined;
    const n = typeof v === 'function' ? v(stats) : v;
    return Number.isFinite(n) ? Math.max(0, Math.trunc(Number(n))) : 0;
  };

  const direct = compute(COC6_SKILL_DEFAULTS[name]);
  if (direct !== undefined) return direct;

  const baseKey = normalizeSkillNameForReading(name);
  const base = compute(COC6_SKILL_DEFAULTS[baseKey]);
  if (base !== undefined) return base;

  return 0;
}

// CoC 6th edition defaults (best-effort). Values can be overridden by imported/edited skills.
export const COC6_SKILL_DEFAULTS: Record<string, SkillValue> = {
  // Derived checks (non-skill): アイデア/幸運/知識 are handled as derived values, not skills.
  '母国語（）': (s) => s.EDU * 5,
  回避: (s) => s.DEX * 2,

  // Perception / interaction
  目星: 25,
  聞き耳: 25,
  図書館: 25,
  心理学: 5,
  説得: 15,
  言いくるめ: 5,
  信用: 15,
  値切り: 5,

  // Stealth / movement
  隠れる: 10,
  忍び歩き: 10,
  追跡: 10,
  登攀: 40,
  跳躍: 25,
  水泳: 25,
  ナビゲート: 10,
  変装: 1,

  // Medical / knowledge
  応急手当: 30,
  医学: 5,
  精神分析: 1,
  オカルト: 5,
  歴史: 20,
  考古学: 1,
  人類学: 1,
  博物学: 10,
  法律: 5,
  薬学: 1,
  物理学: 1,
  化学: 1,
  生物学: 1,
  地質学: 1,
  天文学: 1,
  コンピューター: 1,
  電子工学: 1,

  // Craft / tools
  写真術: 10,
  電気修理: 10,
  機械修理: 20,
  重機械操作: 1,
  鍵開け: 1,
  隠す: 15,
  '製作（）': 5,

  // Vehicles
  '運転（）': 20,
  '操縦（）': 1,
  乗馬: 5,

  // Combat
  こぶし: 50,
  キック: 25,
  組みつき: 25,
  頭突き: 10,
  投擲: 25,
  マーシャルアーツ: 1,
  拳銃: 20,
  サブマシンガン: 15,
  ショットガン: 30,
  マシンガン: 15,
  ライフル: 25,

  // Mythos / arts
  クトゥルフ神話: 0,
  '芸術（）': 5,
  経理: 10,

  // Languages (non-native)
  'ほかの言語（）': 1,
};

export const COC6_SKILL_CATEGORIES: Array<{ key: string; label: string; skills: string[] }> = [
  {
    key: 'combat',
    label: '戦闘技能',
    skills: [
      '回避',
      'キック',
      '組み付き',
      '頭突き',
      '投擲',
      'マーシャルアーツ',
      '近接戦闘（格闘）',
      '近接戦闘（）',
      '射撃（拳銃）',
      '射撃（ライフル／ショットガン）',
      '射撃（）',
    ],
  },
  {
    key: 'explore',
    label: '探索技能',
    skills: [
      '応急手当',
      '鍵開け',
      '聞き耳',
      '鑑定',
      '精神分析',
      '追跡',
      '登攀',
      '図書館',
      '目星',
    ],
  },
  {
    key: 'action',
    label: '行動技能',
    skills: [
      '運転（自動車）',
      '運転（）',
      '機械修理',
      '重機械操作',
      '乗馬',
      '水泳',
      '操縦（）',
      '跳躍',
      '電気修理',
      'ナビゲート',
      '変装',
      '隠密',
      '手さばき',
      'サバイバル（）',
      '自然',
    ],
  },
  {
    key: 'social',
    label: '交渉技能',
    skills: ['威圧', '言いくるめ', '信用', '説得', '値切り', '魅惑'],
  },
  {
    key: 'knowledge',
    label: '知識技能',
    skills: [
      '医学',
      'オカルト',
      '科学（）',
      '化学',
      'クトゥルフ神話',
      '芸術／製作（）',
      '経理',
      '考古学',
      'コンピューター',
      '心理学',
      '人類学',
      '生物学',
      '地質学',
      '電子工学',
      '天文学',
      '博物学',
      '物理学',
      '法律',
      '薬学',
      '歴史',
      'ほかの言語（）',
      '母国語（）',
    ],
  },
];

export function getCoc6SkillCategoryLabel(nameRaw: string): string | null {
  const name = normalizeSkillNameCoc6(nameRaw);
  if (!name) return null;
  for (const c of COC6_SKILL_CATEGORIES) {
    if (c.skills.includes(name)) return c.label;
  }
  return null;
}

export function buildDefaultSkills(stats: CharacterStats): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [name, v] of Object.entries(COC6_SKILL_DEFAULTS)) {
    const n = typeof v === 'function' ? v(stats) : v;
    out[name] = Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
  }
  return out;
}

export type SkillPointBreakdown = {
  occupation: Record<string, number>;
  interest: Record<string, number>;
  other: Record<string, number>;
};

function normalizePointsMap(map: Record<string, number> | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [rawName, rawValue] of Object.entries(map || {})) {
    const name = normalizeSkillNameCoc6(rawName);
    if (!name) continue;
    if (COC6_NON_SKILL_DERIVED.has(name)) continue;
    const v = Number.isFinite(rawValue) ? Math.max(0, Math.trunc(Number(rawValue))) : 0;
    if (v <= 0) continue;
    out[name] = (out[name] ?? 0) + v;
  }
  return out;
}

function normalizeTotalsMap(map: Record<string, number> | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [rawName, rawValue] of Object.entries(map || {})) {
    const name = normalizeSkillNameCoc6(rawName);
    if (!name) continue;
    if (COC6_NON_SKILL_DERIVED.has(name)) continue;
    const v = Number.isFinite(rawValue) ? Math.max(0, Math.trunc(Number(rawValue))) : 0;
    out[name] = Math.max(out[name] ?? 0, v);
  }
  return out;
}

export function normalizeSkillPointBreakdown(breakdown: SkillPointBreakdown | undefined): SkillPointBreakdown {
  return {
    occupation: normalizePointsMap(breakdown?.occupation),
    interest: normalizePointsMap(breakdown?.interest),
    other: normalizePointsMap(breakdown?.other),
  };
}

export function normalizeSkillNameCoc6(name: string): string {
  const s = String(name || '').trim();
  if (!s) return '';
  if (s.includes('こぶし') || s.includes('パンチ')) return 'こぶし';
  if (s === '格闘') return 'こぶし';
  if (s === '組み付き') return '組みつき';
  if (s === '母国語') return '母国語（）';
  if (s === 'ほかの言語') return 'ほかの言語（）';
  if (s === '運転') return '運転（）';
  if (s === '操縦') return '操縦（）';
  if (s === '製作') return '製作（）';
  if (s === '芸術') return '芸術（）';
  if (s === '英語') return 'ほかの言語（英語）';
  return s;
}

export function buildSkillPointBreakdownFromTotals(
  stats: CharacterStats,
  totalSkills: Record<string, number> | undefined,
): SkillPointBreakdown {
  const totals = normalizeTotalsMap(totalSkills);
  const breakdown: SkillPointBreakdown = { occupation: {}, interest: {}, other: {} };

  const names = Array.from(new Set([...Object.keys(COC6_SKILL_DEFAULTS), ...Object.keys(totals)]));
  for (const nameRaw of names) {
    const name = normalizeSkillNameCoc6(nameRaw);
    if (!name) continue;
    const total = totals[name] ?? 0;
    const b = getCoc6SkillBaseValue(stats, name);
    const other = Math.max(0, total - b);
    if (other > 0) breakdown.other[name] = other;
  }
  return breakdown;
}

export function computeTotalSkills(
  stats: CharacterStats,
  breakdown: SkillPointBreakdown | undefined,
): Record<string, number> {
  const base = buildDefaultSkills(stats);
  const normalized = normalizeSkillPointBreakdown(breakdown);
  const occ = normalized.occupation;
  const intr = normalized.interest;
  const oth = normalized.other;
  const optionalDetailBases = collectOptionalDetailBases([...Object.keys(occ), ...Object.keys(intr), ...Object.keys(oth)]);
  const names = Array.from(new Set([...Object.keys(base), ...Object.keys(occ), ...Object.keys(intr), ...Object.keys(oth)]));
  const out: Record<string, number> = {};
  for (const rawName of names) {
    const name = normalizeSkillNameCoc6(rawName);
    if (!name) continue;
    {
      const p = parseCoc6OptionalDetailSkill(name);
      const isPlaceholder = p.isOptionalDetail && !p.detail && name.endsWith('（）');
      if (isPlaceholder && optionalDetailBases.has(p.base)) continue;
    }
    const total =
      getCoc6SkillBaseValue(stats, name) +
      (Number.isFinite(occ[name]) ? Math.max(0, Math.trunc(occ[name])) : 0) +
      (Number.isFinite(intr[name]) ? Math.max(0, Math.trunc(intr[name])) : 0) +
      (Number.isFinite(oth[name]) ? Math.max(0, Math.trunc(oth[name])) : 0);
    out[name] = total;
  }
  return out;
}

export function buildDerivedFromStats(stats: CharacterStats): CharacterDerived {
  const sum = stats.STR + stats.SIZ;
  const db =
    sum <= 12 ? '-1d6' :
    sum <= 16 ? '-1d4' :
    sum <= 24 ? '0' :
    sum <= 32 ? '+1d4' :
    sum <= 40 ? '+1d6' :
    '+2d6';
  return {
    HP: Math.floor((stats.CON + stats.SIZ) / 2),
    MP: stats.POW,
    SAN: stats.POW * 5,
    DB: db,
  };
}

export type PaletteEntry = { label: string; command: string };

export function buildPaletteEntries(character: Pick<Character, 'stats' | 'derived' | 'skills' | 'skill_points'>): PaletteEntry[] {
  const stats = character.stats;
  const derived = character.derived;
  const skills = character.skills || {};
  const rawSkillPoints = (character as any).skill_points as
    | { occupation?: Record<string, number>; interest?: Record<string, number>; other?: Record<string, number> }
    | undefined;

  const allocatedPointsBySkill = (() => {
    const out = new Map<string, number>();
    const add = (map: Record<string, number> | undefined) => {
      for (const [rawName, rawV] of Object.entries(map || {})) {
        const name = normalizeSkillNameCoc6(rawName);
        if (!name) continue;
        const v = Number.isFinite(rawV) ? Math.max(0, Math.trunc(Number(rawV))) : 0;
        if (v <= 0) continue;
        out.set(name, (out.get(name) ?? 0) + v);
      }
    };
    add(rawSkillPoints?.occupation);
    add(rawSkillPoints?.interest);
    add(rawSkillPoints?.other);
    return out;
  })();

  const get = (name: string) => {
    const v = skills[name];
    if (Number.isFinite(v)) return Math.max(0, Math.trunc(v));
    return getCoc6SkillBaseValue(stats, name);
  };

  const entries: PaletteEntry[] = [];
  entries.push({ label: '正気度ロール', command: `1d100<=${derived.SAN}` });
  entries.push({ label: 'アイデア', command: `1d100<=${stats.INT * 5}` });
  entries.push({ label: '幸運', command: `1d100<=${stats.POW * 5}` });
  entries.push({ label: '知識', command: `1d100<=${stats.EDU * 5}` });

  const common = ['目星', '聞き耳', '図書館', '回避', 'こぶし', 'キック', '組みつき', '投擲', '拳銃', 'ライフル', 'ショットガン'];

  const skillNames = Array.from(new Set([...common, ...Object.keys(COC6_SKILL_DEFAULTS), ...Object.keys(skills)]))
    .map(normalizeSkillNameCoc6)
    .filter((n) => n && !['アイデア', '幸運', '知識', '回避'].includes(n));

  const optionalDetailBases = collectOptionalDetailBases(skillNames);
  const filteredSkillNames = skillNames
    .filter((n) => {
      const p = parseCoc6OptionalDetailSkill(n);
      const isPlaceholder = p.isOptionalDetail && !p.detail && n.endsWith('（）');
      if (isPlaceholder && optionalDetailBases.has(p.base)) return false;
      return true;
    })
    .sort((a, b) => {
      const pa = allocatedPointsBySkill.get(a) ?? 0;
      const pb = allocatedPointsBySkill.get(b) ?? 0;
      const aHas = pa > 0;
      const bHas = pb > 0;
      if (aHas !== bHas) return aHas ? -1 : 1;
      return compareCoc6SkillNames(a, b);
    });

  for (const name of filteredSkillNames) {
    const v = get(name);
    // Skip obvious non-skill fields
    if (!name || v === 0) continue;
    entries.push({ label: formatCoc6SkillNameForDisplay(name), command: `1d100<=${v}` });
  }

  return entries;
}

export function buildPaletteTextIacharaStyle(character: Pick<Character, 'stats' | 'derived' | 'skills'>): string {
  const stats = character.stats;
  const derived = character.derived;
  const skills = character.skills || {};
  const get = (name: string) => {
    const v = skills[name];
    if (Number.isFinite(v)) return Math.max(0, Math.trunc(v));
    return getCoc6SkillBaseValue(stats, name);
  };

  const lines: string[] = [];
  lines.push(`1d100<=${derived.SAN} 【正気度ロール】`);
  lines.push(`CCB<=${stats.INT * 5} 【アイデア】`);
  lines.push(`CCB<=${stats.POW * 5} 【幸運】`);
  lines.push(`CCB<=${stats.EDU * 5} 【知識】`);

  const names = Array.from(new Set([...Object.keys(COC6_SKILL_DEFAULTS), ...Object.keys(skills)]))
    .map(normalizeSkillNameCoc6)
    .filter((n) => n && !['アイデア', '幸運', '知識'].includes(n))
    .sort(compareCoc6SkillNames);
  for (const name of names) {
    const v = get(name);
    if (!name || v === 0) continue;
    lines.push(`CCB<=${v} 【${formatCoc6SkillNameForDisplay(name)}】`);
  }

  lines.push(`CCB<=${stats.STR}*5 【STR × 5】`);
  lines.push(`CCB<=${stats.CON}*5 【CON × 5】`);
  lines.push(`CCB<=${stats.POW}*5 【POW × 5】`);
  lines.push(`CCB<=${stats.DEX}*5 【DEX × 5】`);
  lines.push(`CCB<=${stats.APP}*5 【APP × 5】`);
  lines.push(`CCB<=${stats.SIZ}*5 【SIZ × 5】`);
  lines.push(`CCB<=${stats.INT}*5 【INT × 5】`);
  lines.push(`CCB<=${stats.EDU}*5 【EDU × 5】`);
  return lines.join('\n');
}
