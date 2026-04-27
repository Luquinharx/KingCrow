import { useState } from 'react';
import { createUserWithEmailAndPassword, deleteUser, getAuth } from 'firebase/auth';
import { get as dbGet, ref as dbRef, set as dbSet } from 'firebase/database';
import { firebaseConfig, rtdb } from '../../lib/firebase';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { UserPlus } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuth } from '../../hooks/useAuth';
import { useScrapedUsernames } from '../../hooks/useClanMemberData';
import Navbar from '../Navbar';

const CARGOS = ['Member', 'Officer', 'Sub-Leader', 'Leader'];

// Auth secundário para criar usuários sem deslogar o admin
const secondaryApp = getApps().some(app => app.name === 'secondary')
  ? getApp('secondary')
  : initializeApp(firebaseConfig, 'secondary');
const secondaryAuth = getAuth(secondaryApp);

const USER_EMAIL_FIELDS = ['email', 'emailAccess', 'authEmail', 'loginEmail', 'mail'];

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function getStoredEmail(data: Record<string, unknown>): string {
  return USER_EMAIL_FIELDS.map(field => typeof data[field] === 'string' ? data[field] as string : '').find(Boolean) || '';
}

export default function Cadastro() {
  const { profile } = useAuth();
  const { usernames: scrapedNames } = useScrapedUsernames();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [nick, setNick] = useState('');
  const [nickJogo, setNickJogo] = useState('');
  const [discord, setDiscord] = useState('');
  const [dataEntrada, setDataEntrada] = useState('');
  const [cargo, setCargo] = useState('Member');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const isAdmin = profile?.cargo === 'Leader' || profile?.cargo === 'Sub-Leader';

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-950">
        <Navbar />
        <div className="flex items-center justify-center h-[80vh] text-yellow-400 text-lg">
          Acesso restrito a Leaderes e Sub-Leaderes.
        </div>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    setSuccess('');
    const emailToCreate = normalizeEmail(email);
    let createdAuthUser: Awaited<ReturnType<typeof createUserWithEmailAndPassword>>['user'] | null = null;

    try {
      const usersSnap = await dbGet(dbRef(rtdb, 'usuarios'));
      const users = usersSnap.exists() ? usersSnap.val() as Record<string, Record<string, unknown>> : {};
      const emailAlreadyInDatabase = Object.values(users).some(data => normalizeEmail(getStoredEmail(data)) === emailToCreate);

      if (emailAlreadyInDatabase) {
        setError('Este email ja existe no banco de usuarios.');
        return;
      }

      const cred = await createUserWithEmailAndPassword(secondaryAuth, emailToCreate, senha);
      createdAuthUser = cred.user;
      const uid = cred.user.uid;

      await dbSet(dbRef(rtdb, `usuarios/${uid}`), {
        userId: uid,
        email: emailToCreate,
        emailNormalized: emailToCreate,
        nick,
        nickJogo,
        discord,
        dataEntrada: dataEntrada ? new Date(dataEntrada + 'T00:00:00').toISOString() : new Date().toISOString(),
        cargo,
        lootSemanal: 0,
        lootTotal: 0,
        roletaDisponivel: 0,
        criadoEm: new Date().toISOString(),
      });

      setSuccess(`Usuário "${nick}" cadastrado com sucesso!`);
      setEmail(''); setSenha(''); setNick(''); setNickJogo(''); setDiscord(''); setDataEntrada(''); setCargo('Member');
    } catch (err: any) {
      if (createdAuthUser) {
        await deleteUser(createdAuthUser).catch((deleteError) => {
          console.error('Erro ao desfazer usuario criado no Auth:', deleteError);
        });
      }

      const code = err?.code || '';
      if (code === 'auth/email-already-in-use') {
        setError('Este email ja existe no Firebase Auth.');
      } else if (code === 'auth/weak-password') {
        setError('A senha deve ter pelo menos 6 caracteres.');
      } else if (code === 'auth/invalid-email') {
        setError('Email invalido.');
      } else {
        setError('Erro ao cadastrar. Tente novamente.');
      }
    } finally {
      await secondaryAuth.signOut().catch(() => {});
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <Navbar />
      <div className="flex items-center justify-center p-4 mt-8">
        <div className="w-full max-w-lg mx-auto bg-gray-900 border border-slate-800 rounded-xl p-8 shadow-xl mt-8">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-3 bg-emerald-500/10 rounded-lg text-emerald-400">
            <UserPlus className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Cadastro</h1>
            <p className="text-sm text-gray-400">Crie sua conta no clã</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-yellow-400 text-sm">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-sm">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Email</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)} required
              className="w-full px-4 py-2.5 bg-gray-950 border border-slate-800 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
              placeholder="seu@email.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Senha</label>
            <input
              type="password" value={senha} onChange={e => setSenha(e.target.value)} required minLength={6}
              className="w-full px-4 py-2.5 bg-gray-950 border border-slate-800 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
              placeholder="Mínimo 6 caracteres"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Nick no Jogo</label>
            <input
              type="text" value={nick} onChange={e => setNick(e.target.value)} required
              className="w-full px-4 py-2.5 bg-gray-950 border border-slate-800 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
              placeholder="Seu nick ingame"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Vincular ao Scraper (username coletado)</label>
            <select
              value={nickJogo} onChange={e => setNickJogo(e.target.value)} required
              className="w-full px-4 py-2.5 bg-gray-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
            >
              <option value="">Selecione o username...</option>
              {scrapedNames.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <p className="text-xs text-gray-500 mt-1">Username que aparece nos dados coletados do clã</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Discord</label>
            <input
              type="text" value={discord} onChange={e => setDiscord(e.target.value)} required
              className="w-full px-4 py-2.5 bg-gray-950 border border-slate-800 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
              placeholder="usuario#1234"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Data de Entrada</label>
              <input
                type="date" value={dataEntrada} onChange={e => setDataEntrada(e.target.value)} required
                className="w-full px-4 py-2.5 bg-gray-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Cargo</label>
              <select
                value={cargo} onChange={e => setCargo(e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
              >
                {CARGOS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className={cn(
              "w-full py-2.5 rounded-lg font-semibold text-white transition-all mt-2",
              loading
                ? "bg-emerald-500/50 cursor-not-allowed"
                : "bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700"
            )}
          >
            {loading ? 'Cadastrando...' : 'Cadastrar'}
          </button>
        </form>
      </div>
    </div>
    </div>
  );
}
