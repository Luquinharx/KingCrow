
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useClanMemberData, useScrapedUsernames } from '../../hooks/useClanMemberData';
import { useFirestoreClanData } from '../../hooks/useFirestoreClanData';
import { useProfilesData } from '../../hooks/useProfilesData';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts';
import { Search } from 'lucide-react';
import { Tooltip as RechartsTooltip } from 'recharts';



export default function DashboardUser() {
  const { profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlUser = searchParams.get('user');

  const { usernames, loading: loadingNames } = useScrapedUsernames();
  const [selectedNickJogo, setSelectedNickJogo] = useState('');

  // Initial selection logic
  useEffect(() => {
    if (loadingNames) return;

    if (urlUser && usernames.includes(urlUser)) {
      setSelectedNickJogo(urlUser);
    } else if (profile?.nickJogo && usernames.includes(profile.nickJogo)) {
      setSelectedNickJogo(profile.nickJogo);
    } else if (usernames.length > 0 && !selectedNickJogo) {
      setSelectedNickJogo(usernames[0]);
    }
  }, [loadingNames, usernames, profile, urlUser]);

  // Update URL when selection changes
  const handleSelect = (nick: string) => {
      setSelectedNickJogo(nick);
      setSearchParams({ user: nick });
  };

  const { stats, loading: statsLoading } = useClanMemberData(selectedNickJogo || undefined);
  const { data: firestoreData, loading: firestoreLoading } = useFirestoreClanData(selectedNickJogo || undefined);
  const { profiles } = useProfilesData();
  
  // Buscar dados de TS do membro selecionado
  const memberTSData = profiles.find(p => p.username.toLowerCase() === (selectedNickJogo?.toLowerCase() || ''));

  const girosDisponiveis = stats ? Math.floor((stats.weeklyToDate || 0) / 5000) : 0;

  // Calculo Unificado de Loot
  const dbClanLoot = firestoreData.baseLoot || 0;
  const farmedLoot = stats ? stats.weeklyValues.reduce((a, b) => a + b, 0) + stats.weeklyToDate : 0;
  const totalLoot = dbClanLoot + farmedLoot; // Base (se houver) + Apenas o que foi farmado

  // Calculo de Meses no Cla
  let monthsInClan = 0;
  let formattedJoinDate = 'Not found';
  if (firestoreData.joinDate && !isNaN(firestoreData.joinDate.getTime())) {
      const now = new Date();
      const join = firestoreData.joinDate;
      const diffTime = Math.abs(now.getTime() - join.getTime());
      monthsInClan = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 30));
      formattedJoinDate = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(join).toUpperCase();
  }

  // Calculo do Colateral
  const totalDonations = firestoreData.totalDonations || 0;
  const collateralMonthsVal = monthsInClan * 7000000;
  const collateralLootVal = totalLoot * 500;
  const collateralDonationsVal = totalDonations * 2;
  const collateralTotal = collateralMonthsVal + collateralLootVal + collateralDonationsVal;

  const tooltipText = `${monthsInClan} meses = ${collateralMonthsVal.toLocaleString('pt-BR')}
${~~(totalDonations / 1000000)}M doados = ${collateralDonationsVal.toLocaleString('pt-BR')}
${~~(totalLoot / 1000)}K loot = ${collateralLootVal.toLocaleString('pt-BR')}
-------------------
Total = ${collateralTotal.toLocaleString('pt-BR')}`;

  const isLoading = loadingNames;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black">
        <div className="flex items-center justify-center h-[80vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-yellow-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-gray-200">
      <div className="w-full px-4 sm:px-6 lg:px-8 py-4 sm:py-6 mx-auto space-y-8 animate-in fade-in duration-500">

        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-end justify-between border-b border-white/10 pb-6 gap-6">
          <div className="relative">
            <div className="absolute -left-10 top-0 w-1 h-full bg-yellow-600 hidden md:block"></div>
            <h1 className="text-4xl md:text-5xl font-serif font-black text-white tracking-widest uppercase shadow-yellow-500/20 drop-shadow-lg flex items-center gap-4">
                Member <span className="text-yellow-700">Dash</span>
            </h1>
            <p className="text-gray-500 mt-2 flex items-center gap-2 font-serif uppercase tracking-wider text-xs">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"></span>
              </span>
              Live Performance Data
            </p>
          </div>

          <div>
            <label className="block text-xs font-serif font-bold text-gray-500 mb-1 uppercase tracking-widest">Select Member</label>
            <div className="relative group">
                <select
                value={selectedNickJogo}
                onChange={e => handleSelect(e.target.value)}
                className="px-4 py-3 bg-black border border-white/10 rounded-sm text-white focus:outline-none focus:ring-1 focus:ring-red-900 focus:border-yellow-900 transition-all min-w-[250px] font-mono text-sm uppercase appearance-none cursor-pointer hover:border-white/30"
                style={{ colorScheme: 'dark' }}
                >
                {usernames.map(u => (
                    <option key={u} value={u} className="bg-gray-950 text-white hover:bg-yellow-900/20">{u}</option>
                ))}
                </select>
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none group-hover:text-white transition-colors" />
            </div>
          </div>
        </header>

        {/* KPI Cards */}
        {statsLoading || firestoreLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-yellow-600" />
          </div>
        ) : stats ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-gray-900/50 border border-white/5 rounded-sm p-6 shadow-sm flex items-center gap-4 hover:border-yellow-900/30 transition-colors">

                  <div>
                    <p className="text-xs font-serif font-bold text-gray-500 uppercase tracking-widest">Member</p>
                    <p className="text-xl font-bold text-white font-serif truncate max-w-[150px]" title={stats.username}>{stats.username}</p>
                    <p className="text-[10px] text-gray-500 mt-1 uppercase">Join: {formattedJoinDate}</p>
                    {memberTSData && <p className="text-[10px] text-purple-400 mt-1 uppercase font-bold">{memberTSData.rank}</p>}
                  </div>
              </div>

              <div className="bg-gray-900/50 border border-white/5 rounded-sm p-6 shadow-sm flex items-center gap-4 hover:border-yellow-900/30 transition-colors">

                  <div>
                    <p className="text-xs font-serif font-bold text-gray-500 uppercase tracking-widest">Donated</p>
                    <p className="text-xl font-bold text-white font-serif">{totalDonations.toLocaleString('pt-BR')}</p>
                  </div>
              </div>

              <div className="bg-gray-900/50 border border-white/5 rounded-sm p-6 shadow-sm flex items-center gap-4 hover:border-yellow-900/30 transition-colors" title={tooltipText}>

                  <div>
                    <p className="text-xs font-serif font-bold text-gray-500 uppercase tracking-widest">Collateral</p>
                    <p className="text-xl font-bold text-white font-serif">{collateralTotal.toLocaleString('pt-BR')}</p>
                  </div>
              </div>

              <div className="bg-gray-900/50 border border-white/5 rounded-sm p-6 shadow-sm flex items-center gap-4 hover:border-yellow-900/30 transition-colors">

                  <div>
                    <p className="text-xs font-serif font-bold text-gray-500 uppercase tracking-widest">Spins</p>
                    <p className="text-xl font-bold text-white font-serif">{girosDisponiveis}</p>
                  </div>
                </div>
            </div>

            {/* MÃ©tricas de Loot */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-gradient-to-br from-stone-900 to-black border border-white/5 rounded-sm p-6 shadow-lg hover:border-yellow-900/30 transition-colors relative overflow-hidden">
                <div className="absolute top-0 right-0 w-16 h-16 bg-yellow-900/10 blur-[30px] rounded-full"></div>
                <div className="flex flex-col gap-2">
                  <h3 className="text-xs font-serif font-bold text-gray-500 uppercase tracking-widest">Loot Today</h3>
                  <p className="text-3xl font-black text-yellow-500 drop-shadow-[0_0_10px_rgba(234,179,8,0.3)]">
                    +{stats.dailyLoot.toLocaleString('pt-BR')}
                  </p>
                </div>
              </div>

              <div className="bg-gradient-to-br from-stone-900 to-black border border-white/5 rounded-sm p-6 shadow-lg hover:border-white/20 transition-colors relative overflow-hidden">
                <div className="absolute top-0 right-0 w-16 h-16 bg-gray-500/10 blur-[30px] rounded-full"></div>
                <div className="flex flex-col gap-2">
                  <h3 className="text-xs font-serif font-bold text-gray-500 uppercase tracking-widest">Week Loot</h3>
                  <p className="text-3xl font-bold text-white font-serif">
                    {stats.weeklyToDate.toLocaleString('pt-BR')}
                  </p>
                </div>
              </div>

              <div className="bg-gradient-to-br from-stone-900 to-black border border-white/5 rounded-sm p-6 shadow-lg hover:border-white/20 transition-colors relative overflow-hidden">
                <div className="absolute top-0 right-0 w-16 h-16 bg-gray-500/10 blur-[30px] rounded-full"></div>
                <div className="flex flex-col gap-2">
                  <h3 className="text-xs font-serif font-bold text-gray-500 uppercase tracking-widest">All Time Loots</h3>
                  <p className="text-3xl font-bold text-gray-300 font-serif">
                    {stats.currentAll.toLocaleString('pt-BR')}
                  </p>
                </div>
              </div>

              <div className="bg-gradient-to-br from-stone-900 to-black border border-white/5 rounded-sm p-6 shadow-lg hover:border-yellow-900/30 transition-colors relative overflow-hidden">
                <div className="absolute top-0 right-0 w-16 h-16 bg-yellow-900/10 blur-[30px] rounded-full"></div>
                <div className="flex flex-col gap-2">
                  <h3 className="text-xs font-serif font-bold text-gray-500 uppercase tracking-widest">Gang Loot</h3>
                  <p className="text-3xl font-bold text-white font-serif">
                    {(stats.clanAllTime || memberTSData?.all_time_clan_loots || 0).toLocaleString('pt-BR')}
                  </p>
                </div>
              </div>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Loot DiÃ¡rio - Area Chart */}
              <div className="bg-gray-950 border border-white/5 rounded-sm p-6 shadow-xl">
                <h2 className="text-lg font-serif font-bold text-gray-300 mb-6 uppercase tracking-wider">Activity Log (Daily)</h2>
                {stats.dailyHistory.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={stats.dailyHistory}>
                      <defs>
                        <linearGradient id="colorValor" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#eab308" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#eab308" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1c1917" />
                      <XAxis dataKey="data" stroke="#44403c" tick={{ fontSize: 10, fontFamily: 'monospace' }} />
                      <YAxis stroke="#44403c" tick={{ fontSize: 10, fontFamily: 'monospace' }} />
                      <RechartsTooltip
                        contentStyle={{ backgroundColor: '#0c0a09', border: '1px solid #292524', borderRadius: '0px', color: '#e7e5e4', fontFamily: 'monospace' }}
                        itemStyle={{ color: '#facc15' }}
                        labelStyle={{ color: '#78716c' }}
                      />
                      <Area type="monotone" dataKey="valor" stroke="#eab308" fillOpacity={1} fill="url(#colorValor)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[200px] text-gray-600 font-serif uppercase tracking-widest">No Data</div>
                )}
              </div>

              {/* Loot Semanal - Bar Chart */}
              <div className="bg-gray-950 border border-white/5 rounded-sm p-6 shadow-xl">
                <h2 className="text-lg font-serif font-bold text-gray-300 mb-6 uppercase tracking-wider">Weekly Performance</h2>
                {stats.weeklyHistory.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={stats.weeklyHistory}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1c1917" />
                      <XAxis dataKey="semana" stroke="#44403c" tick={{ fontSize: 10, fontFamily: 'monospace' }} />
                      <YAxis stroke="#44403c" tick={{ fontSize: 10, fontFamily: 'monospace' }} />
                      <RechartsTooltip
                        cursor={{fill: '#1c1917'}}
                        contentStyle={{ backgroundColor: '#0c0a09', border: '1px solid #292524', borderRadius: '0px', color: '#e7e5e4', fontFamily: 'monospace' }}
                        itemStyle={{ color: '#facc15' }}
                        labelStyle={{ color: '#78716c' }}
                      />
                      <Bar dataKey="total" fill="#854d0e" radius={[2, 2, 0, 0]} activeBar={{ fill: '#eab308' }} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[200px] text-gray-600 font-serif uppercase tracking-widest">No Data</div>
                )}
              </div>
            </div>

            {/* GrÃ¡ficos de TS */}
            {memberTSData && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* TS DiÃ¡rio - Area Chart */}
                <div className="bg-gray-950 border border-white/5 rounded-sm p-6 shadow-xl">
                  <h2 className="text-lg font-serif font-bold text-gray-300 mb-6 uppercase tracking-wider">TS Daily Activity</h2>
                  <div className="flex items-center justify-center h-[200px] ">
                    <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={[{ data: new Date().toISOString().slice(0,10), valor: memberTSData.daily_ts_calc || 0 }]}>
                        <defs>
                          <linearGradient id="colorTSDaily" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#eab308" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#eab308" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1c1917" />
                        <XAxis dataKey="data" stroke="#44403c" tick={{ fontSize: 10, fontFamily: 'monospace' }} />
                        <YAxis stroke="#44403c" tick={{ fontSize: 10, fontFamily: 'monospace' }} />
                        <RechartsTooltip
                          contentStyle={{ backgroundColor: '#0c0a09', border: '1px solid #292524', borderRadius: '0px', color: '#e7e5e4', fontFamily: 'monospace' }}
                          itemStyle={{ color: '#eab308' }}
                          labelStyle={{ color: '#78716c' }}
                        />
                        <Area type="monotone" dataKey="valor" stroke="#eab308" fillOpacity={1} fill="url(#colorTSDaily)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* TS Semanal - Bar Chart */}
                <div className="bg-gray-950 border border-white/5 rounded-sm p-6 shadow-xl">
                  <h2 className="text-lg font-serif font-bold text-gray-300 mb-6 uppercase tracking-wider">TS Weekly Summary</h2>
                  <div className="flex items-center justify-center h-[200px] ">
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={[{ semana: "Current", total: memberTSData.weekly_ts }]}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1c1917" />
                        <XAxis dataKey="semana" stroke="#44403c" tick={{ fontSize: 10, fontFamily: 'monospace' }} />
                        <YAxis stroke="#44403c" tick={{ fontSize: 10, fontFamily: 'monospace' }} />
                        <RechartsTooltip
                          contentStyle={{ backgroundColor: '#0c0a09', border: '1px solid #292524', borderRadius: '0px', color: '#e7e5e4', fontFamily: 'monospace' }}
                          itemStyle={{ color: '#eab308' }}
                          labelStyle={{ color: '#78716c' }}
                        />
                        <Bar dataKey="total" fill="#eab308" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            {/* MÃ©tricas de TS */}
            {memberTSData && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-gradient-to-br from-stone-900 to-black border border-white/5 rounded-sm p-6 shadow-lg hover:border-purple-900/30 transition-colors relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-16 h-16 bg-purple-900/10 blur-[30px] rounded-full"></div>
                  <div className="flex flex-col gap-2">
                    <h3 className="text-xs font-serif font-bold text-gray-500 uppercase tracking-widest">TS Today</h3>
                    <p className="text-3xl font-black text-purple-500 drop-shadow-[0_0_10px_rgba(168,85,247,0.3)]">
                      +{(memberTSData.daily_ts_calc || 0).toLocaleString('pt-BR')}
                    </p>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-stone-900 to-black border border-white/5 rounded-sm p-6 shadow-lg hover:border-white/20 transition-colors relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-16 h-16 bg-gray-500/10 blur-[30px] rounded-full"></div>
                  <div className="flex flex-col gap-2">
                    <h3 className="text-xs font-serif font-bold text-gray-500 uppercase tracking-widest">Weekly TS</h3>
                    <p className="text-3xl font-bold text-white font-serif">
                      {memberTSData.weekly_ts.toLocaleString('pt-BR')}
                    </p>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-stone-900 to-black border border-white/5 rounded-sm p-6 shadow-lg hover:border-white/20 transition-colors relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-16 h-16 bg-gray-500/10 blur-[30px] rounded-full"></div>
                  <div className="flex flex-col gap-2">
                    <h3 className="text-xs font-serif font-bold text-gray-500 uppercase tracking-widest">All Time TS</h3>
                    <p className="text-3xl font-bold text-gray-300 font-serif">
                      {memberTSData.all_time_ts.toLocaleString('pt-BR')}
                    </p>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-stone-900 to-black border border-white/5 rounded-sm p-6 shadow-lg hover:border-purple-900/30 transition-colors relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-16 h-16 bg-purple-900/10 blur-[30px] rounded-full"></div>
                  <div className="flex flex-col gap-2">
                    <h3 className="text-xs font-serif font-bold text-gray-500 uppercase tracking-widest">Gang TS</h3>
                    <p className="text-3xl font-bold text-white font-serif">
                      {memberTSData.clan_weekly_ts.toLocaleString('pt-BR')}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center justify-center h-40 text-gray-600 font-serif uppercase tracking-widest">
            {selectedNickJogo ? 'No data for this member.' : 'Select member to view data.'}
          </div>
        )}
      </div>
    </div>
  );
}
