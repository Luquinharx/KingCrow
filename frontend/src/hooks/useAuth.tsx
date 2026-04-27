import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { get, ref, set, update } from 'firebase/database';
import { auth, rtdb } from '../lib/firebase';
import { isSuperAdminEmail } from '../lib/admin';

const PROFILE_LOAD_TIMEOUT_MS = 8000;

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

function timeoutAfter<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchProfile(u: User): Promise<UserProfile | null> {
    const profileRef = ref(rtdb, `usuarios/${u.uid}`);
    const snap = await timeoutAfter(get(profileRef), PROFILE_LOAD_TIMEOUT_MS, 'profile');

    if (snap.exists()) {
      const data = snap.val() as UserProfile;
      if (isSuperAdminEmail(u.email) && data.cargo !== 'Leader') {
        update(profileRef, { cargo: 'Leader' }).catch((error) => {
          console.error('Erro ao promover super admin:', error);
        });
        data.cargo = 'Leader';
      }
      return data;
    } else {
      if (isSuperAdminEmail(u.email)) {
        const superAdminProfile: UserProfile = {
          userId: u.uid,
          email: u.email || '',
          nick: u.displayName || 'Super Admin',
          nickJogo: '',
          discord: '',
          dataEntrada: new Date().toISOString(),
          cargo: 'Leader',
          lootSemanal: 0,
          lootTotal: 0,
          roletaDisponivel: 0,
          extraSpins: 0,
          powerSpins: 0,
          criadoEm: new Date().toISOString(),
        };

        set(profileRef, superAdminProfile).catch((error) => {
          console.error('Erro ao salvar perfil do super admin:', error);
        });

        return superAdminProfile;
      }

      return null;
    }
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      try {
        if (u) {
          setProfile(await fetchProfile(u));
        } else {
          setProfile(null);
        }
      } catch (error) {
        console.error('Erro ao carregar perfil do usuario:', error);
        setProfile(null);
      } finally {
        setLoading(false);
      }
    });
    return unsub;
  }, []);

  async function logout() {
    await signOut(auth);
    setUser(null);
    setProfile(null);
  }

  async function refreshProfile() {
    if (!user) {
      setProfile(null);
      return;
    }

    try {
      setProfile(await fetchProfile(user));
    } catch (error) {
      console.error('Erro ao atualizar perfil do usuario:', error);
      setProfile(null);
    }
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
