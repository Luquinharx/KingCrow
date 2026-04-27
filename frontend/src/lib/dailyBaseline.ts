import { normalizeUsername } from './rank';

const DAILY_LOOT_BASELINE_KEY = 'scrap_daily_loot_baseline_v1';

type BaselineStore = Record<string, number>;

interface SnapshotPoint {
  value: number;
  ts: number;
}

type DailyDataShape = Record<string, unknown>;

function readStore(): BaselineStore {
  try {
    const raw = localStorage.getItem(DAILY_LOOT_BASELINE_KEY);
    if (!raw) return {};

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    const out: BaselineStore = {};
    Object.entries(parsed as Record<string, unknown>).forEach(([key, value]) => {
      if (typeof value !== 'number' || !Number.isFinite(value)) return;
      out[key] = value;
    });

    return out;
  } catch {
    return {};
  }
}

function writeStore(store: BaselineStore): void {
  try {
    localStorage.setItem(DAILY_LOOT_BASELINE_KEY, JSON.stringify(store));
  } catch {
    // Ignore storage errors and keep current session running.
  }
}

export function getOrCreateDailyLootBaseline(username: string, currentAllLoot: number): { baseline: number; isNew: boolean } {
  const key = normalizeUsername(username);
  if (!key) {
    return { baseline: Math.max(0, currentAllLoot), isNew: true };
  }

  const store = readStore();
  const existing = store[key];

  if (typeof existing === 'number' && Number.isFinite(existing)) {
    return { baseline: existing, isNew: false };
  }

  const baseline = Math.max(0, currentAllLoot);
  store[key] = baseline;
  writeStore(store);

  return { baseline, isNew: true };
}

function toLootNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(String(value).replace(/[^\d-]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseSnapshotNumber(snapshot: Record<string, unknown>, fieldNames: string[]): number | null {
  for (const fieldName of fieldNames) {
    const value = toLootNumber(snapshot[fieldName]);
    if (value !== null) return value;
  }

  return null;
}

function parseSnapshotTimestamp(dateKey: string, snapshot: Record<string, unknown>, hourKey?: string): number | null {
  const collectedAt = snapshot.collected_at;
  if (typeof collectedAt === 'string') {
    const parsed = Date.parse(collectedAt);
    if (Number.isFinite(parsed)) return parsed;
  }

  if (hourKey && /^\d{2}-\d{2}$/.test(hourKey)) {
    const hh = hourKey.slice(0, 2);
    const mm = hourKey.slice(3, 5);
    const parsed = Date.parse(`${dateKey}T${hh}:${mm}:00-03:00`);
    if (Number.isFinite(parsed)) return parsed;
  }

  const fallback = Date.parse(`${dateKey}T08:00:00-03:00`);
  return Number.isFinite(fallback) ? fallback : null;
}

function getSnapshotUsername(snapshotKey: string, snapshot: Record<string, unknown>): string {
  if (typeof snapshot.username === 'string') return snapshot.username;

  try {
    return decodeURIComponent(snapshotKey);
  } catch {
    return snapshotKey;
  }
}

function tryPushSnapshot(
  out: SnapshotPoint[],
  targetUsername: string,
  snapshotKey: string,
  snapshotValue: unknown,
  dateKey: string,
  fieldNames: string[],
  hourKey?: string,
): void {
  if (!snapshotValue || typeof snapshotValue !== 'object') return;

  const snapshot = snapshotValue as Record<string, unknown>;
  const snapshotUsername = normalizeUsername(getSnapshotUsername(snapshotKey, snapshot));
  if (!snapshotUsername || snapshotUsername !== targetUsername) return;

  const value = parseSnapshotNumber(snapshot, fieldNames);
  if (value === null) return;

  const ts = parseSnapshotTimestamp(dateKey, snapshot, hourKey);
  if (ts === null) return;

  out.push({ value, ts });
}

function getSaoPauloNowParts(now: Date): { year: number; month: number; day: number; hour: number } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const map: Record<string, string> = {};
  parts.forEach(({ type, value }) => {
    map[type] = value;
  });

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
  };
}

export function getCurrentSaoPauloResetBoundary(now: Date = new Date()): number {
  const { year, month, day, hour } = getSaoPauloNowParts(now);

  // 08:00 in Sao Paulo is currently UTC-03:00 => 11:00 UTC
  let resetMs = Date.UTC(year, month - 1, day, 11, 0, 0);
  if (hour < 8) {
    resetMs -= 24 * 60 * 60 * 1000;
  }

  return resetMs;
}

export function resolveDailyLootBaselineFromDailyData(
  dailyData: DailyDataShape,
  username: string,
  encodedUsernameKey: string,
  currentAllLoot: number,
): number | null {
  return resolveDailyValueBaselineFromDailyData(
    dailyData,
    username,
    encodedUsernameKey,
    currentAllLoot,
    ['all_time_loots', 'alltimeloot'],
  );
}

export function resolveDailyValueBaselineFromDailyData(
  dailyData: DailyDataShape,
  username: string,
  encodedUsernameKey: string,
  currentValue: number,
  fieldNames: string[],
): number | null {
  if (!dailyData || typeof dailyData !== 'object') return null;

  const targetUsername = normalizeUsername(username);
  if (!targetUsername) return null;

  const points: SnapshotPoint[] = [];

  Object.entries(dailyData).forEach(([dateKey, dayValue]) => {
    if (!dayValue || typeof dayValue !== 'object') return;

    const dayUsers = dayValue as Record<string, unknown>;

    if (Object.prototype.hasOwnProperty.call(dayUsers, encodedUsernameKey)) {
      tryPushSnapshot(points, targetUsername, encodedUsernameKey, dayUsers[encodedUsernameKey], dateKey, fieldNames);
    }

    Object.entries(dayUsers).forEach(([snapshotKey, snapshotValue]) => {
      if (snapshotKey === encodedUsernameKey) return;

      if (snapshotKey === 'hourly' && snapshotValue && typeof snapshotValue === 'object') {
        const hourlyContainer = snapshotValue as Record<string, unknown>;
        Object.entries(hourlyContainer).forEach(([hourKey, hourUsersValue]) => {
          if (!hourUsersValue || typeof hourUsersValue !== 'object') return;
          const hourUsers = hourUsersValue as Record<string, unknown>;

          if (Object.prototype.hasOwnProperty.call(hourUsers, encodedUsernameKey)) {
            tryPushSnapshot(points, targetUsername, encodedUsernameKey, hourUsers[encodedUsernameKey], dateKey, fieldNames, hourKey);
          }

          Object.entries(hourUsers).forEach(([hourSnapshotKey, hourSnapshotValue]) => {
            if (hourSnapshotKey === encodedUsernameKey) return;
            tryPushSnapshot(points, targetUsername, hourSnapshotKey, hourSnapshotValue, dateKey, fieldNames, hourKey);
          });
        });
        return;
      }

      tryPushSnapshot(points, targetUsername, snapshotKey, snapshotValue, dateKey, fieldNames);
    });
  });

  if (!points.length) return null;

  points.sort((a, b) => a.ts - b.ts);

  const resetMs = getCurrentSaoPauloResetBoundary();
  const nowMs = Date.now();

  const beforeOrAtReset = points.filter((point) => point.ts <= resetMs);
  const afterReset = points.filter((point) => point.ts > resetMs && point.ts <= nowMs);

  let chosen: SnapshotPoint | null = null;

  if (afterReset.length > 0) {
    chosen = afterReset[0];
  } else if (beforeOrAtReset.length > 0) {
    chosen = beforeOrAtReset[beforeOrAtReset.length - 1];
  } else {
    chosen = points[points.length - 1];
  }

  if (!chosen) return null;

  if (chosen.value === 0 && currentValue > 0) {
    const beforeNonZero = beforeOrAtReset.filter((point) => point.value > 0);
    const afterNonZero = afterReset.filter((point) => point.value > 0);

    if (afterNonZero.length > 0) {
      chosen = afterNonZero[0];
    } else if (beforeNonZero.length > 0) {
      chosen = beforeNonZero[beforeNonZero.length - 1];
    }
  }

  return Math.max(0, chosen.value);
}
