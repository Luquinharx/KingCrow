import { useState, useEffect, useCallback } from 'react';

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

      // A base diária (8 AM) é capturada pela snapshot do final do "dia anterior"
      const yesterday = new Date(adjustedDate.getTime() - 24 * 60 * 60 * 1000);
      const yY = yesterday.getFullYear();
      const yM = String(yesterday.getMonth() + 1).padStart(2, '0');
      const yD = String(yesterday.getDate()).padStart(2, '0');
      const yesterdayStr = `${yY}-${yM}-${yD}`;

      // Calcula inicio da semana (segunda-feira)
      const dayOfWeek = adjustedDate.getDay();
      const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // 0 is Sunday
      const mondayDate = new Date(adjustedDate.getTime() - diffToMonday * 24 * 60 * 60 * 1000);
      const mY = mondayDate.getFullYear();
      const mM = String(mondayDate.getMonth() + 1).padStart(2, '0');
      const mD = String(mondayDate.getDate()).padStart(2, '0');
      const weekStr = `${mY}-${mM}-${mD}`;

      // Fetches paralelos
      const [profRes, dailyRes, _weeklyRes] = await Promise.all([
        fetch(`${FIREBASE_URL}/profiles.json`).catch(() => null),
        fetch(`${FIREBASE_URL}/daily/${yesterdayStr}.json`).catch(() => null),
        fetch(`${FIREBASE_URL}/weekly/${weekStr}.json`).catch(() => null)
      ]);

      const profiles = profRes && profRes.ok ? await profRes.json() : {};
      const daily = dailyRes && dailyRes.ok ? await dailyRes.json() : {};
      // const weekly = weeklyRes && weeklyRes.ok ? await weeklyRes.json() : {};

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

        if (val.collected_at && val.collected_at > globalCollectedAt) {
          globalCollectedAt = val.collected_at;
        }

        const currentAll = val.all_time_loots || 0;
        const clanAllTime = val.all_time_clan_loots || 0;
        const currentTS = val.all_time_ts || 0;

        // Baselines
        const dailyBaseline = daily && daily[u] ? daily[u] : val;
        // const weeklyBaseline = weekly && weekly[u] ? weekly[u] : val;

        const baselineLoot = daily && daily[u] ? (daily[u].alltimeloot || daily[u].all_time_loots || 0) : currentAll;
        const dailyLoot = Math.max(0, currentAll - baselineLoot);
        const dailyTSRecord = Math.max(0, currentTS - (dailyBaseline.all_time_ts || 0));
        
        // Scrap handles weekly info but users wanted native calculation? User said "Diretamente do scraping" 
        // For Dash Loot: `Weekly Loot` -> "Obtido diretamente do scraping"
        // But if scraping only has total all_time_loots now? Wait, scraping has `weekly_loots` and `clan_weekly_ts` etc!
        const weeklyLoot = Math.max(val.weekly_loots || 0, val.clan_weekly_loots || 0);
        const dailyTS = dailyTSRecord;

        // Rank rule inside the app as per user instructions
        // We calculate internally. Rule: skip Gate Soldier, maybe use the same as Python without Gate Soldier?
        // Actually user said: "Campos de rank e streak devem ser calculados internamente."
        let months = 0;
        if (val.last_clan_join) {
           const joinDate = new Date(val.last_clan_join);
           months = Math.floor((new Date().getTime() - joinDate.getTime()) / (30 * 24 * 60 * 60 * 1000));
        }
        if (isNaN(months)) months = 0;

        let rank = "Street Cleaner";
        const score = (months * 7000000) + ((clanAllTime / 1000) * 500000) + currentTS;
        if (score >= 40000000) rank = "Blade Master";
        else if (score >= 15000000) rank = "Guardian";
        else rank = "Street Cleaner"; // Skipped Gate Soldier (score >= 1000000) as requested!

        out.push({
          username: val.username || u,
          currentAll: currentAll,
          clanAllTime: clanAllTime,
          dailyLoot: dailyLoot,
          dailyTS: dailyTS,
          weeklyToDate: weeklyLoot,
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
