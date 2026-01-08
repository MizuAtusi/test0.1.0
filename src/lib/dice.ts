import type { DicePayload } from '@/types/trpg';

// Parse and roll dice expressions like "1d100", "3d6", "1d100<=50", "1d100<=目星"
export function parseDiceCommand(input: string, skills?: Record<string, number>): DicePayload | null {
  const trimmed = input.trim();

  // Accept Cocoforia-style CoC commands: "CC<=65 目星" / "CCB<=50 【幸運】" / "CC<={SAN} 正気度ロール"
  const ccMatch =
    trimmed.match(/^(CCB|CC)\s*<=\s*([^\s]+)(?:\s+(.+))?$/i);
  if (ccMatch) {
    const token = String(ccMatch[2] ?? '').trim();
    const labelRaw = String(ccMatch[3] ?? '').trim();
    const label = labelRaw.replace(/^【|】$/g, '').trim();

    const inner = (() => {
      const m = token.match(/^\{([^}]+)\}$/);
      return m ? String(m[1] ?? '').trim() : token;
    })();
    const numeric = Number.parseInt(inner, 10);
    if (Number.isFinite(numeric)) {
      return parseDiceCommand(`1d100<=${numeric}`, skills);
    }
    // token is a skill/stat macro name
    const fromSkills = skills && skills[inner];
    if (Number.isFinite(fromSkills)) {
      const payload = parseDiceCommand(`1d100<=${fromSkills}`, skills);
      if (payload && label) payload.skillName = label;
      return payload;
    }
    // Try label as skill name
    if (label && skills && Number.isFinite(skills[label])) {
      const payload = parseDiceCommand(`1d100<=${skills[label]}`, skills);
      if (payload) payload.skillName = label;
      return payload;
    }
    return null;
  }
  
  // Match patterns like: 1d100, 3d6, 1d100<=50, 1d100<=技能名
  const dicePattern = /^(\d+)d(\d+)(?:<=(\d+|\{[^}]+\}|[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf\w]+))?$/i;
  const match = trimmed.match(dicePattern);
  
  if (!match) return null;
  
  const numDice = parseInt(match[1], 10);
  const diceSize = parseInt(match[2], 10);
  const thresholdPart = match[3];
  
  if (numDice < 1 || numDice > 100 || diceSize < 1 || diceSize > 1000) {
    return null;
  }
  
  // Roll the dice
  const rolls: number[] = [];
  for (let i = 0; i < numDice; i++) {
    rolls.push(Math.floor(Math.random() * diceSize) + 1);
  }
  const total = rolls.reduce((a, b) => a + b, 0);
  
  const payload: DicePayload = {
    expression: `${numDice}d${diceSize}`,
    rolls,
    total,
  };
  
  // Handle threshold check
  if (thresholdPart) {
    let threshold: number;
    const inner = (() => {
      const m = String(thresholdPart).match(/^\{([^}]+)\}$/);
      return m ? String(m[1] ?? '').trim() : String(thresholdPart);
    })();
    const numericThreshold = parseInt(inner, 10);
    
    if (!isNaN(numericThreshold)) {
      threshold = numericThreshold;
    } else if (skills && skills[inner] !== undefined) {
      threshold = skills[inner];
      payload.skillName = inner;
    } else {
      // Unknown skill name, treat as regular roll
      payload.skillName = inner;
      payload.threshold = 0;
      payload.result = 'failure';
      return payload;
    }
    
    payload.threshold = threshold;
    
    // CoC 6th edition rules:
    // 1-5: Critical success (always)
    // 96-100: Fumble (always, if threshold < 100)
    // <= threshold: Success
    // > threshold: Failure
    if (diceSize === 100 && numDice === 1) {
      if (total <= 5) {
        payload.result = 'critical';
      } else if (total >= 96 && threshold < 100) {
        payload.result = 'fumble';
      } else if (total <= threshold) {
        payload.result = 'success';
      } else {
        payload.result = 'failure';
      }
    } else {
      // For non-d100, simple comparison
      if (total <= threshold) {
        payload.result = 'success';
      } else {
        payload.result = 'failure';
      }
    }
  }
  
  return payload;
}

export function formatDiceResult(payload: DicePayload): string {
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
  return /^\d+d\d+/.test(trimmed);
}
