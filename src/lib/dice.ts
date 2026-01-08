import { BCDice } from 'bcdice-js';
import type { DicePayload } from '@/types/trpg';

const bcdice = new BCDice();
try {
  bcdice.setGameByTitle('Cthulhu');
} catch {
  // ignore
}

const stripLabel = (raw: string) => raw.replace(/^【|】$/g, '').trim();

const resolveToken = (token: string, skills?: Record<string, number>) => {
  const inner = (() => {
    const m = token.match(/^\{([^}]+)\}$/);
    return m ? String(m[1] ?? '').trim() : token;
  })();
  const numeric = Number.parseInt(inner, 10);
  if (Number.isFinite(numeric)) {
    return { value: numeric, skillName: undefined };
  }
  if (skills && Number.isFinite(skills[inner])) {
    return { value: skills[inner], skillName: inner };
  }
  return null;
};

const normalizeCommand = (input: string, skills?: Record<string, number>) => {
  const trimmed = input.trim();
  const parts = trimmed.match(/^(\S+)(?:\s+(.+))?$/);
  const commandPart = parts?.[1] || trimmed;
  const labelRaw = parts?.[2] || '';
  const label = labelRaw ? stripLabel(labelRaw) : '';
  let skillName = label || undefined;
  let command = commandPart;

  const ccMatch = commandPart.match(/^(CCB|CC)\s*<=\s*(.+)$/i);
  if (ccMatch) {
    const token = String(ccMatch[2] ?? '').trim();
    const resolved = resolveToken(token, skills);
    if (resolved) {
      command = `${ccMatch[1].toUpperCase()}<=${resolved.value}`;
      if (!skillName && resolved.skillName) skillName = resolved.skillName;
    }
  } else {
    const dMatch = commandPart.match(/^(\d+d\d+)\s*<=\s*(.+)$/i);
    if (dMatch) {
      const token = String(dMatch[2] ?? '').trim();
      const resolved = resolveToken(token, skills);
      if (resolved) {
        command = `${dMatch[1]}<=${resolved.value}`;
        if (!skillName && resolved.skillName) skillName = resolved.skillName;
      }
    }
  }

  const thresholdMatch = command.match(/<=\s*(\d+)/);
  const threshold = thresholdMatch ? Number.parseInt(thresholdMatch[1], 10) : undefined;

  return { command, skillName, threshold };
};

// Parse and roll dice expressions via BCDice
export function parseDiceCommand(input: string, skills?: Record<string, number>): DicePayload | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const { command, skillName, threshold } = normalizeCommand(trimmed, skills);

  const result: any = bcdice.roll(command);
  if (!result || !result.text) return null;

  const rolls: number[] = Array.isArray(result.rands)
    ? result.rands.map((r: any) => Number(r.value)).filter((v: number) => Number.isFinite(v))
    : [];
  const total = Number.isFinite(result.total)
    ? Number(result.total)
    : (rolls.length > 0 ? rolls.reduce((a, b) => a + b, 0) : 0);

  const payload: DicePayload = {
    expression: command,
    rolls,
    total,
    output: result.text,
  };

  if (threshold !== undefined) {
    payload.threshold = threshold;
  }
  if (skillName) payload.skillName = skillName;

  if (result.critical) payload.result = 'critical';
  else if (result.fumble) payload.result = 'fumble';
  else if (result.success) payload.result = 'success';
  else if (result.failure) payload.result = 'failure';

  return payload;
}

export function formatDiceResult(payload: DicePayload): string {
  if (payload.output) return payload.output;
  let result = `🎲 ${payload.expression} → [${payload.rolls.join(', ')}] = ${payload.total}`;

  if (payload.threshold !== undefined) {
    const skillPart = payload.skillName ? `${payload.skillName}(${payload.threshold})` : payload.threshold;
    result += ` (目標値: ${skillPart})`;

    switch (payload.result) {
      case 'critical':
        result += ' 【クリティカル！】';
        break;
      case 'success':
        result += ' 【成功】';
        break;
      case 'failure':
        result += ' 【失敗】';
        break;
      case 'fumble':
        result += ' 【ファンブル！】';
        break;
    }
  }

  return result;
}

export function isDiceCommand(input: string): boolean {
  const trimmed = input.trim().toLowerCase();
  return /^(cc|ccb|\d+d\d+)/.test(trimmed);
}
