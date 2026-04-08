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
  currentAll: number; // all_time_loots (user's total)
  dailyLoot: number; // Calculated from snapshots
  weeklyToDate: number; // weekly_loots (user's weekly)
  clanAllTime: number; // all_time_clan_loots (user in clan)
  dailyHistory: { data: string; valor: number }[];
  weeklyValues: number[];
  weeklyHistory: { semana: string; total: number }[];
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
        
        setUsernames(Object.keys(profiles).sort());
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
      const dbUser = encodeURIComponent(username);
      const res = await fetch(FIREBASE_RT_URL + `/profiles/${dbUser}.json`);
      const data = await res.json();
      if (!data || data.error) { setStats(null); setLoading(false); return; }

      // Correctly map scraper data to component fields
      const allTimeLootsUser = data.all_time_loots || 0; // User's total loots
      const weeklyLootsUser = data.weekly_loots || 0; // User's weekly loots
      const allTimeClanLoots = data.all_time_clan_loots || 0; // User's loots in clan
      
      // Calculate daily loot based on São Paulo timezone (09:00 daily reset)
      const dailyLoot = data.daily_loot_calc || 0;

      setStats({
        ...data,
        currentAll: allTimeLootsUser, // All Time Loots (user)
        dailyLoot: dailyLoot, // Daily loot calculated from snapshots
        weeklyToDate: weeklyLootsUser, // Week Loot (user)
        clanAllTime: allTimeClanLoots, // Clan Loot
        dailyHistory: [{ data: new Date().toISOString().slice(0,10), valor: dailyLoot }],
        weeklyValues: [weeklyLootsUser],
        weeklyHistory: [{ semana: "Current", total: weeklyLootsUser }]
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
