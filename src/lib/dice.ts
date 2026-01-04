import type { DicePayload } from '@/types/trpg';

// Parse and roll dice expressions like "1d100", "3d6", "1d100<=50", "1d100<=目星"
export function parseDiceCommand(input: string, skills?: Record<string, number>): DicePayload | null {
  const trimmed = input.trim();
  
  // Match patterns like: 1d100, 3d6, 1d100<=50, 1d100<=技能名
  const dicePattern = /^(\d+)d(\d+)(?:<=(\d+|[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf\w]+))?$/i;
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
    const numericThreshold = parseInt(thresholdPart, 10);
    
    if (!isNaN(numericThreshold)) {
      threshold = numericThreshold;
    } else if (skills && skills[thresholdPart] !== undefined) {
      threshold = skills[thresholdPart];
      payload.skillName = thresholdPart;
    } else {
      // Unknown skill name, treat as regular roll
      payload.skillName = thresholdPart;
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
