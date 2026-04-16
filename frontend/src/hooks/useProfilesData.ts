import { useState, useEffect } from 'react';
import {
  canonicalizeRank,
  createRankLookup,
  normalizeUsername,
  resolveRank,
  safeDecodeURIComponent,
} from '../lib/rank';

const FIREBASE_URL = "https://dead-bb-default-rtdb.firebaseio.com";
const REFRESH_MS = 5 * 60 * 1000;
const PROFILES_BACKUP_KEY = 'scrap_profiles_backup_v2';

export interface MemberProfile {
  username: string;
  collected_at: string;

  // TS Records
  weekly_ts: number;
  clan_weekly_ts: number;
  exp_since_death: number;
  all_time_ts: number;
  daily_ts_calc?: number;
  total_exp: number;
  expected_loss_on_death: number;

  // TPK Records
  daily_tpk: number;
  weekly_tpk: number;
  clan_weekly_tpk: number;
  all_time_tpk: number;
  last_players_killed: string;
  last_hit_by: string;

  // Loot Records
  weekly_loots: number;
  all_time_loots: number;
  clan_weekly_loots: number;
  all_time_clan_loots: number;

  // Misc
  last_clan_join: string;

  // Rank
  rank: string;
  rank_score: number;
}

interface ProfilesBackup {
  updatedAt: string;
  profiles: MemberProfile[];
}

function toStringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function toNumberValue(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function readProfilesBackup(): ProfilesBackup | null {
  try {
    const raw = localStorage.getItem(PROFILES_BACKUP_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;

    const maybeBackup = parsed as Partial<ProfilesBackup>;
    if (!Array.isArray(maybeBackup.profiles)) return null;

    return {
      updatedAt: typeof maybeBackup.updatedAt === 'string' ? maybeBackup.updatedAt : '',
      profiles: maybeBackup.profiles as MemberProfile[],
    };
  } catch {
    return null;
  }
}

function saveProfilesBackup(profiles: MemberProfile[]): void {
  try {
    const payload: ProfilesBackup = {
      updatedAt: new Date().toISOString(),
      profiles,
    };

    localStorage.setItem(PROFILES_BACKUP_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage errors and continue with in-memory data.
  }
}

function parseProfiles(rawProfiles: unknown, rawDailyData: unknown): MemberProfile[] {
  if (!rawProfiles || typeof rawProfiles !== 'object') return [];

  const profilesRecord = rawProfiles as Record<string, unknown>;
  const dailyData = (rawDailyData && typeof rawDailyData === 'object'
    ? rawDailyData
    : {}) as Record<string, Record<string, { total_exp?: unknown }>>;

  const dates = Object.keys(dailyData).sort();

  const getBaselineExp = (dbUserKey: string): number | null => {
    for (let i = dates.length - 1; i >= 0; i -= 1) {
      const userSnap = dailyData[dates[i]]?.[dbUserKey];
      if (userSnap && userSnap.total_exp !== undefined) {
        return toNumberValue(userSnap.total_exp);
      }
    }
    return null;
  };

  const dailyRankByUsername = new Map<string, string>();

  for (let i = dates.length - 1; i >= 0; i -= 1) {
    const dayUsers = dailyData[dates[i]];
    if (!dayUsers || typeof dayUsers !== 'object') continue;

    Object.entries(dayUsers).forEach(([dailyKey, dailyValue]) => {
      const dailyUser = (dailyValue ?? {}) as Record<string, unknown>;
      const usernameRaw = toStringValue(dailyUser.username) || safeDecodeURIComponent(dailyKey);
      const usernameKey = normalizeUsername(usernameRaw);
      if (!usernameKey || dailyRankByUsername.has(usernameKey)) return;

      const rank = canonicalizeRank(toStringValue(dailyUser.rank));
      if (!rank) return;

      dailyRankByUsername.set(usernameKey, rank);
    });
  }

  const parsedProfiles: MemberProfile[] = [];

  Object.entries(profilesRecord).forEach(([dbKey, value]) => {
    const p = (value ?? {}) as Record<string, unknown>;
    const usernameRaw = toStringValue(p.username) || safeDecodeURIComponent(dbKey);
    const username = safeDecodeURIComponent(usernameRaw).trim();

    if (!username) return;

    const totalExp = toNumberValue(p.total_exp);
    const dbUserKey = encodeURIComponent(username).replace(/\./g, "%2E");
    const baselineExp = getBaselineExp(dbUserKey);
    const dailyTSCalc = baselineExp !== null ? Math.max(0, totalExp - baselineExp) : 0;

    const directRank = canonicalizeRank(toStringValue(p.rank));
    const fallbackRank = dailyRankByUsername.get(normalizeUsername(username)) ?? '';

    parsedProfiles.push({
      username,
      collected_at: toStringValue(p.collected_at),
      weekly_ts: toNumberValue(p.weekly_ts),
      clan_weekly_ts: toNumberValue(p.clan_weekly_ts),
      exp_since_death: toNumberValue(p.exp_since_death),
      all_time_ts: toNumberValue(p.all_time_ts),
      daily_ts_calc: dailyTSCalc,
      total_exp: totalExp,
      expected_loss_on_death: toNumberValue(p.expected_loss_on_death),
      daily_tpk: toNumberValue(p.daily_tpk),
      weekly_tpk: toNumberValue(p.weekly_tpk),
      clan_weekly_tpk: toNumberValue(p.clan_weekly_tpk),
      all_time_tpk: toNumberValue(p.all_time_tpk),
      last_players_killed: toStringValue(p.last_players_killed),
      last_hit_by: toStringValue(p.last_hit_by),
      weekly_loots: toNumberValue(p.weekly_loots),
      all_time_loots: toNumberValue(p.all_time_loots),
      clan_weekly_loots: toNumberValue(p.clan_weekly_loots),
      all_time_clan_loots: toNumberValue(p.all_time_clan_loots),
      last_clan_join: toStringValue(p.last_clan_join),
      rank: directRank || fallbackRank,
      rank_score: toNumberValue(p.rank_score),
    });
  });

  return parsedProfiles;
}

export function useProfilesData() {
  const [profiles, setProfiles] = useState<MemberProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const backup = readProfilesBackup();
    if (backup?.profiles.length) {
      setProfiles(backup.profiles);
      setLoading(false);
    }

    async function load() {
      try {
        const [profRes, dailyRes] = await Promise.all([
          fetch(`${FIREBASE_URL}/profiles.json`),
          fetch(`${FIREBASE_URL}/daily.json`)
        ]);

        if (!profRes.ok) {
          throw new Error(`profiles fetch failed: ${profRes.status}`);
        }

        const data = await profRes.json();
        const dailyData = dailyRes.ok ? await dailyRes.json() : {};
        const parsedProfiles = parseProfiles(data, dailyData);
        const currentBackup = readProfilesBackup() ?? backup;
        const backupRankMap = createRankLookup(currentBackup?.profiles ?? []);

        if (parsedProfiles.length > 0) {
          const mergedProfiles = parsedProfiles.map((profile) => {
            if (profile.rank) return profile;

            const backupRank = resolveRank(backupRankMap, profile.username, '');
            if (!backupRank) return profile;

            return {
              ...profile,
              rank: backupRank,
            };
          });

          setProfiles(mergedProfiles);
          saveProfilesBackup(mergedProfiles);
        } else {
          const fallbackBackup = readProfilesBackup();
          if (fallbackBackup?.profiles.length) {
            setProfiles(fallbackBackup.profiles);
          }
        }
      } catch (error) {
        console.error('Failed to fetch profiles:', error);
        const fallbackBackup = readProfilesBackup();
        if (fallbackBackup?.profiles.length) {
          setProfiles(fallbackBackup.profiles);
        } else {
          setProfiles([]);
        }
      } finally {
        setLoading(false);
      }
    }

    load();

    // Auto refresh every 5 min
    const interval = setInterval(load, REFRESH_MS);
    return () => clearInterval(interval);
  }, []);

  return { profiles, loading };
}
