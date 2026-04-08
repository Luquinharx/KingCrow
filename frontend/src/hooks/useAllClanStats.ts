import { useState, useEffect } from 'react';
import { useClanData } from './useClanData';

export interface ClanMemberStat {
  username: string;
  donations: number;
  baseLoot: number;
  scraperLoot: number;
  totalLoot: number;
}

export function useAllClanStats() {
  const [stats, setStats] = useState<ClanMemberStat[]>([]);
  const [loading, setLoading] = useState(true);
  const { data: scraperData, loading: scraperLoading } = useClanData();

  useEffect(() => {
    async function fetchStats() {
      if (scraperLoading) return;
      setLoading(true);
      try {
        // Fetch donations from Realtime Database (clan_logs/runs)
        const bankRes = await fetch("https://dead-bb-default-rtdb.firebaseio.com/clan_logs/runs.json");
        const bankData = await bankRes.json();

        const donationsMap: Record<string, number> = {};
        const allLogs: Record<string, any> = {};

        if (bankData) {
          Object.values(bankData).forEach((run: any) => {
            if (run && run.bank) {
              Object.entries(run.bank).forEach(([k, v]: [string, any]) => {
                if (v && v.fields) {
                  allLogs[k] = v.fields;
                }
              });
            }
          });
        }

        Object.values(allLogs).forEach(fields => {
          if (fields.action === 'give' && fields.username) {
            let amountStr = fields.currency || '0';
            amountStr = amountStr.replace(/[^0-9]/g, '');
            const amount = Number(amountStr) || 0;
            donationsMap[fields.username] = (donationsMap[fields.username] || 0) + amount;
          }
        });

        // Use scraper data directly (all_time_clan_loots is always updated)
        const mergedStats: ClanMemberStat[] = scraperData.map(scUser => ({
          username: scUser.username,
          donations: donationsMap[scUser.username] || 0,
          baseLoot: 0,
          scraperLoot: scUser.clanAllTime,
          totalLoot: scUser.clanAllTime
        }));

        // Sort by totalLoot descending
        mergedStats.sort((a, b) => b.totalLoot - a.totalLoot);

        setStats(mergedStats);
      } catch (error) {
        console.error('Error fetching all clan stats:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, [scraperData, scraperLoading]);

  return { stats, loading };
}
