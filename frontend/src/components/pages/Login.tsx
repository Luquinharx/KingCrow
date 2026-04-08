import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { useNavigate } from 'react-router-dom'; // Using react-router-dom for navigation
import { Skull } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Link } from 'react-router-dom';

export default function Login() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, senha);
      navigate('/dashboard'); // Go to User Dashboard after login
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setError('Email ou senha inválidos.');
      } else if (code === 'auth/too-many-requests') {
        setError('Muitas tentativas. Aguarde um momento.');
      } else {
        setError('Erro ao fazer login. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black font-serif relative overflow-hidden">
      {/* Background Texture */}
      <div className="absolute inset-0 opacity-20 pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/black-felt.png')]"></div>
      
      {/* Red Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-yellow-900/20 blur-[100px] rounded-full pointer-events-none animate-pulse"></div>

      <div className="w-full max-w-lg mx-auto bg-gray-950/80 border border-white/10 rounded-sm p-8 shadow-[0_0_50px_rgba(0,0,0,0.8)] backdrop-blur-sm relative z-10 mt-8">
        <div className="flex flex-col items-center gap-4 mb-8 text-center">
          <div className="p-4 bg-yellow-950/30 rounded-full border border-yellow-900/50 text-yellow-600 shadow-[0_0_15px_rgba(234,179,8,0.4)]">
            <Skull className="w-10 h-10" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white uppercase tracking-[0.2em] font-serif">The Gang of King Crow</h1>
            <p className="text-sm text-gray-500 font-mono tracking-widest mt-2">Identify Yourself</p>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-yellow-950/30 border border-yellow-900/50 rounded-sm text-yellow-400 text-xs font-mono uppercase tracking-wide flex items-center justify-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="block text-[10px] uppercase tracking-widest text-gray-500 font-bold">Email Access</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 bg-black border border-white/10 rounded-sm text-white placeholder:text-gray-700 focus:outline-none focus:border-yellow-600 transition-colors font-mono text-sm"
              placeholder="OPERATIVE@DEAD.COM"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-[10px] uppercase tracking-widest text-gray-500 font-bold">Passcode</label>
            <input
              type="password"
              value={senha}
              onChange={e => setSenha(e.target.value)}
              required
              className="w-full px-4 py-3 bg-black border border-white/10 rounded-sm text-white placeholder:text-gray-700 focus:outline-none focus:border-yellow-600 transition-colors font-mono text-sm"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className={cn(
              "w-full py-3 rounded-sm font-bold text-sm uppercase tracking-[0.2em] transition-all border",
              loading
                ? "bg-gray-900 border-gray-800 text-gray-500 cursor-wait"
                : "bg-yellow-900 border-yellow-700 text-white hover:bg-yellow-800 hover:shadow-[0_0_20px_rgba(234,179,8,0.5)] active:scale-[0.98]"
            )}
          >
            {loading ? 'AUTHENTICATING...' : 'ENTER SYSTEM'}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-white/5 text-center">
            <Link to="/" className="text-xs text-gray-600 hover:text-yellow-500 uppercase tracking-widest transition-colors font-mono">
                return to homepage
            </Link>
        </div>
      </div>
    </div>
  );
}
