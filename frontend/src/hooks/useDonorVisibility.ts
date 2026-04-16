import { useCallback, useEffect, useMemo, useState } from 'react';

const FIREBASE_URL = import.meta.env.VITE_FIREBASE_DATABASE_URL || 'https://dead-bb-default-rtdb.firebaseio.com';
const VISIBILITY_URL = `${FIREBASE_URL}/config/donor_visibility.json`;

function normalizeName(username: string): string {
  return username.trim().toLowerCase();
}

type VisibilityPayload = {
  hiddenDonors?: unknown;
};

export function useDonorVisibility() {
  const [hiddenDonors, setHiddenDonors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(VISIBILITY_URL);
      if (!response.ok) {
        throw new Error(`Failed to load donor visibility (${response.status})`);
      }

      const rawData = await response.json() as VisibilityPayload | null;
      const rawList = Array.isArray(rawData?.hiddenDonors) ? rawData.hiddenDonors : [];
      const sanitized = rawList
        .filter((v): v is string => typeof v === 'string')
        .map(normalizeName)
        .filter(Boolean);

      setHiddenDonors(Array.from(new Set(sanitized)));
    } catch (error) {
      console.error('Error loading donor visibility settings:', error);
      setHiddenDonors([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 60 * 1000);
    return () => clearInterval(id);
  }, [refresh]);

  const hiddenSet = useMemo(() => new Set(hiddenDonors), [hiddenDonors]);

  const isHidden = useCallback((username: string): boolean => {
    return hiddenSet.has(normalizeName(username));
  }, [hiddenSet]);

  const setDonorHidden = useCallback(async (username: string, hidden: boolean) => {
    const normalized = normalizeName(username);
    if (!normalized) return;

    const next = new Set(hiddenSet);
    if (hidden) {
      next.add(normalized);
    } else {
      next.delete(normalized);
    }

    const nextHiddenDonors = Array.from(next).sort();
    setHiddenDonors(nextHiddenDonors);

    const response = await fetch(VISIBILITY_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hiddenDonors: nextHiddenDonors,
        updatedAt: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      await refresh();
      throw new Error(`Failed to save donor visibility (${response.status})`);
    }
  }, [hiddenSet, refresh]);

  return { hiddenDonors, loading, isHidden, setDonorHidden };
}
