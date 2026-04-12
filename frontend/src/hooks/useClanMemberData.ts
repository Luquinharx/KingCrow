import { useState, useEffect, useCallback } from "react";

const FIREBASE_RT_URL = "https://dead-bb-default-rtdb.firebaseio.com";
const REFRESH_MS = 5 * 60 * 1000;

export interface ClanMemberStats {
  username?: string;
  collected_at?: string;
  weekly_ts?: number;
  clan_weekly_ts?: number;
  exp_since_death?: number;
  all_time_ts?: number;
  total_exp?: number;
  expected_loss_on_death?: number;
  daily_tpk?: number;
  weekly_tpk?: number;
  clan_weekly_tpk?: number;
  all_time_tpk?: number;
  last_players_killed?: string;
  last_hit_by?: string;
  weekly_loots?: number;
  all_time_loots?: number;
  clan_weekly_loots?: number;
  all_time_clan_loots?: number;
  last_clan_join?: string;
  rank?: string;
  rank_score?: number;
  
  // Compatibility fields for the frontend
  currentAll: number;
  dailyLoot: number;
  dailyTS: number;
  weeklyToDate: number;
  clanAllTime: number;
  dailyHistory: { data: string; loot: number; ts: number }[];
  weeklyValues: number[];
  weeklyHistory: { semana: string; loot: number; ts: number }[];
}

export function useScrapedUsernames() {
  const [usernames, setUsernames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(FIREBASE_RT_URL + "/profiles.json?shallow=true");
        const profiles = await res.json();
        if (!profiles) { setUsernames([]); setLoading(false); return; }
        
        setUsernames(Object.keys(profiles).map(k => {
          try { return decodeURIComponent(k); } catch(e) { return k; }
        }).sort());
      } catch {
        setUsernames([]);
      }
      setLoading(false);
    }
    load();
  }, []);

  return { usernames, loading };
}

export function useClanMemberData(username: string | undefined) {
  const [stats, setStats] = useState<ClanMemberStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!username) { setStats(null); setLoading(false); return; }

    try {
      const dbUser = encodeURIComponent(username).replace(/\./g, "%2E");
      const res = await fetch(FIREBASE_RT_URL + `/profiles/${encodeURIComponent(dbUser)}.json`);
      const data = await res.json();
      if (!data || data.error) { setStats(null); setLoading(false); return; }

      // Correctly map scraper data to component fields
      const allTimeLootsUser = data.all_time_loots || 0; // User's total loots
      const weeklyLootsUser = data.weekly_loots || 0; // User's weekly loots
      const allTimeClanLoots = data.all_time_clan_loots || 0; // User's loots in clan
      const currentTotalExp = data.total_exp || 0;
      
      const dailyRes = await fetch(FIREBASE_RT_URL + `/daily.json`);
      const dailyData = dailyRes.ok ? await dailyRes.json() : {};

      const weeklyRes = await fetch(FIREBASE_RT_URL + `/weekly.json`);
      const weeklyData = weeklyRes.ok ? await weeklyRes.json() : {};
      
      const dates = Object.keys(dailyData || {}).sort();
      let dailyLoot = 0;
      let dailyTS = 0;

      let baselineLoot = null;
      let baselineExp = null;

      // Buscar retroativamente o último snapshot válido para o usuário
      for (let i = dates.length - 1; i >= 0; i--) {
          const snap = dailyData[dates[i]]?.[dbUser];
          if (snap) {
              if (baselineLoot === null) {
                  baselineLoot = snap.alltimeloot !== undefined ? snap.alltimeloot : (snap.all_time_loots !== undefined ? snap.all_time_loots : 0);
              }
              if (baselineExp === null && snap.total_exp !== undefined) {
                  baselineExp = snap.total_exp;
              }
              if (baselineLoot !== null && baselineExp !== null) {
                  break;
              }
          }
      }

      if (baselineLoot !== null) {
          dailyLoot = Math.max(0, allTimeLootsUser - baselineLoot);
      } else {
          // Se não há histórico do membro (primeiro dia no sistema), 
          // não inflar seu ganho diário creditando 100% de seus pontos de toda a vida. Mostrar 0.
          dailyLoot = 0;
      }

      if (baselineExp !== null) {
          dailyTS = Math.max(0, currentTotalExp - baselineExp);
      } else {
          dailyTS = 0;
      }

      // Compile daily history from daily nodes
      const historyDaily: { data: string; loot: number; ts: number }[] = [];
      let prevLoot = 0;
      let prevExp = null;
      
      for (const d of dates) {
          const snap = dailyData[d]?.[dbUser];
          if (snap) {
              const curLoot = snap.alltimeloot || snap.all_time_loots || 0;
              const curExp = snap.total_exp !== undefined ? snap.total_exp : null;
              
              if (prevLoot > 0) {
                 historyDaily.push({
                     data: d.slice(5), // MM-DD
                     loot: Math.max(0, curLoot - prevLoot),
                     ts: (curExp !== null && prevExp !== null) ? Math.max(0, curExp - prevExp) : 0
                 });
              }
              prevLoot = curLoot;
              prevExp = curExp;
          }
      }
      
      historyDaily.push({ 
          data: "Atual", 
          loot: dailyLoot, 
          ts: dailyTS 
      });

      // Weekly History from weekly nodes
      const historyWeekly: { semana: string; loot: number; ts: number }[] = [];
      const weekDates = Object.keys(weeklyData || {}).sort();
      let prevWeekLoot = 0;
      let prevWeekTS = 0;
      
      for (const d of weekDates) {
          const snap = weeklyData[d]?.[dbUser];
          if (snap) {
              const curLoot = snap.all_time_loots || snap.alltimeloot || 0;
              const curTs = snap.all_time_ts || 0;
              if (prevWeekLoot > 0) {
                 historyWeekly.push({
                     semana: d,
                     loot: Math.max(0, curLoot - prevWeekLoot),
                     ts: Math.max(0, curTs - prevWeekTS)
                 });
              }
              prevWeekLoot = curLoot;
              prevWeekTS = curTs;
          }
      }
      
      // Current running week
      historyWeekly.push({
          semana: "Atual",
          loot: data.weekly_loots || data.clan_weekly_loots || 0,
          ts: data.weekly_ts || data.clan_weekly_ts || 0
      });

      setStats({
        ...data,
        currentAll: allTimeLootsUser,
        dailyLoot: dailyLoot,
        dailyTS: dailyTS,
        weeklyToDate: Math.max(data.weekly_loots || 0, data.clan_weekly_loots || 0),
        clanAllTime: allTimeClanLoots,
        dailyHistory: historyDaily.slice(-15),
        weeklyValues: [weeklyLootsUser],
        weeklyHistory: historyWeekly.slice(-10)
      });
    } catch (err) {
      console.error("Error fetching clan member data:", err);
      setStats(null);
    }
    setLoading(false);
  }, [username]);

  useEffect(() => {
    setLoading(true);
    fetchData();
    const id = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchData]);

  return { stats, loading };
}
