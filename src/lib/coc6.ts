import type { CharacterStats, CharacterDerived, Character } from '@/types/trpg';

type SkillValue = number | ((stats: CharacterStats) => number);

// CoC 6th edition-ish defaults (best-effort). Values can be overridden by imported/edited skills.
export const COC6_SKILL_DEFAULTS: Record<string, SkillValue> = {
  // Derived checks
  アイデア: (s) => s.INT * 5,
  幸運: (s) => s.POW * 5,
  知識: (s) => s.EDU * 5,
  母国語: (s) => s.EDU * 5,
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
  製作: 5,

  // Vehicles
  運転: 20,
  操縦: 1,
  乗馬: 5,

  // Combat
  格闘: 50, // こぶし(パンチ)相当
  キック: 25,
  組み付き: 25,
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
  芸術: 5,
  経理: 10,

  // Languages (non-native)
  英語: 1,
};

export const COC6_SKILL_CATEGORIES: Array<{ key: string; label: string; skills: string[] }> = [
  {
    key: 'combat',
    label: '戦闘技能',
    skills: [
      '回避',
      'キック',
      '組み付き',
      '格闘',
      '頭突き',
      '投擲',
      'マーシャルアーツ',
      '拳銃',
      'サブマシンガン',
      'ショットガン',
      'マシンガン',
      'ライフル',
    ],
  },
  {
    key: 'explore',
    label: '探索技能',
    skills: [
      '応急手当',
      '鍵開け',
      '隠す',
      '隠れる',
      '聞き耳',
      '忍び歩き',
      '写真術',
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
      '運転',
      '機械修理',
      '重機械操作',
      '乗馬',
      '水泳',
      '製作',
      '操縦',
      '跳躍',
      '電気修理',
      'ナビゲート',
      '変装',
    ],
  },
  {
    key: 'social',
    label: '交渉技能',
    skills: ['言いくるめ', '信用', '説得', '値切り', '母国語'],
  },
  {
    key: 'knowledge',
    label: '知識技能',
    skills: [
      '医学',
      'オカルト',
      '化学',
      'クトゥルフ神話',
      '芸術',
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

export function normalizeSkillNameCoc6(name: string): string {
  const s = String(name || '').trim();
  if (!s) return '';
  if (s.includes('こぶし') || s.includes('パンチ')) return '格闘';
  return s;
}

export function buildSkillPointBreakdownFromTotals(
  stats: CharacterStats,
  totalSkills: Record<string, number> | undefined,
): SkillPointBreakdown {
  const base = buildDefaultSkills(stats);
  const totals = totalSkills || {};
  const breakdown: SkillPointBreakdown = { occupation: {}, interest: {}, other: {} };

  const names = Array.from(new Set([...Object.keys(base), ...Object.keys(totals)]));
  for (const rawName of names) {
    const name = normalizeSkillNameCoc6(rawName);
    if (!name) continue;
    const t = totals[rawName] ?? totals[name];
    const total = Number.isFinite(t) ? Math.max(0, Math.trunc(Number(t))) : 0;
    const b = base[name] ?? 0;
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
  const occ = breakdown?.occupation || {};
  const intr = breakdown?.interest || {};
  const oth = breakdown?.other || {};
  const names = Array.from(new Set([...Object.keys(base), ...Object.keys(occ), ...Object.keys(intr), ...Object.keys(oth)]));
  const out: Record<string, number> = {};
  for (const rawName of names) {
    const name = normalizeSkillNameCoc6(rawName);
    if (!name) continue;
    const total =
      (base[name] ?? 0) +
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

export function buildPaletteEntries(character: Pick<Character, 'stats' | 'derived' | 'skills'>): PaletteEntry[] {
  const stats = character.stats;
  const derived = character.derived;
  const skills = character.skills || {};
  const defaults = buildDefaultSkills(stats);
  const get = (name: string) => {
    const v = skills[name];
    if (Number.isFinite(v)) return Math.max(0, Math.trunc(v));
    const d = defaults[name];
    if (Number.isFinite(d)) return Math.max(0, Math.trunc(d));
    return 0;
  };

  const entries: PaletteEntry[] = [];
  entries.push({ label: '正気度ロール', command: `1d100<=${derived.SAN}` });
  entries.push({ label: 'アイデア', command: `1d100<=${stats.INT * 5}` });
  entries.push({ label: '幸運', command: `1d100<=${stats.POW * 5}` });
  entries.push({ label: '知識', command: `1d100<=${stats.EDU * 5}` });

  // Common first (matches UI expectations)
  const common = ['目星', '聞き耳', '図書館', '回避', '格闘', 'キック', '組み付き', '投擲', '拳銃', 'ライフル', 'ショットガン'];
  for (const name of common) {
    entries.push({ label: name, command: `1d100<=${get(name)}` });
  }

  // Rest of skills, sorted
  const skillNames = Array.from(new Set([...Object.keys(defaults), ...Object.keys(skills)]))
    .filter((n) => !['アイデア', '幸運', '知識', '母国語', '回避'].includes(n))
    .sort((a, b) => a.localeCompare(b, 'ja'));
  for (const name of skillNames) {
    if (common.includes(name)) continue;
    const v = get(name);
    // Skip obvious non-skill fields
    if (!name || v === 0) continue;
    entries.push({ label: name, command: `1d100<=${v}` });
  }

  return entries;
}

export function buildPaletteTextIacharaStyle(character: Pick<Character, 'stats' | 'derived' | 'skills'>): string {
  const stats = character.stats;
  const derived = character.derived;
  const skills = character.skills || {};
  const defaults = buildDefaultSkills(stats);
  const get = (name: string) => {
    const v = skills[name];
    if (Number.isFinite(v)) return Math.max(0, Math.trunc(v));
    const d = defaults[name];
    if (Number.isFinite(d)) return Math.max(0, Math.trunc(d));
    return 0;
  };

  const lines: string[] = [];
  lines.push(`1d100<=${derived.SAN} 【正気度ロール】`);
  lines.push(`CCB<=${stats.INT * 5} 【アイデア】`);
  lines.push(`CCB<=${stats.POW * 5} 【幸運】`);
  lines.push(`CCB<=${stats.EDU * 5} 【知識】`);

  const names = Array.from(new Set([...Object.keys(defaults), ...Object.keys(skills)]))
    .filter((n) => !['アイデア', '幸運', '知識'].includes(n))
    .sort((a, b) => a.localeCompare(b, 'ja'));
  for (const name of names) {
    const v = get(name);
    if (!name || v === 0) continue;
    lines.push(`CCB<=${v} 【${name}】`);
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
