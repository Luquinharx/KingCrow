import { useState, useEffect, useCallback } from 'react';
import { canonicalizeRank, safeDecodeURIComponent } from '../lib/rank';
import { getOrCreateDailyLootBaseline, resolveDailyLootBaselineFromDailyData, resolveDailyValueBaselineFromDailyData } from '../lib/dailyBaseline';

const FIREBASE_URL = "https://dead-bb-default-rtdb.firebaseio.com";
const REFRESH_MS = 5 * 60 * 1000;

export interface MemberData {
  username: string;
  currentAll: number;
  clanAllTime: number;
  dailyLoot: number;
  dailyTS: number;
  weeklyToDate: number;
  weeklyValues: number[];
  pct: string;
  pctNum: number;
  streak: number;
  streak_type: 'positive' | 'negative';
  isUpdated: boolean;
  isActive: boolean;
  lastCollectedAt: string;
  rank: string;
}

export function useClanData() {
  const [data, setData] = useState<MemberData[]>([]);
  const [dates, setDates] = useState<string[]>([]);
  const [numWeekCols] = useState(1);
  const [weekLabels] = useState<string[]>(["Current Week"]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [latestDate, setLatestDate] = useState('');
  const [latestCollectedAt, setLatestCollectedAt] = useState('');
  const [updatedCount, setUpdatedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const fetchData = useCallback(async () => {
    try {
      // Setup adjusted time (minus 8 hours for 08:00 AM reset)
      const now = new Date();
      const formatter = new Intl.DateTimeFormat("en-US", {
          timeZone: "America/Sao_Paulo",
          year: "numeric", month: "2-digit", day: "2-digit",
          hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
      });
      const parts = formatter.formatToParts(now);
      const p: Record<string, string> = {};
      parts.forEach(({ type, value }) => { p[type] = value; });

      const spYear = parseInt(p.year);
      const spMonth = parseInt(p.month);
      const spDay = parseInt(p.day);
      const spHour = parseInt(p.hour);

      // Cria a data local de SP
      const spDate = new Date(spYear, spMonth - 1, spDay, spHour, parseInt(p.minute), parseInt(p.second));
      
      // Subtrai 8 horas (reset às 8:00)
      const adjustedDate = new Date(spDate.getTime() - 8 * 60 * 60 * 1000);
      
      const yyyy = adjustedDate.getFullYear();
      const mm = String(adjustedDate.getMonth() + 1).padStart(2, '0');
      const dd = String(adjustedDate.getDate()).padStart(2, '0');
      const todayStr = `${yyyy}-${mm}-${dd}`;

      // Fetches paralelos
      const [profRes, dailyRes] = await Promise.all([
        fetch(`${FIREBASE_URL}/profiles.json`).catch(() => null),
        fetch(`${FIREBASE_URL}/daily.json`).catch(() => null)
      ]);

      const profiles = profRes && profRes.ok ? await profRes.json() : {};
      const dailyData = dailyRes && dailyRes.ok ? await dailyRes.json() : {};

      if (!profiles || profiles.error) {
        setData([]);
        setLoading(false);
        return;
      }

      const users = Object.keys(profiles);
      const out: MemberData[] = [];
      let globalCollectedAt = '';

      users.forEach(u => {
        const val = profiles[u];
        if (!val) return;

        const username = safeDecodeURIComponent((val.username || u) as string).trim();
        if (!username) return;

        if (val.collected_at && val.collected_at > globalCollectedAt) {
          globalCollectedAt = val.collected_at;
        }

        const currentAll = val.all_time_loots || 0;
        const clanAllTime = val.all_time_clan_loots || 0;
        const currentTotalExp = val.total_exp || 0;

        const dbUserKey = encodeURIComponent(username).replace(/\./g, "%2E");

        // Resolve loot baseline near the 08:00 reset (or closest snapshot when missing)
        const baselineLoot = resolveDailyLootBaselineFromDailyData(
          dailyData,
          username,
          dbUserKey,
          currentAll,
        );

        const baselineExp = resolveDailyValueBaselineFromDailyData(
          dailyData,
          username,
          dbUserKey,
          currentTotalExp,
          ['total_exp'],
        );

        let dailyLoot = 0;
        if (baselineLoot !== null) {
            dailyLoot = Math.max(0, currentAll - baselineLoot);
        } else {
            // First time this member appears with no daily history in DB:
            // create a local baseline so the next update starts diff from this point.
            const baseline = getOrCreateDailyLootBaseline(username, currentAll);
            dailyLoot = baseline.isNew ? 0 : Math.max(0, currentAll - baseline.baseline);
        }

        let dailyTS = 0;
        if (baselineExp !== null) {
            dailyTS = Math.max(0, currentTotalExp - baselineExp);
        } else {
            dailyTS = 0;
        }

        // Scrap handles weekly info
        const weeklyLoot = Math.max(val.weekly_loots || 0, val.clan_weekly_loots || 0);
        const rank = canonicalizeRank(val.rank || "");

        out.push({
          username,
          currentAll: currentAll,
          clanAllTime: clanAllTime,
          dailyLoot: dailyLoot,
          dailyTS: dailyTS,
          weeklyToDate: val.weekly_loots || 0,
          weeklyValues: [weeklyLoot],
          pct: '0%',
          pctNum: 0,
          streak: weeklyLoot > 0 ? 1 : 0, // Streak calculated simply for now
          streak_type: weeklyLoot > 0 ? 'positive' : 'negative',
          isUpdated: true,
          isActive: true,
          lastCollectedAt: val.collected_at || '',
          rank: rank
        });
      });

      setData(out);
      setLatestCollectedAt(globalCollectedAt);
      setLatestDate(todayStr);
      setUpdatedCount(users.length);
      setTotalCount(users.length);
      setDates([todayStr]);

      setLoading(false);
    } catch (err: any) {
      console.error("Fetch Data Error:", err);
      setError(err.message);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchData]);

  return { data, dates, numWeekCols, weekLabels, loading, error, latestDate, latestCollectedAt, updatedCount, totalCount };
}
