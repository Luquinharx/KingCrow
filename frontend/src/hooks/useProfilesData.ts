import { useState, useEffect } from 'react';

const FIREBASE_URL = "https://dead-bb-default-rtdb.firebaseio.com";

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

export function useProfilesData() {
  const [profiles, setProfiles] = useState<MemberProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [profRes, dailyRes] = await Promise.all([
          fetch(`${FIREBASE_URL}/profiles.json`),
          fetch(`${FIREBASE_URL}/daily.json`)
        ]);
        
        const data = await profRes.json();
        const dailyData = dailyRes.ok ? await dailyRes.json() : {};
        
        if (!data) {
          setProfiles([]);
          return;
        }

        const dates = Object.keys(dailyData || {}).sort();
        
        // Função auxiliar para buscar o último snapshot válido com total_exp para aquele usuário
        const getBaselineExp = (dbUserKey: string) => {
           for (let i = dates.length - 1; i >= 0; i--) {
               const userSnap = dailyData[dates[i]]?.[dbUserKey];
               if (userSnap && userSnap.total_exp !== undefined) {
                   return userSnap.total_exp;
               }
           }
           return null;
        };

        const parsedProfiles: MemberProfile[] = Object.values(data).map((p: any) => {
          let dailyTSCalc = 0;
          const dbUserKey = encodeURIComponent(p.username);
          
          const baselineExp = getBaselineExp(dbUserKey);
          
          if (baselineExp !== null) {
            dailyTSCalc = Math.max(0, (p.total_exp || 0) - baselineExp);
          }

          return {
            ...p,
            username: p.username,
            daily_ts_calc: dailyTSCalc
          };
        });
        
        setProfiles(parsedProfiles);
      } catch (error) {
        console.error('Failed to fetch profiles:', error);
      } finally {
        setLoading(false);
      }
    }

    load();
    
    // Auto refresh every 5 min
    const interval = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return { profiles, loading };
}
