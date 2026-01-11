// Parse expression tags from message text
// Format: {tag} anywhere in the message

export interface ParsedMessage {
  tag: string | null;
  text: string;
}

export function parseExpressionTag(text: string): ParsedMessage {
  const match = text.match(/^\{([^}]+)\}\s*/);
  
  if (match) {
    return {
      tag: match[1].toLowerCase(),
      text: text.slice(match[0].length),
    };
  }
  
  return {
    tag: null,
    text,
  };
}

export interface ParsedMessageWithTags {
  tags: string[];
  text: string;
}

export function parseExpressionTags(text: string): ParsedMessageWithTags {
  const tags: string[] = [];
  const cleaned = text.replace(/\{([^}]+)\}/g, (_full, tag: string) => {
    const normalized = String(tag).trim().toLowerCase();
    if (normalized) tags.push(normalized);
    return '';
  });

  return {
    tags,
    text: cleaned.replace(/\s{2,}/g, ' ').trim(),
  };
}

export function getDisplayText(text: string): string {
  // Remove any {tag} occurrences
  const withoutTags = parseExpressionTags(text).text;

  // Remove command lines like [bg:...], [portrait:...], [bgm:...], [se:...], [speaker:...]
  // Keep this permissive so even embedded commands don't show in chat.
  const withoutCommands = withoutTags
    .replace(/\[(bg|portrait|bgm|se|speaker|npc_disclosure|effects_config|effects_other|portrait_transform):[^\]]+\]\n?/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return withoutCommands;
}
