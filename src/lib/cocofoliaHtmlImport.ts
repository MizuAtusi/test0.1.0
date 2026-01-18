export type ParsedEntry = {
  tab: string;
  speaker: string;
  body: string;
  kind: 'chat' | 'system';
};

export type CocofoliaParseResult = {
  entries: ParsedEntry[];
  latestSanByName: Map<string, number>;
  speakers: Set<string>;
  infoItems: string[];
};

const SAN_REGEX = /^\[\s*(.+?)\s*\]\s*SAN\s*:\s*(\d+)\s*(?:→|->)\s*(\d+)/;

const decodeHtmlEntities = (raw: string) => {
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') return raw;
  const doc = new DOMParser().parseFromString(raw, 'text/html');
  return doc.documentElement.textContent ?? '';
};

const normalizeBody = (html: string) => {
  const withBreaks = html.replace(/<br\s*\/?>/gi, '\n');
  const decoded = decodeHtmlEntities(withBreaks);
  return decoded.replace(/\r\n/g, '\n').trim();
};

export const parseCocofoliaAllLogHtml = (html: string): CocofoliaParseResult => {
  const entries: ParsedEntry[] = [];
  const latestSanByName = new Map<string, number>();
  const speakers = new Set<string>();
  const infoItems: string[] = [];

  if (typeof DOMParser === 'undefined') {
    return { entries, latestSanByName, speakers, infoItems };
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const paragraphs = Array.from(doc.querySelectorAll('p'));

  for (const p of paragraphs) {
    const spans = Array.from(p.querySelectorAll('span'));
    if (spans.length < 3) continue;

    const tabRaw = spans[0]?.textContent ?? '';
    const speakerRaw = spans[1]?.textContent ?? '';
    const bodyHtml = spans[2]?.innerHTML ?? '';

    const tab = tabRaw.trim();
    const speaker = speakerRaw.trim();
    const body = normalizeBody(bodyHtml);

    if (!tab && !speaker && !body) continue;

    const kind: ParsedEntry['kind'] = speaker === 'system' ? 'system' : 'chat';
    entries.push({ tab, speaker, body, kind });

    if (tab === '[情報]' && body) {
      infoItems.push(body);
    }

    if (speaker && speaker !== 'system') {
      speakers.add(speaker);
    }

    if (speaker === 'system' && body) {
      const match = body.match(SAN_REGEX);
      if (match) {
        const name = match[1]?.trim();
        const nextSan = Number.parseInt(match[3] ?? '', 10);
        if (name && Number.isFinite(nextSan)) {
          latestSanByName.set(name, nextSan);
        }
      }
    }
  }

  return { entries, latestSanByName, speakers, infoItems };
};
