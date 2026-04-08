import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

export interface UserProfile {
  userId: string;
  email: string;
  nick: string;
  nickJogo: string; // username nos dados coletados (scraper)
  discord: string;
  dataEntrada: any;
  cargo: string;
  lootSemanal: number;
  lootTotal: number;
  roletaDisponivel: number;
  extraSpins?: number; // Saldo manual de giros da roleta
  powerSpins?: number; // Saldo manual de giros da slot machine
  criadoEm: any;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  logout: async () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchProfile(u: User) {
    const snap = await getDoc(doc(db, 'usuarios', u.uid));
    if (snap.exists()) {
      const data = snap.data() as UserProfile;
      if (u.email === 'lucasmartinsa3009@gmail.com' && data.cargo !== 'Leader') {
        const { updateDoc } = await import('firebase/firestore');
        await updateDoc(doc(db, 'usuarios', u.uid), { cargo: 'Leader' });
        data.cargo = 'Leader';
      }
      setProfile(data);
    } else {
      setProfile(null);
    }
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        await fetchProfile(u);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  async function logout() {
    await signOut(auth);
    setUser(null);
    setProfile(null);
  }

  async function refreshProfile() {
    if (user) await fetchProfile(user);
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
