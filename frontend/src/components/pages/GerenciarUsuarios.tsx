import { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, doc, updateDoc, deleteDoc, query, orderBy, limit } from 'firebase/firestore';
import { get as dbGet, ref as dbRef, remove as dbRemove, set as dbSet, update as dbUpdate } from 'firebase/database';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth, db, firebaseConfig, rtdb } from '../../lib/firebase';
import { useAuth, type UserProfile } from '../../hooks/useAuth';
import { useScrapedUsernames } from '../../hooks/useClanMemberData';
import { useRankLookup } from '../../hooks/useRankLookup';
import { RankBadge } from '../RankBadge';
import { Edit3, Trash2, Save, X, Search, UserPlus, Gift, Check, ShieldAlert, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import CasinoSettings from './CasinoSettings';
import PowerRouletteSettings from './PowerRouletteSettings';
import { isAdminCargo, isSuperAdminEmail } from '../../lib/admin';

const ACCESS_OPTIONS = ['Admin', 'Usuario'] as const;
const USERS_LOAD_TIMEOUT_MS = 12000;
const USER_EMAIL_FIELDS = ['email', 'emailAccess', 'authEmail', 'loginEmail', 'mail'];


function timeoutAfter<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;

  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function normalizeUserDoc(data: Partial<UserProfile> & Record<string, unknown>, docId: string, currentUserEmail = ''): UserProfile & { docId: string } {
  const email = USER_EMAIL_FIELDS.map(field => stringValue(data[field]))
    .find(Boolean)
    || currentUserEmail;

  return {
    userId: stringValue(data.userId) || docId,
    email,
    nick: stringValue(data.nick) || stringValue(data.nickJogo) || email || docId,
    nickJogo: stringValue(data.nickJogo),
    discord: stringValue(data.discord),
    dataEntrada: data.dataEntrada,
    cargo: stringValue(data.cargo) || 'Street Cleaner',
    lootSemanal: Number(data.lootSemanal) || 0,
    lootTotal: Number(data.lootTotal) || 0,
    roletaDisponivel: Number(data.roletaDisponivel) || 0,
    extraSpins: Number(data.extraSpins) || 0,
    powerSpins: Number(data.powerSpins) || 0,
    criadoEm: data.criadoEm,
    docId,
  };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function getStoredEmail(data: Record<string, unknown>): string {
  return USER_EMAIL_FIELDS.map(field => stringValue(data[field])).find(Boolean) || '';
}

function getAccessLabel(cargo?: string | null): typeof ACCESS_OPTIONS[number] {
  return isAdminCargo(cargo) ? 'Admin' : 'Usuario';
}

function accessToCargo(access: typeof ACCESS_OPTIONS[number]): string {
  return access === 'Admin' ? 'Leader' : 'Street Cleaner';
}

function createUserProfilePayload(uid: string, email: string, form: {
  nick: string;
  nickJogo: string;
  discord: string;
  isAdmin: boolean;
}) {
  return {
    userId: uid,
    email,
    emailNormalized: email,
    nick: form.nick,
    nickJogo: form.nickJogo,
    discord: form.discord,
    dataEntrada: new Date().toISOString(),
    cargo: form.isAdmin ? 'Leader' : 'Street Cleaner',
    extraSpins: 0,
    powerSpins: 0,
    lootSemanal: 0,
    lootTotal: 0,
    roletaDisponivel: 0,
    criadoEm: new Date().toISOString(),
  };
}

interface AuthRestUser {
  uid: string;
  idToken: string;
}

async function firebaseAuthRequest<T>(endpoint: string, payload: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${endpoint}?key=${firebaseConfig.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();

  if (!res.ok) {
    const message = data?.error?.message || `HTTP_${res.status}`;
    throw new Error(message);
  }

  return data as T;
}

async function createAuthUser(email: string, password: string): Promise<AuthRestUser> {
  const data = await firebaseAuthRequest<{ localId: string; idToken: string }>('signUp', {
    email,
    password,
    returnSecureToken: true,
  });

  return { uid: data.localId, idToken: data.idToken };
}

async function signInAuthUser(email: string, password: string): Promise<AuthRestUser> {
  const data = await firebaseAuthRequest<{ localId: string; idToken: string }>('signInWithPassword', {
    email,
    password,
    returnSecureToken: true,
  });

  return { uid: data.localId, idToken: data.idToken };
}

async function deleteAuthUser(idToken: string) {
  await firebaseAuthRequest('delete', { idToken });
}

export default function GerenciarUsuarios() {
  const { user, profile, refreshProfile } = useAuth();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCadastro, setShowCadastro] = useState(false);
  const shouldLoadScrapedNames = showCadastro || editingId !== null;
  const { usernames: scrapedNames } = useScrapedUsernames(shouldLoadScrapedNames);
  const { getRank } = useRankLookup();
    // Não precisa mais do profiles diretamente

  const isSuperUser = isSuperAdminEmail(user?.email || profile?.email);
  const isOfficerOnly = profile?.cargo === 'Officer';
    const isHighLeader = profile?.cargo === 'High Warden';
    const isLeader = profile?.cargo === 'Leader' || isSuperUser || isOfficerOnly;
    const isAdmin = isLeader || isHighLeader;

    // Tabs
  const [activeTab] = useState<'members' | 'spins' | 'powerspins' | 'casino'>('members');
  const [usuarios, setUsuarios] = useState<(UserProfile & { docId: string })[]>([]);
  const [search, setSearch] = useState('');
  const [editForm, setEditForm] = useState({ nick: '', discord: '', cargo: '', nickJogo: '', password: '' });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // Spins State
  const [spins, setSpins] = useState<any[]>([]);
  const [spinsLoading, setSpinsLoading] = useState(false);

  const [powerSpinsActivity, setPowerSpinsActivity] = useState<any[]>([]);
  const [powerSpinsLoading, setPowerSpinsLoading] = useState(false);

  // --- Pagination & Sorting state ---
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'nick', direction: 'asc' });
  const itemsPerPage = 20;

  // --- Cadastro state ---
  const [cadEmail, setCadEmail] = useState('');
  const [cadSenha, setCadSenha] = useState('');
  const [cadNick, setCadNick] = useState('');
  const [cadNickJogo, setCadNickJogo] = useState('');
  const [cadDiscord, setCadDiscord] = useState('');
  const [cadIsAdmin, setCadIsAdmin] = useState(false);
  const [cadError, setCadError] = useState('');
  const [cadSuccess, setCadSuccess] = useState('');
  const [cadLoading, setCadLoading] = useState(false);

  async function loadAll() {
    setLoading(true);
    setLoadError('');
    try {
      const list = await fetchAllUsers();
      setUsuarios(list);
    } catch (error) {
      console.error('Error loading users:', error);
      setLoadError('Nao foi possivel carregar os usuarios agora. Tente atualizar os dados.');
      setUsuarios([]);
    } finally {
      setLoading(false);
    }
  }

  async function fetchAllUsers() {
    const snap = await timeoutAfter(dbGet(dbRef(rtdb, 'usuarios')), USERS_LOAD_TIMEOUT_MS, 'usuarios');
    const data = snap.exists() ? snap.val() as Record<string, Record<string, unknown>> : {};

    return Object.entries(data)
      .map(([uid, value]) => {
        const currentUserEmail = uid === user?.uid ? user.email || '' : '';
        return normalizeUserDoc(value, uid, currentUserEmail);
      })
      .sort((a, b) => a.nick.localeCompare(b.nick));
  }

  async function loadSpins() {
    setSpinsLoading(true);
    try {
        // Also ensure users are loaded to map IDs to Names
        if (usuarios.length === 0) {
           await loadAll();
        }

        const q = query(collection(db, 'roletas'), orderBy('data', 'desc'), limit(100)); // Limit to last 100 for performance
        const snap = await getDocs(q);
        const list: any[] = [];
        
        let currentUsers = usuarios;
        if (currentUsers.length === 0) {
            const uList = await fetchAllUsers();
            currentUsers = uList;
            setUsuarios(uList);
        }

        snap.forEach(d => {
            const data = d.data();
            const uDetails = currentUsers.find(u => u.docId === data.userId || u.userId === data.userId);
            const resolvedName = uDetails ? (uDetails.nickJogo || uDetails.nick || data.userId) : data.userId;
            
            list.push({
                id: d.id,
                ...data,
                resolvedName,
                formattedDate: data.data?.toDate?.() ? data.data.toDate().toLocaleDateString('pt-BR') + ' ' + data.data.toDate().toLocaleTimeString('pt-BR') : 'Invalid Date'
            });
        });
        setSpins(list);
    } catch (error) {
        console.error("Error loading spins", error);
    } finally {
        setSpinsLoading(false);
    }
  }

  async function loadPowerSpins() {
    setPowerSpinsLoading(true);
    try {
        if (usuarios.length === 0) await loadAll();

        const q = query(collection(db, 'power_roletas'), orderBy('data', 'desc'), limit(100));
        const snap = await getDocs(q);
        const list: any[] = [];
        
        let currentUsers = usuarios;
        if (currentUsers.length === 0) {
            const uList = await fetchAllUsers();
            currentUsers = uList;
            setUsuarios(uList);
        }

        snap.forEach(d => {
            const data = d.data();
            const uDetails = currentUsers.find(u => u.docId === data.userId || u.userId === data.userId);
            const resolvedName = uDetails ? (uDetails.nickJogo || uDetails.nick || data.userId) : data.userId;
            
            list.push({
                id: d.id,
                ...data,
                resolvedName,
                formattedDate: data.data?.toDate?.() ? data.data.toDate().toLocaleDateString('pt-BR') + ' ' + data.data.toDate().toLocaleTimeString('pt-BR') : 'Invalid Date'
            });
        });
        setPowerSpinsActivity(list);
    } catch (error) {
        console.error("Error loading power spins", error);
    } finally {
        setPowerSpinsLoading(false);
    }
  }

  useEffect(() => { 
      if (activeTab === 'members') loadAll(); 
      if (activeTab === 'spins') { loadAll(); loadSpins(); }
      if (activeTab === 'powerspins') { loadAll(); loadPowerSpins(); }
  }, [activeTab]);

  function startEdit(u: UserProfile & { docId: string }) {
    setEditingId(u.docId);
    setEditForm({
        nick: u.nick,
        discord: u.discord,
        cargo: getAccessLabel(u.cargo),
        nickJogo: u.nickJogo || '',
        password: '',
    });
  }

  async function saveEdit(u: UserProfile & { docId: string }) {
    try {
      await dbUpdate(dbRef(rtdb, `usuarios/${u.docId}`), {
        nick: editForm.nick,
        discord: editForm.discord,
        cargo: accessToCargo(editForm.cargo as typeof ACCESS_OPTIONS[number]),
        nickJogo: editForm.nickJogo,
      });

      if (editForm.password.trim()) {
        await sendPasswordResetEmail(auth, u.email);
      }

      setEditingId(null);
      setEditForm(prev => ({ ...prev, password: '' }));
      await loadAll();
    } catch (err) {
      console.error('Error editing:', err);
      setLoadError('Nao foi possivel salvar a edicao. Se alterou senha, confirme se o usuario tem email valido no Auth.');
    }
  }

  async function handleDelete(docId: string, nickName: string) {
    if (!confirm(`Are you sure you want to remove "${nickName}"?`)) return;
    try {
      await dbRemove(dbRef(rtdb, `usuarios/${docId}`));
      await loadAll();
    } catch (err) {
      console.error('Erro ao deletar:', err);
    }
  }

  async function findUsersByEmail(email: string) {
    const targetEmail = normalizeEmail(email);
    const snap = await timeoutAfter(dbGet(dbRef(rtdb, 'usuarios')), USERS_LOAD_TIMEOUT_MS, 'usuarios');
    const matches: string[] = [];
    const data = snap.exists() ? snap.val() as Record<string, Record<string, unknown>> : {};

    Object.entries(data).forEach(([uid, value]) => {
      const storedEmail = normalizeEmail(getStoredEmail(value));
      if (storedEmail === targetEmail) matches.push(uid);
    });

    return matches;
  }

  async function removeFirestoreUsersByEmail(email: string) {
    const matches = await findUsersByEmail(email);
    await Promise.all(matches.map(docId => dbRemove(dbRef(rtdb, `usuarios/${docId}`))));
    return matches.length;
  }

  async function removeDuplicateUserProfiles(email: string, keepUid: string) {
    const matches = await findUsersByEmail(email);
    const duplicates = matches.filter(docId => docId !== keepUid);
    await Promise.all(duplicates.map(docId => dbRemove(dbRef(rtdb, `usuarios/${docId}`))));
    return duplicates.length;
  }

  async function cleanEmailRegistration(email: string) {
    const removed = await removeFirestoreUsersByEmail(email);
    setCadSuccess(
      removed > 0
        ? `Removed ${removed} database record(s) for ${normalizeEmail(email)}. You can create it again now.`
        : `No database record found for ${normalizeEmail(email)}.`
    );
    await loadAll();
  }

  async function saveProfileForAuthUser(authUser: AuthRestUser, email: string) {
    await dbSet(dbRef(rtdb, `usuarios/${authUser.uid}`), createUserProfilePayload(authUser.uid, email, {
      nick: cadNick,
      nickJogo: cadNickJogo,
      discord: cadDiscord,
      isAdmin: cadIsAdmin,
    }));
  }

  // Spin Actions
  async function markSpinDelivered(spinId: string) {
      try {
          await updateDoc(doc(db, 'roletas', spinId), { entregue: true });
          setSpins(prev => prev.map(s => s.id === spinId ? { ...s, entregue: true } : s));
      } catch (e) {
          console.error("Error marking delivered", e);
      }
  }

  async function deleteSpin(spinId: string) {
      if(!confirm("Are you sure you want to delete this spin record?")) return;
      try {
          await deleteDoc(doc(db, 'roletas', spinId));
          setSpins(prev => prev.filter(s => s.id !== spinId));
      } catch (e) {
          console.error("Error deleting spin", e);
      }
  }


  async function markPowerSpinDelivered(spinId: string) {
      try {
          await updateDoc(doc(db, 'power_roletas', spinId), { entregue: true });
          setPowerSpinsActivity(prev => prev.map(s => s.id === spinId ? { ...s, entregue: true } : s));
      } catch (e) {
          console.error("Error marking delivered", e);
      }
  }

  async function deletePowerSpin(spinId: string) {
      if(!confirm("Are you sure you want to delete this power spin record?")) return;
      try {
          await deleteDoc(doc(db, 'power_roletas', spinId));
          setPowerSpinsActivity(prev => prev.filter(s => s.id !== spinId));
      } catch (e) {
          console.error("Error deleting power spin", e);
      }
  }

  async function handleCadastro(e: React.FormEvent) {
    e.preventDefault();
    setCadError('');
    setCadLoading(true);
    setCadSuccess('');
    const emailToCreate = normalizeEmail(cadEmail);
    let createdAuthUser: AuthRestUser | null = null;

    try {
      createdAuthUser = await createAuthUser(emailToCreate, cadSenha);
      await saveProfileForAuthUser(createdAuthUser, emailToCreate);
      await removeDuplicateUserProfiles(emailToCreate, createdAuthUser.uid);

      setCadSuccess(`User "${cadNick}" created in Auth and saved in database.`);
      setCadEmail(''); setCadSenha(''); setCadNick(''); setCadNickJogo(''); setCadDiscord(''); setCadIsAdmin(false);
      await loadAll();
    } catch (err: any) {
      const code = err?.message || err?.code || '';

      if (createdAuthUser && code !== 'EMAIL_EXISTS') {
        await deleteAuthUser(createdAuthUser.idToken).catch((deleteError) => {
          console.error('Failed to rollback auth user after profile creation error:', deleteError);
        });
      }

      if (code === 'EMAIL_EXISTS') {
        try {
          const existingCred = await signInAuthUser(emailToCreate, cadSenha);
          await saveProfileForAuthUser(existingCred, emailToCreate);
          await removeDuplicateUserProfiles(emailToCreate, existingCred.uid);
          setCadSuccess(`Auth confirmado. Perfil salvo para "${cadNick}".`);
          setCadEmail(''); setCadSenha(''); setCadNick(''); setCadNickJogo(''); setCadDiscord(''); setCadIsAdmin(false);
          await loadAll();
        } catch (linkError: any) {
          const linkCode = linkError?.message || linkError?.code || '';
          if (linkCode === 'INVALID_LOGIN_CREDENTIALS' || linkCode === 'INVALID_PASSWORD') {
            setCadError('Este email ja existe no Firebase Auth, mas a senha informada nao confere. Digite a senha cadastrada manualmente no Auth para criar o perfil no banco.');
          } else {
            setCadError(`Este email ja existe no Firebase Auth, mas nao foi possivel criar o perfil no banco (${linkCode}).`);
          }
        }
      } else if (code === 'WEAK_PASSWORD' || code.includes('WEAK_PASSWORD')) {
        setCadError('A senha deve ter pelo menos 6 caracteres.');
      } else if (code === 'INVALID_EMAIL') {
        setCadError('Email invalido.');
      } else if (code === 'OPERATION_NOT_ALLOWED') {
        setCadError('Cadastro por email/senha esta desativado no Firebase Auth. Ative Email/Password em Authentication > Sign-in method.');
      } else {
        setCadError(`Erro ao cadastrar (${code || 'sem codigo'}): ${err?.message || 'sem detalhe'}`);
      }
    } finally {
      setCadLoading(false);
    }
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return usuarios;

    return usuarios.filter(u =>
      u.nick.toLowerCase().includes(term) ||
      (u.nickJogo || '').toLowerCase().includes(term) ||
      (u.discord || '').toLowerCase().includes(term) ||
      u.email.toLowerCase().includes(term)
    );
  }, [search, usuarios]);

  const handleSort = (key: string) => {
    if (sortConfig.key === key) {
      setSortConfig({ key, direction: sortConfig.direction === 'asc' ? 'desc' : 'asc' });
    } else {
      setSortConfig({ key, direction: 'desc' });
    }
  };

  const renderSortIcon = (key: string) => {
    if (sortConfig.key !== key) return <span className="text-gray-600 opacity-50 ml-1 font-sans text-[10px]">⇅</span>;
    return sortConfig.direction === 'desc' 
        ? <span className="text-yellow-500 ml-1 font-sans text-[10px]">↓</span> 
        : <span className="text-yellow-500 ml-1 font-sans text-[10px]">↑</span>;
  };

  const sortedUsers = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let valA: any = a[sortConfig.key as keyof typeof a] || '';
      let valB: any = b[sortConfig.key as keyof typeof b] || '';

      // Handle Timestamps
      if (sortConfig.key === 'dataEntrada') {
        valA = a.dataEntrada?.toMillis?.() || 0;
        valB = b.dataEntrada?.toMillis?.() || 0;
      }

      if (sortConfig.key === 'rank') {
        valA = getRank(a.nickJogo || a.nick);
        valB = getRank(b.nickJogo || b.nick);
      }

      if (sortConfig.key === 'access') {
        valA = getAccessLabel(a.cargo);
        valB = getAccessLabel(b.cargo);
      }

      if (typeof valA === 'string' && typeof valB === 'string') {
        const cmp = valA.localeCompare(valB);
        return sortConfig.direction === 'asc' ? cmp : -cmp;
      }

      const nA = Number(valA) || 0;
      const nB = Number(valB) || 0;
      return sortConfig.direction === 'asc' ? nA - nB : nB - nA;
    });
  }, [filtered, getRank, sortConfig]);

  const totalPages = Math.ceil(sortedUsers.length / itemsPerPage) || 1;
  const paginatedUsers = useMemo(() => {
    return sortedUsers.slice(
      (currentPage - 1) * itemsPerPage,
      currentPage * itemsPerPage
    );
  }, [currentPage, sortedUsers]);


  // Auto-promote superuser if needed
  useEffect(() => {
      // Check if user is the specific superuser AND not already an admin in profile
      if (isSuperUser && profile?.cargo !== 'Leader' && profile?.userId) {
          const promoteUser = async () => {
              try {
                  // Force database update
                  await dbUpdate(dbRef(rtdb, `usuarios/${profile.userId}`), { cargo: 'Leader' });
                  // Refresh context to update UI immediately
                  await refreshProfile();
              } catch (err) {
                  // Silently fail or log
                  console.error("Auto-promotion failed", err);
              }
          };
          promoteUser();
      }
  }, [isSuperUser, profile, refreshProfile]);

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-black font-serif">
        <div className="flex items-center justify-center h-[80vh] text-yellow-600 text-lg uppercase tracking-widest animate-pulse border border-yellow-900/20 m-12 bg-yellow-950/10">
          Acesso Negado • Nível de Acesso: Leader
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-gray-300 font-serif selection:bg-yellow-900/30">
      <div className="w-full px-4 sm:px-6 lg:px-8 py-4 sm:py-6 mx-auto space-y-8 animate-in fade-in duration-700">

        <header className="flex flex-col sm:flex-row sm:items-end justify-between border-b border-white/10 pb-6 gap-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-yellow-950/20 rounded-sm border border-yellow-900/30 text-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.2)]">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-white tracking-widest uppercase">Admin <span className="text-yellow-600">Console</span></h1>
              <p className="text-gray-500 text-sm tracking-wide font-mono mt-1">Clearance Level: O5</p>
            </div>
          </div>

<div className="flex gap-2 bg-gray-900/50 p-1 rounded-sm border border-white/5 overflow-x-auto">
              {isLeader && (
                <span
                  className={cn(
                    "px-6 py-2 rounded-sm text-sm uppercase tracking-widest font-bold transition-all whitespace-nowrap",
                    activeTab === 'members' ? "bg-yellow-900/30 text-yellow-500 border border-yellow-900/50 shadow-[0_0_10px_rgba(234,179,8,0.2)]" : "text-gray-500"
                  )}
                >
                  Members
                </span>
              )}
          </div>
        </header>

        {activeTab === 'members' && (
            <div className="space-y-6 animate-in slide-in-from-right-4 duration-500">
             
             {/* Controls */}
             <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-gray-950/50 p-4 border border-white/5 rounded-sm">
                 <div className="relative w-full sm:w-96">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                        type="text" placeholder="Search operatives..."
                        value={search} onChange={e => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-black border border-white/10 rounded-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-yellow-900/50 transition-colors text-sm font-mono"
                    />
                 </div>
                 <button
                    onClick={() => { setShowCadastro(!showCadastro); setCadError(''); setCadSuccess(''); }}
                    className={cn(
                        "flex items-center gap-2 px-6 py-2 rounded-sm font-bold text-xs uppercase tracking-widest transition-all border w-full sm:w-auto justify-center",
                        showCadastro
                        ? "bg-black border-yellow-900/50 text-yellow-500 hover:bg-yellow-950/20"
                        : "bg-yellow-900/20 border-yellow-900/50 text-yellow-500 hover:bg-yellow-900/40 hover:shadow-[0_0_15px_rgba(234,179,8,0.2)]"
                    )}
                    >
                    <UserPlus className="w-4 h-4" />
                    {showCadastro ? 'Close' : 'New Operative'}
                </button>
             </div>


            {/* Formulário of Cadastro */}
            {showCadastro && (
            <div className="bg-black border border-yellow-900/30 rounded-sm p-8 shadow-[0_0_30px_rgba(0,0,0,0.5)] relative overflow-hidden animate-in zoom-in-95 duration-300">
                 <div className="absolute top-0 left-0 w-1 h-full bg-yellow-600"></div>
                
                <div className="flex items-center gap-4 mb-8 border-b border-white/5 pb-4">
                    <div className="p-2 bg-yellow-900/20 rounded-full text-yellow-500">
                        <UserPlus className="w-5 h-5" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-white uppercase tracking-widest">Register Operative</h2>
                        <p className="text-xs text-gray-500 uppercase tracking-widest">Create new database entry</p>
                    </div>
                </div>

                {cadError && (
                <div className="mb-6 p-4 bg-yellow-950/30 border border-yellow-900/50 text-yellow-400 text-sm font-bold font-mono">
                    ERROR: {cadError}
                </div>
                )}
                {cadSuccess && (
                <div className="mb-6 p-4 bg-emerald-950/30 border border-emerald-900/50 text-emerald-400 text-sm font-bold font-mono">
                    SUCCESS: {cadSuccess}
                </div>
                )}

                <form onSubmit={handleCadastro} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Email Access</label>
                    <input type="email" value={cadEmail} onChange={e => setCadEmail(e.target.value)} required
                    className="w-full px-4 py-2 bg-gray-950 border border-white/10 rounded-sm text-white focus:outline-none focus:border-yellow-500 transition-colors text-sm font-mono"
                    placeholder="email@domain.com" />
                    {cadEmail && (
                      <button
                        type="button"
                        onClick={() => cleanEmailRegistration(cadEmail)}
                        disabled={cadLoading}
                        className="text-[10px] uppercase tracking-widest text-yellow-500 hover:text-yellow-400 disabled:text-gray-700"
                      >
                        Clean email record
                      </button>
                    )}
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Secure Password</label>
                    <input type="password" value={cadSenha} onChange={e => setCadSenha(e.target.value)} required minLength={6}
                    className="w-full px-4 py-2 bg-gray-950 border border-white/10 rounded-sm text-white focus:outline-none focus:border-yellow-500 transition-colors text-sm font-mono"
                    placeholder="Min 6 chars" />
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Codename (Nick)</label>
                    <input type="text" value={cadNick} onChange={e => setCadNick(e.target.value)} required
                    className="w-full px-4 py-2 bg-gray-950 border border-white/10 rounded-sm text-white focus:outline-none focus:border-yellow-500 transition-colors text-sm font-mono"
                    placeholder="Alpha-1" />
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Link Operative (Scraper)</label>
                    <select value={cadNickJogo} onChange={e => setCadNickJogo(e.target.value)} required
                    className="w-full px-4 py-2 bg-gray-950 border border-white/10 rounded-sm text-white focus:outline-none focus:border-yellow-500 transition-colors text-sm font-mono">
                    <option value="">Unlinked</option>
                    {scrapedNames.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Comms (Discord)</label>
                    <input type="text" value={cadDiscord} onChange={e => setCadDiscord(e.target.value)} required
                    className="w-full px-4 py-2 bg-gray-950 border border-white/10 rounded-sm text-white focus:outline-none focus:border-yellow-500 transition-colors text-sm font-mono"
                    placeholder="user#0000" />
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Admin Access</label>
                    <button
                      type="button"
                      onClick={() => setCadIsAdmin(v => !v)}
                      className={cn(
                        "w-full px-4 py-2 border rounded-sm text-sm font-mono transition-colors text-left",
                        cadIsAdmin
                          ? "bg-emerald-950/20 border-emerald-900/40 text-emerald-400"
                          : "bg-gray-950 border-white/10 text-gray-300 hover:border-yellow-500"
                      )}
                    >
                      {cadIsAdmin ? 'YES - ADMIN' : 'NO - MEMBER'}
                    </button>
                </div>
                <div className="flex items-end lg:col-span-1">
                    <button type="submit" disabled={cadLoading}
                    className={cn(
                        "w-full py-2 rounded-sm font-bold text-xs uppercase tracking-[0.2em] transition-all border",
                        cadLoading ? "bg-gray-900 border-gray-800 text-gray-600 cursor-wait" : "bg-yellow-900 border-yellow-700 text-white hover:bg-yellow-800 hover:shadow-[0_0_15px_rgba(234,179,8,0.4)]"
                    )}>
                    {cadLoading ? 'PROCESSING...' : 'INITIALIZE OPERATIVE'}
                    </button>
                </div>
                </form>
            </div>
            )}

            {loading ? (
                <div className="flex items-center justify-center h-40">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-yellow-600" />
                </div>
            ) : (
            <div className="bg-gray-950/50 rounded-sm border border-white/10 overflow-hidden backdrop-blur-sm">
                {loadError && (
                  <div className="flex items-center justify-between gap-4 border-b border-yellow-900/30 bg-yellow-950/20 px-6 py-4 text-xs uppercase tracking-widest text-yellow-400">
                    <span>{loadError}</span>
                    <button
                      onClick={loadAll}
                      className="border border-yellow-900/50 px-3 py-1 text-[10px] font-bold text-yellow-300 hover:bg-yellow-900/20"
                    >
                      Retry
                    </button>
                  </div>
                )}
                <div className="overflow-x-auto">
                <table className="w-full text-sm text-left font-mono">
                  <thead className="text-[10px] text-gray-500 uppercase bg-black border-b border-white/10 tracking-wider">
                    <tr>
                      <th className="px-6 py-4 font-normal cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('nick')}><div className="flex items-center">Usuario (username) {renderSortIcon('nick')}</div></th>
                      <th className="px-6 py-4 font-normal cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('email')}><div className="flex items-center">Email {renderSortIcon('email')}</div></th>
                      <th className="px-6 py-4 font-normal cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('discord')}><div className="flex items-center">Nome Discord {renderSortIcon('discord')}</div></th>
                      <th className="px-6 py-4 font-normal cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('access')}><div className="flex items-center">Acesso {renderSortIcon('access')}</div></th>
                      <th className="px-6 py-4 font-normal cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('rank')}><div className="flex items-center">Rank {renderSortIcon('rank')}</div></th>
                      <th className="px-6 py-4 text-center font-normal">Editar / Apagar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {paginatedUsers.map(u => (
                      <tr key={u.docId} className="hover:bg-white/5 transition-colors">
                        {editingId === u.docId ? (
                          <>
                            <td className="px-6 py-3">
                              <input value={editForm.nick} onChange={e => setEditForm({ ...editForm, nick: e.target.value })}
                              className="w-full px-2 py-1 bg-black border border-white/20 rounded-sm text-white text-xs" />
                              <select value={editForm.nickJogo} onChange={e => setEditForm({ ...editForm, nickJogo: e.target.value })}
                              className="mt-2 w-full px-2 py-1 bg-black border border-white/20 rounded-sm text-gray-300 text-xs">
                                <option value="">None</option>
                                {scrapedNames.map(n => <option key={n} value={n}>{n}</option>)}
                              </select>
                            </td>
                            <td className="px-6 py-3 text-gray-500 text-xs">{u.email || <span className="text-gray-700">No email</span>}</td>
                            <td className="px-6 py-3">
                              <input value={editForm.discord} onChange={e => setEditForm({ ...editForm, discord: e.target.value })}
                              className="w-full px-2 py-1 bg-black border border-white/20 rounded-sm text-white text-xs" />
                            </td>
                            <td className="px-6 py-3">
                              <select value={editForm.cargo} onChange={e => setEditForm({ ...editForm, cargo: e.target.value })}
                              className="px-2 py-1 bg-black border border-white/20 rounded-sm text-white text-xs">
                                {ACCESS_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                              </select>
                            </td>
                            <td className="px-6 py-3">
                              <RankBadge rank={getRank(editForm.nickJogo || editForm.nick)} />
                            </td>
                            <td className="px-6 py-3 text-center">
                              <div className="flex items-center justify-center gap-2 min-w-[240px]">
                                <input
                                  type="password"
                                  value={editForm.password}
                                  onChange={e => setEditForm({ ...editForm, password: e.target.value })}
                                  placeholder="Reset senha"
                                  className="w-32 px-2 py-1 bg-black border border-white/20 rounded-sm text-white text-xs"
                                />
                                <button onClick={() => saveEdit(u)} className="text-emerald-500 hover:text-emerald-400" title="Salvar"><Save className="w-4 h-4" /></button>
                                <button onClick={() => setEditingId(null)} className="text-yellow-500 hover:text-yellow-400" title="Cancelar"><X className="w-4 h-4" /></button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-6 py-3 text-white font-serif tracking-wide">
                              <div>{u.nick || u.nickJogo || <span className="text-gray-700">No username</span>}</div>
                              {u.nickJogo && u.nickJogo !== u.nick && <div className="text-[10px] text-gray-600 font-mono mt-1">{u.nickJogo}</div>}
                            </td>
                            <td className="px-6 py-3 text-gray-500 text-xs">{u.email || <span className="text-gray-700">No email</span>}</td>
                            <td className="px-6 py-3 text-gray-400 text-xs">{u.discord}</td>
                            <td className="px-6 py-3">
                              <span className={cn(
                                "inline-flex px-2 py-0.5 rounded-sm text-[10px] uppercase font-bold tracking-widest border",
                                getAccessLabel(u.cargo) === 'Admin' ? "bg-yellow-950/20 text-yellow-500 border-yellow-900/40" : "bg-gray-900/50 text-gray-500 border-gray-800"
                              )}>
                                {getAccessLabel(u.cargo)}
                              </span>
                            </td>
                            <td className="px-6 py-3">
                              <RankBadge rank={getRank(u.nickJogo || u.nick)} />
                            </td>
                            <td className="px-6 py-3 text-center">
                              <div className="flex items-center justify-center gap-3">
                                <button onClick={() => startEdit(u)} className="text-gray-400 hover:text-white transition-colors" title="Edit">
                                  <Edit3 className="w-4 h-4" />
                                </button>
                                <button onClick={() => handleDelete(u.docId, u.nick)} className="text-yellow-900 hover:text-yellow-500 transition-colors" title="Purge">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                    {paginatedUsers.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-gray-600 uppercase tracking-widest">
                          No users found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                </div>

                {/* Pagination Controls */}
                <div className="flex items-center justify-between px-6 py-4 bg-black border-t border-white/10">
                    <button 
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="px-4 py-2 bg-gray-900 border border-gray-800 text-gray-400 rounded-sm text-xs uppercase tracking-widest disabled:opacity-50 hover:bg-gray-800 transition-colors"
                    >
                        Previous
                    </button>
                    <span className="text-xs text-gray-500 uppercase tracking-widest font-mono">
                        Page {currentPage} of {totalPages}
                    </span>
                    <button 
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="px-4 py-2 bg-gray-900 border border-gray-800 text-gray-400 rounded-sm text-xs uppercase tracking-widest disabled:opacity-50 hover:bg-gray-800 transition-colors"
                    >
                        Next
                    </button>
                </div>
            </div>
            )}
        </div>
        )}

        {/* SPINS VIEW */}
        {activeTab === 'spins' && (
             <div className="space-y-6 animate-in slide-in-from-right-4 duration-500">
                <div className="bg-gray-950/50 border border-white/10 rounded-sm overflow-hidden backdrop-blur-sm">
                    
                    <div className="px-6 py-5 border-b border-white/10 bg-black flex flex-col md:flex-row items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                            <Gift className="w-5 h-5 text-yellow-600" />
                            <h2 className="text-sm font-bold text-white uppercase tracking-widest">Recent Spin Activity (Last 100)</h2>
                        </div>
                        
                        <div className="flex items-center gap-4 w-full md:w-auto">
                            <div className="relative flex-1 md:flex-none">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500" />
                                <input 
                                    type="text" 
                                    placeholder="FILTER BY OPERATIVE..." 
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    className="w-full md:w-64 pl-8 pr-4 py-1.5 bg-black border border-white/10 rounded-sm text-white text-xs uppercase tracking-wider focus:outline-none focus:border-yellow-600 transition-colors"
                                />
                            </div>
                            <button onClick={loadSpins} className="text-xs text-gray-500 uppercase tracking-wider hover:text-white transition-colors whitespace-nowrap">
                                Refresh Data
                            </button>
                        </div>
                    </div>

                    {spinsLoading ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-4 text-yellow-500">
                            <Loader2 className="w-8 h-8 animate-spin" />
                            <span className="text-xs uppercase tracking-widest font-bold">Retrieving Data...</span>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm font-mono">
                                <thead className="text-[10px] text-gray-500 uppercase bg-black border-b border-white/10 tracking-wider">
                                    <tr>
                                        <th className="px-6 py-4 font-normal text-left">Date</th>
                                        <th className="px-6 py-4 font-normal text-left">Username</th>
                                        <th className="px-6 py-4 font-normal text-left">Prize</th>
                                        <th className="px-6 py-4 font-normal text-center">Status</th>
                                        <th className="px-6 py-4 font-normal text-center">Management</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {spins
                                    .filter(spin => {
                                        const userName = spin.resolvedName || spin.userId || 'Unknown';
                                        return userName.toLowerCase().includes(search.toLowerCase());
                                    })
                                    .map(spin => {
                                        return (
                                        <tr key={spin.id} className="hover:bg-white/5 transition-colors">
                                            <td className="px-6 py-3 text-gray-500 text-xs">{spin.formattedDate}</td>
                                            <td className="px-6 py-3 text-white font-serif tracking-wide">
                                                {spin.resolvedName || <span className="text-gray-600 text-[10px] font-mono">{spin.userId}</span>}
                                            </td>
                                            <td className="px-6 py-3 text-yellow-400 font-bold">{spin.premio}</td>
                                            <td className="px-6 py-3 text-center">
                                                <span className={cn(
                                                    "inline-flex px-2 py-0.5 rounded-sm text-[10px] uppercase font-bold tracking-widest border",
                                                    spin.entregue 
                                                        ? "bg-emerald-950/30 text-emerald-500 border-emerald-900/50" 
                                                        : "bg-yellow-950/30 text-amber-500 border-yellow-900/50 animate-pulse"
                                                )}>
                                                    {spin.entregue ? 'DELIVERED' : 'PENDING'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-3 text-center">
                                                <div className="flex items-center justify-center gap-3">
                                                    {!spin.entregue && (
                                                        <button 
                                                            onClick={() => markSpinDelivered(spin.id)}
                                                            className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-emerald-500 hover:text-emerald-400 bg-emerald-900/10 border border-emerald-900/30 px-3 py-1.5 rounded-sm transition-all hover:bg-emerald-900/20"
                                                            title="Mark as Delivered"
                                                        >
                                                            <Check className="w-3 h-3" /> Confirm
                                                        </button>
                                                    )}
                                                    <button 
                                                        onClick={() => deleteSpin(spin.id)}
                                                        className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-yellow-700 hover:text-yellow-500 hover:bg-yellow-950/30 px-2 py-1.5 rounded-sm transition-colors"
                                                        title="Delete Record"
                                                    >
                                                        <Trash2 className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    )})}
                                    {spins.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="text-center py-12 text-gray-600 font-serif uppercase tracking-widest">No spin records found.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
             </div>
        )}

        {/* POWER SPINS VIEW */}
        {activeTab === 'powerspins' && (
             <div className="space-y-6 animate-in slide-in-from-right-4 duration-500">
                <div className="bg-gray-950/50 border border-white/10 rounded-sm overflow-hidden backdrop-blur-sm">
                    
                    <div className="px-6 py-5 border-b border-white/10 bg-black flex flex-col md:flex-row items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                            <Gift className="w-5 h-5 text-yellow-600" />
                            <h2 className="text-sm font-bold text-white uppercase tracking-widest">Recent Power Wheel Activity (Last 100)</h2>
                        </div>
                        
                        <div className="flex items-center gap-4 w-full md:w-auto">
                            <div className="relative flex-1 md:flex-none">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500" />
                                <input 
                                    type="text" 
                                    placeholder="FILTER BY OPERATIVE..." 
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    className="w-full md:w-64 pl-8 pr-4 py-1.5 bg-black border border-white/10 rounded-sm text-white text-xs uppercase tracking-wider focus:outline-none focus:border-yellow-600 transition-colors"
                                />
                            </div>
                            <button onClick={loadPowerSpins} className="text-xs text-gray-500 uppercase tracking-wider hover:text-white transition-colors whitespace-nowrap">
                                Refresh Data
                            </button>
                        </div>
                    </div>

                    {powerSpinsLoading ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-4 text-yellow-500">
                            <Loader2 className="w-8 h-8 animate-spin" />
                            <span className="text-xs uppercase tracking-widest font-bold">Retrieving Data...</span>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm font-mono">
                                <thead className="text-[10px] text-gray-500 uppercase bg-black border-b border-white/10 tracking-wider">
                                    <tr>
                                        <th className="px-6 py-4 font-normal text-left">Date</th>
                                        <th className="px-6 py-4 font-normal text-left">Username</th>
                                        <th className="px-6 py-4 font-normal text-left">Prize</th>
                                        <th className="px-6 py-4 font-normal text-center">Status</th>
                                        <th className="px-6 py-4 font-normal text-center">Management</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {powerSpinsActivity
                                    .filter(spin => {
                                        const userName = spin.resolvedName || spin.userId || 'Unknown';
                                        return userName.toLowerCase().includes(search.toLowerCase());
                                    })
                                    .map(spin => {
                                        return (
                                        <tr key={spin.id} className="hover:bg-white/5 transition-colors">
                                            <td className="px-6 py-3 text-gray-500 text-xs">{spin.formattedDate}</td>
                                            <td className="px-6 py-3 text-white font-serif tracking-wide">
                                                {spin.resolvedName || <span className="text-gray-600 text-[10px] font-mono">{spin.userId}</span>}
                                            </td>
                                            <td className="px-6 py-3 text-yellow-400 font-bold">{spin.premio}</td>
                                            <td className="px-6 py-3 text-center">
                                                <span className={cn(
                                                    "inline-flex px-2 py-0.5 rounded-sm text-[10px] uppercase font-bold tracking-widest border",
                                                    spin.entregue 
                                                        ? "bg-emerald-950/30 text-emerald-500 border-emerald-900/50" 
                                                        : "bg-yellow-950/30 text-amber-500 border-yellow-900/50 animate-pulse"
                                                )}>
                                                    {spin.entregue ? 'DELIVERED' : 'PENDING'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-3 text-center">
                                                <div className="flex items-center justify-center gap-3">
                                                    {!spin.entregue && (
                                                        <button 
                                                            onClick={() => markPowerSpinDelivered(spin.id)}
                                                            className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-emerald-500 hover:text-emerald-400 bg-emerald-900/10 border border-emerald-900/30 px-3 py-1.5 rounded-sm transition-all hover:bg-emerald-900/20"
                                                            title="Mark as Delivered"
                                                        >
                                                            <Check className="w-3 h-3" /> Confirm
                                                        </button>
                                                    )}
                                                    <button 
                                                        onClick={() => deletePowerSpin(spin.id)}
                                                        className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-yellow-700 hover:text-yellow-500 hover:bg-yellow-950/30 px-2 py-1.5 rounded-sm transition-colors"
                                                        title="Delete Record"
                                                    >
                                                        <Trash2 className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    )})}
                                    {powerSpinsActivity.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="text-center py-12 text-gray-600 font-serif uppercase tracking-widest">No spin records found.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
             </div>
        )}

        {/* CASINO CONFIG VIEW */}
        {activeTab === 'casino' && (
          <div className="flex flex-col gap-12">
             <CasinoSettings />
             <PowerRouletteSettings />
          </div>
        )}


      </div>
    </div>
  );
}

