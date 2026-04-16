export const KNOWN_RANKS = [
  'K I N G',
  'Regent Crow',
  'Eternal Crows',
  'Legendary Crows',
  'Black Crows',
  'Nest Crows',
] as const;

const RANK_ALIAS_MAP: Record<string, string> = {
  king: 'K I N G',
  'k i n g': 'K I N G',
  'regent crow': 'Regent Crow',
  'regent crows': 'Regent Crow',
  'eternal crow': 'Eternal Crows',
  'eternal crows': 'Eternal Crows',
  'legendary crow': 'Legendary Crows',
  'legendary crows': 'Legendary Crows',
  'black crow': 'Black Crows',
  'black crows': 'Black Crows',
  'nest crow': 'Nest Crows',
  'nest crows': 'Nest Crows',
};

export function safeDecodeURIComponent(value: string): string {
  let current = value;

  for (let i = 0; i < 2; i += 1) {
    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) break;
      current = decoded;
    } catch {
      break;
    }
  }

  return current;
}

export function normalizeUsername(value: string | null | undefined): string {
  if (!value) return '';
  return safeDecodeURIComponent(value).trim().replace(/\s+/g, ' ').toLowerCase();
}

export function canonicalizeRank(value: string | null | undefined): string {
  if (!value) return '';

  const cleaned = value.trim().replace(/\s+/g, ' ');
  const canonical = RANK_ALIAS_MAP[cleaned.toLowerCase()];

  return canonical ?? cleaned;
}

export function createRankLookup(entries: Array<{ username?: string; rank?: string }>): Map<string, string> {
  const map = new Map<string, string>();

  entries.forEach((entry) => {
    const usernameKey = normalizeUsername(entry.username);
    if (!usernameKey) return;

    const rank = canonicalizeRank(entry.rank);
    if (!rank) return;

    map.set(usernameKey, rank);
  });

  return map;
}

export function resolveRank(
  rankMap: Map<string, string>,
  username: string | null | undefined,
  fallback = '',
): string {
  const usernameKey = normalizeUsername(username);
  if (!usernameKey) return fallback;
  return rankMap.get(usernameKey) ?? fallback;
}
