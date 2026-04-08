import { useState, useEffect } from 'react';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface CasinoPrize {
  id: number;
  name: string;
  chance: number;
  value: string;
  color: string;
  icon: string;
}

export interface CasinoLootRule {
  amount: number;
  spins: number;
}

export interface CasinoConfig {
  prizes: CasinoPrize[];
  lootRules: CasinoLootRule[];
  donationRule: {
    amount: number;
    spins: number;
    enabled?: boolean;
  };
}

export const defaultCasinoConfig: CasinoConfig = {
  prizes: [
    { id: 1, name: 'Normal', chance: 49, value: '100k', color: 'text-amber-500', icon: '💰' },
    { id: 2, name: 'Rare', chance: 25, value: '250k', color: 'text-emerald-500', icon: '💵' },
    { id: 3, name: 'Epic', chance: 15, value: '500k', color: 'text-blue-500', icon: '💎' },
    { id: 4, name: 'Legendary', chance: 10, value: '1M', color: 'text-purple-500', icon: '👑' },
    { id: 5, name: 'Mythic', chance: 1, value: '2.5M', color: 'text-red-500', icon: '🔥' },
  ],
  lootRules: [
    { amount: 1000, spins: 1 },
    { amount: 5000, spins: 5 },
    { amount: 10000, spins: 15 },
  ],
  donationRule: {
    amount: 1, // $1
    spins: 2,
    enabled: true,
  },
};

export function useCasinoConfig() {
  const [config, setConfig] = useState<CasinoConfig>(defaultCasinoConfig);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'config', 'casino'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as CasinoConfig;
        
        
        let loadedPrizes = data.prizes || defaultCasinoConfig.prizes;

        // Force transition to English / Value-less names for existing clients
        loadedPrizes = loadedPrizes.map(p => {
          let updatedName = p.name;
          if (updatedName.includes('Normal')) updatedName = 'Normal';
          if (updatedName.includes('Rara') || updatedName.includes('Rare')) updatedName = 'Rare';
          if (updatedName.includes('Épica') || updatedName.includes('Epic')) updatedName = 'Epic';
          if (updatedName.includes('Lendária') || updatedName.includes('Legendary')) updatedName = 'Legendary';
          if (updatedName.includes('Mítica') || updatedName.includes('Mythic')) updatedName = 'Mythic';

          if (updatedName.includes('Média') || updatedName.includes('Media')) updatedName = 'Medium';
          if (updatedName.includes('Grande')) updatedName = 'Large';
          if (updatedName.includes('Mega')) updatedName = 'Mega';
          if (updatedName.includes('Super')) updatedName = 'Super';
          if (updatedName.includes('Jackpot')) updatedName = 'Jackpot';
          return { ...p, name: updatedName };
        });

        if (loadedPrizes.length > 0 && loadedPrizes[0].chance >= 49 && loadedPrizes[0].name.includes('100k')) {
            loadedPrizes = defaultCasinoConfig.prizes; // Auto-update to new 49% default
            setDoc(doc(db, 'config', 'casino'), { ...data, prizes: loadedPrizes }, { merge: true });
        }

        setConfig({
          prizes: loadedPrizes,
          lootRules: data.lootRules || defaultCasinoConfig.lootRules,
          donationRule: data.donationRule || defaultCasinoConfig.donationRule,
        });
      }
      setLoading(false);
    }, (err) => {
      console.error("Failed to load casino config", err);
      // fallback to default
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const updateConfig = async (newConfig: CasinoConfig) => {
    try {
      await setDoc(doc(db, 'config', 'casino'), newConfig);
    } catch (e) {
      console.error("Failed to save casino config", e);
      throw e;
    }
  };

  return { config, updateConfig, loading };
}
