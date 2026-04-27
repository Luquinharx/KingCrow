import { useEffect, useMemo, useState } from 'react';
import { get, ref } from 'firebase/database';
import { rtdb } from '../lib/firebase';
import { normalizeUsername, safeDecodeURIComponent } from '../lib/rank';

export interface AuditUserRow {
  username: string;
  email: string;
  discord: string;
  access: string;
  rank: string;
  monthlyLoot: number;
  monthlyTs: number;
  activeDays: number;
  inactiveDays: number;
  donations: number;
  score: number;
  lastSeen: string;
}

interface SnapshotPoint {
  date: string;
  loot: number;
  totalExp: number;
  rank: string;
  collectedAt: string;
}

interface UserBucket {
  username: string;
  email: string;
  discord: string;
  access: string;
  points: SnapshotPoint[];
}

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function monthKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function elapsedDaysInMonth(now = new Date()): number {
  return now.getDate();
}

function parseDonationDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;

  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;

  const [, mm, dd, yyyy, hh, min, meridiem] = match;
  let hour = Number(hh);
  if (meridiem.toUpperCase() === 'PM' && hour !== 12) hour += 12;
  if (meridiem.toUpperCase() === 'AM' && hour === 12) hour = 0;

  return new Date(Number(yyyy), Number(mm) - 1, Number(dd), hour, Number(min));
}

function donationAmount(value: unknown): number {
  return toNumber(value);
}

function scoreRows(rows: Omit<AuditUserRow, 'score'>[]): AuditUserRow[] {
  const maxLoot = Math.max(1, ...rows.map(row => row.monthlyLoot));
  const maxTs = Math.max(1, ...rows.map(row => row.monthlyTs));
  const maxDonations = Math.max(1, ...rows.map(row => row.donations));
  const days = Math.max(1, elapsedDaysInMonth());

  return rows.map(row => {
    const activeRatio = row.activeDays / days;
    const lootRatio = row.monthlyLoot / maxLoot;
    const tsRatio = row.monthlyTs / maxTs;
    const donationRatio = row.donations / maxDonations;

    const score = Math.round(Math.min(100,
      activeRatio * 45 +
      lootRatio * 20 +
      tsRatio * 20 +
      donationRatio * 15
    ));

    return { ...row, score };
  });
}

export function useAdminAuditData() {
  const [rows, setRows] = useState<AuditUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');

      try {
        const [usersSnap, profilesSnap, dailySnap, runsSnap] = await Promise.all([
          get(ref(rtdb, 'usuarios')),
          get(ref(rtdb, 'profiles')),
          get(ref(rtdb, 'daily')),
          get(ref(rtdb, 'clan_logs/runs')),
        ]);

        const users = usersSnap.val() ?? {};
        const profiles = profilesSnap.val() ?? {};
        const daily = dailySnap.val() ?? {};
        const runs = runsSnap.val() ?? {};
        const currentMonth = monthKey();
        const elapsedDays = elapsedDaysInMonth();
        const byUser = new Map<string, UserBucket>();

        Object.values((users ?? {}) as Record<string, any>).forEach(value => {
          const user = value ?? {};
          const username = safeDecodeURIComponent(String(user.nickJogo || user.nick || user.email || '')).trim();
          const key = normalizeUsername(username);
          if (!key) return;

          byUser.set(key, {
            username,
            email: String(user.email || ''),
            discord: String(user.discord || ''),
            access: String(user.cargo || ''),
            points: [],
          });
        });

        Object.entries((profiles ?? {}) as Record<string, any>).forEach(([rawKey, value]) => {
          const profile = value ?? {};
          const username = safeDecodeURIComponent(String(profile.username || rawKey)).trim();
          const key = normalizeUsername(username);
          if (!key) return;

          const existing = byUser.get(key) ?? {
            username,
            email: '',
            discord: '',
            access: '',
            points: [],
          };

          byUser.set(key, {
            ...existing,
            username: existing.username || username,
            points: [...existing.points, {
              date: profile.collected_at ? String(profile.collected_at).slice(0, 10) : currentMonth,
              loot: toNumber(profile.all_time_loots),
              totalExp: toNumber(profile.total_exp),
              rank: String(profile.rank || ''),
              collectedAt: String(profile.collected_at || ''),
            }],
          });
        });

        Object.entries((daily ?? {}) as Record<string, Record<string, any>>).forEach(([date, day]) => {
          if (!day || typeof day !== 'object') return;

          Object.entries(day).forEach(([rawKey, value]) => {
            if (rawKey === 'hourly' || !value || typeof value !== 'object') return;

            const snap = value as Record<string, unknown>;
            const username = safeDecodeURIComponent(String(snap.username || rawKey)).trim();
            const key = normalizeUsername(username);
            if (!key) return;

            const existing = byUser.get(key) ?? {
              username,
              email: '',
              discord: '',
              access: '',
              points: [],
            };
            existing.points.push({
              date,
              loot: toNumber(snap.all_time_loots ?? snap.alltimeloot),
              totalExp: toNumber(snap.total_exp),
              rank: String(snap.rank || ''),
              collectedAt: String(snap.collected_at || ''),
            });
            byUser.set(key, existing);
          });
        });

        const donations = new Map<string, number>();
        const donationLogs = new Map<string, any>();

        Object.values((runs ?? {}) as Record<string, any>).forEach(run => {
          Object.entries((run?.bank ?? {}) as Record<string, any>).forEach(([entryId, entry]) => {
            if (entry?.fields) donationLogs.set(entryId, entry.fields);
          });
        });

        donationLogs.forEach(fields => {
            if (fields.action !== 'give') return;

            const date = parseDonationDate(fields.time);
            if (!date || monthKey(date) !== currentMonth) return;

            const key = normalizeUsername(String(fields.username || ''));
            if (!key) return;

            donations.set(key, (donations.get(key) || 0) + donationAmount(fields.currency));
        });

        const rawRows = Array.from(byUser.entries()).map(([key, user]) => {
          const points = user.points
            .filter(point => point.loot > 0 || point.totalExp > 0)
            .sort((a, b) => a.date.localeCompare(b.date) || a.collectedAt.localeCompare(b.collectedAt));
          const monthPoints = points.filter(point => point.date.startsWith(currentMonth));
          const beforeMonth = points.filter(point => point.date < `${currentMonth}-01`).at(-1);
          const baseline = beforeMonth ?? monthPoints[0];
          const latest = monthPoints.at(-1) ?? points.at(-1);
          const rank = latest?.rank || monthPoints.find(point => point.rank)?.rank || '';

          const activeDates = new Set<string>();
          let previous = beforeMonth;

          monthPoints.forEach(point => {
            const lootDelta = previous ? Math.max(0, point.loot - previous.loot) : 0;
            const tsDelta = previous ? Math.max(0, point.totalExp - previous.totalExp) : 0;
            if (lootDelta > 0 || tsDelta > 0) activeDates.add(point.date);
            previous = point;
          });

          return {
            username: user.username,
            email: user.email,
            discord: user.discord,
            access: user.access,
            rank,
            monthlyLoot: latest && baseline ? Math.max(0, latest.loot - baseline.loot) : 0,
            monthlyTs: latest && baseline ? Math.max(0, latest.totalExp - baseline.totalExp) : 0,
            activeDays: activeDates.size,
            inactiveDays: Math.max(0, elapsedDays - activeDates.size),
            donations: donations.get(key) || 0,
            lastSeen: latest?.collectedAt || '',
          };
        });

        if (!cancelled) {
          setRows(scoreRows(rawRows));
          setUpdatedAt(new Date().toISOString());
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Failed to load audit data.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const totals = useMemo(() => {
    return {
      users: rows.length,
      activeUsers: rows.filter(row => row.activeDays > 0).length,
      loot: rows.reduce((sum, row) => sum + row.monthlyLoot, 0),
      ts: rows.reduce((sum, row) => sum + row.monthlyTs, 0),
      donations: rows.reduce((sum, row) => sum + row.donations, 0),
      averageScore: rows.length ? Math.round(rows.reduce((sum, row) => sum + row.score, 0) / rows.length) : 0,
    };
  }, [rows]);

  return { rows, totals, loading, error, updatedAt };
}
