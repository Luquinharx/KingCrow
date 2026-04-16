import { useCallback, useMemo } from 'react';
import { useProfilesData } from './useProfilesData';
import { createRankLookup, resolveRank } from '../lib/rank';

export function useRankLookup() {
  const { profiles, loading } = useProfilesData();

  const rankMap = useMemo(() => createRankLookup(profiles), [profiles]);

  const getRank = useCallback((username: string | null | undefined, fallback = ''): string => {
    return resolveRank(rankMap, username, fallback);
  }, [rankMap]);

  return {
    getRank,
    loading,
    rankMap,
  };
}
