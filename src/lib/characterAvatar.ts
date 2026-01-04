const STORAGE_PREFIX = 'trpg:characterAvatar:';

export type CharacterAvatarState = {
  url: string;
  scale: number;
  offsetX: number;
  offsetY: number;
};

export function getCharacterAvatarState(characterId: string): CharacterAvatarState | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${characterId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CharacterAvatarState>;
    if (typeof parsed.url !== 'string' || !parsed.url.trim()) return null;
    return {
      url: parsed.url,
      scale: typeof parsed.scale === 'number' ? parsed.scale : 1,
      offsetX: typeof parsed.offsetX === 'number' ? parsed.offsetX : 0,
      offsetY: typeof parsed.offsetY === 'number' ? parsed.offsetY : 0,
    };
  } catch {
    return null;
  }
}

export function getCharacterAvatarUrl(characterId: string): string | null {
  return getCharacterAvatarState(characterId)?.url ?? null;
}

export function setCharacterAvatarState(characterId: string, state: CharacterAvatarState) {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${characterId}`, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export function setCharacterAvatarUrl(characterId: string, url: string) {
  const prev = getCharacterAvatarState(characterId);
  setCharacterAvatarState(characterId, {
    url,
    scale: prev?.scale ?? 1,
    offsetX: prev?.offsetX ?? 0,
    offsetY: prev?.offsetY ?? 0,
  });
}

export function clearCharacterAvatar(characterId: string) {
  try {
    localStorage.removeItem(`${STORAGE_PREFIX}${characterId}`);
  } catch {
    // ignore
  }
}
