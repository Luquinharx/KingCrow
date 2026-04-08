import { useState } from 'react';
import { useAllClanStats } from '../../hooks/useAllClanStats';
import { useProfilesData } from '../../hooks/useProfilesData';
import { RankBadge } from '../RankBadge';
import { Coins, Trophy, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

export default function Estatisticas() {
  const { stats, loading } = useAllClanStats();
  const { profiles } = useProfilesData();
  const [activeTab, setActiveTab] = useState<'donations'|'loot'>('donations');

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-4 text-gray-400">
          <Loader2 className="w-12 h-12 animate-spin text-yellow-500" />
          <p className="font-serif tracking-widest uppercase">Loading Gang data...</p>
        </div>
      </div>
    );
  }

  // Users to exclude from donation stats
  const excludedUsers = ['porkchopo', 'oinkmeats', 'SGT EASY PICKINS', 'MGS Green Cake', 'MGS Green Haze'];
  
  // Separate valid stats and order them appropriately. We can have two sections or tables.
  const donationStats = [...stats]
    .filter(s => !excludedUsers.includes(s.username))
    .sort((a, b) => b.donations - a.donations)
    .filter(s => s.donations > 0);
  const lootStats = [...stats];

  return (
    <div className="min-h-screen bg-black text-white p-6 md:p-10 font-sans">
      <div className="w-full px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-8 mx-auto">
        <header className="mb-10 text-center md:text-left flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h1 className="text-4xl md:text-5xl font-black font-serif tracking-wider uppercase bg-gradient-to-r from-white to-slate-500 bg-clip-text text-transparent">
              Gang Statistics
            </h1>
            <p className="text-gray-400 mt-2 tracking-wide">
              Consolidated view of contributions and loot.
            </p>
          </div>
          
          <div className="flex bg-gray-950 p-1.5 border border-white/10 rounded-full shrink-0 shadow-[0_4px_15px_rgba(0,0,0,0.5)]">
            <button
              onClick={() => setActiveTab('donations')}
              className={cn(
                "flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-bold tracking-widest transition-all uppercase",
                activeTab === 'donations' ? "bg-amber-500/20 text-amber-500 shadow-md border border-amber-500/30" : "text-gray-500 hover:text-white"
              )}
            >
              <Coins className="w-4 h-4" /> Top Donators
            </button>
            <button
              onClick={() => setActiveTab('loot')}
              className={cn(
                "flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-bold tracking-widest transition-all uppercase",
                activeTab === 'loot' ? "bg-amber-500/20 text-amber-500 shadow-md border border-amber-500/30" : "text-gray-500 hover:text-white"
              )}
            >
              <Trophy className="w-4 h-4" /> Total Loot
            </button>
          </div>
        </header>

        <div className="w-full">
          
          {activeTab === 'donations' && (
            <div className="bg-[#0a0a0a] border border-white/5 rounded-xl shadow-xl overflow-hidden p-6 relative animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-600 to-red-900" />
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-yellow-950/30 rounded text-yellow-500">
                  <Coins className="w-6 h-6" />
                </div>
                <h2 className="text-xl font-serif uppercase tracking-widest text-gray-200">
                  Top Doadores do Clã
                </h2>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="uppercase tracking-widest text-xs bg-black text-gray-500 font-serif border-b border-white/5">
                    <tr>
                      <th className="px-6 py-4 font-bold">Posição</th>
                      <th className="px-6 py-4 font-bold">Nome do Operador</th>
                      <th className="px-6 py-4 font-bold hidden md:table-cell text-right">Rank</th>
                      <th className="px-6 py-4 font-bold text-right">Valor Doado (Bank)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-mono">
                    {donationStats.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-12 text-center text-gray-500 font-serif tracking-widest uppercase">
                          Nenhuma doação encontrada no registro.
                        </td>
                      </tr>
                    ) : (
                      donationStats.map((stat, i) => (
                        <tr key={stat.username} className="hover:bg-white/[0.02] transition-colors group">
                          <td className="px-6 py-4 text-gray-600">{(i + 1).toString().padStart(2, '0')}</td>
                          <td className="px-6 py-4 font-bold text-gray-200 group-hover:text-yellow-400 transition-colors flex flex-col sm:flex-row gap-2 sm:items-center">
                            {stat.username}
                            <div className="md:hidden">
                                <RankBadge rank={profiles.find(p => p.username === stat.username)?.rank || 'Street Cleaner'} />
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right hidden md:table-cell">
                            <RankBadge rank={profiles.find(p => p.username === stat.username)?.rank || 'Street Cleaner'} />
                          </td>
                          <td className="px-6 py-4 text-right text-emerald-400 font-bold">
                            ${stat.donations.toLocaleString('pt-BR')}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'loot' && (
            <div className="bg-[#0a0a0a] border border-white/5 rounded-xl shadow-xl overflow-hidden p-6 relative animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 to-indigo-900" />
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-blue-950/30 rounded text-blue-400">
                  <Trophy className="w-6 h-6" />
                </div>
                <h2 className="text-xl font-serif uppercase tracking-widest text-gray-200">
                  Accumulated Loot (Base + Scraper)
                </h2>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="uppercase tracking-widest text-xs bg-black text-gray-500 font-serif border-b border-white/5">
                    <tr>
                      <th className="px-6 py-4 font-bold">Posição</th>
                      <th className="px-6 py-4 font-bold">Nome do Operador</th>
                      <th className="px-6 py-4 font-bold hidden md:table-cell text-right">Rank</th>
                      <th className="px-6 py-4 font-bold text-right" title="Base Loot + Coletado Scraper">Total Accumulated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-mono">
                    {lootStats.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-12 text-center text-gray-500 font-serif tracking-widest uppercase">
                          No consolidated loot records.
                        </td>
                      </tr>
                    ) : (
                      lootStats.map((stat, i) => (
                        <tr key={stat.username} className="hover:bg-white/[0.02] transition-colors group">
                          <td className="px-6 py-4 text-gray-600">{(i + 1).toString().padStart(2, '0')}</td>
                          <td className="px-6 py-4 font-bold text-gray-200 group-hover:text-blue-400 transition-colors flex flex-col sm:flex-row gap-2 sm:items-center">
                            {stat.username}
                            {stat.baseLoot > 0 && <span className="text-[10px] uppercase font-sans font-bold bg-blue-950/40 border border-blue-900/40 text-blue-400 px-1.5 py-0.5 rounded" title="Has Base Loot Registered">Base</span>}
                            <div className="md:hidden">
                              <RankBadge rank={profiles.find(p => p.username === stat.username)?.rank || 'Street Cleaner'} />
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right hidden md:table-cell">
                              <RankBadge rank={profiles.find(p => p.username === stat.username)?.rank || 'Street Cleaner'} />
                          </td>
                          <td className="px-6 py-4 text-right text-blue-400 font-bold">
                            {stat.totalLoot.toLocaleString('pt-BR')}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
