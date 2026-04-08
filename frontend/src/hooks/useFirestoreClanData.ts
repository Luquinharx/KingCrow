import { useState, useEffect } from 'react';

export interface FirestoreClanData {
  joinDate: Date | null;
  baseLoot: number;
  totalDonations: number;
}

export function useFirestoreClanData(username: string | undefined) {
  const [data, setData] = useState<FirestoreClanData>({ joinDate: null, baseLoot: 0, totalDonations: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      if (!username) {
        setData({ joinDate: null, baseLoot: 0, totalDonations: 0 });
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const uLower = username.toLowerCase().trim();

        // Fetch clan_member_profiles from Realtime Database
        const profilesRes = await fetch("https://dead-bb-default-rtdb.firebaseio.com/clan_member_profiles.json");
        const profilesData = await profilesRes.json();
        
        let joinDate: Date | null = null;
        let baseLoot = 0;

        if (profilesData && profilesData['1405'] && profilesData['1405'].users) {
          const users = Object.values(profilesData['1405'].users) as any[];
          for (const user of users) {
             if (user.username && user.username.toLowerCase().trim() === uLower) {
                if (user.dfprofiler) {
                   baseLoot = Number(user.dfprofiler.all_time_clan_loots) || 0;
                   const rawJoinDate = user.dfprofiler.last_clan_join;
                   if (rawJoinDate) {
                       let parsedDate = new Date(rawJoinDate);
                       if (!isNaN(parsedDate.getTime())) {
                           joinDate = parsedDate;
                       }
                   }
                }
                break;
             }
          }
        }

// Fetch bank from Realtime Database
        const logsRes = await fetch("https://dead-bb-default-rtdb.firebaseio.com/clan_logs/runs.json");
        const logsData = await logsRes.json();
        
        let totalDonations = 0;
        const allLogs: Record<string, any> = {};

        if (logsData) {
          Object.values(logsData).forEach((run: any) => {
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
          if (fields.action === 'give' && fields.username && fields.username.toLowerCase().trim() === uLower) {
            let amountStr = String(fields.currency || '0');
            amountStr = amountStr.replace(/[^0-9]/g, '');
            totalDonations += Number(amountStr) || 0;
          }
        });

        setData({ joinDate, baseLoot, totalDonations });
      } catch (err) {
        console.error('Error fetching firestore clan data:', err);
        setData({ joinDate: null, baseLoot: 0, totalDonations: 0 });
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [username]);

  return { data, loading };
}
