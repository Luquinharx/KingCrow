import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useClanMemberData } from '../../hooks/useClanMemberData';
import { usePowerRouletteConfig, type PowerRoulettePrize } from '../../hooks/usePowerRouletteConfig';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs, addDoc, Timestamp, updateDoc, doc, increment } from 'firebase/firestore';
import { Zap, Info } from 'lucide-react';
import { cn } from '../../lib/utils';

export default function PowerRoleta() {
  const { profile, refreshProfile } = useAuth();
  const { stats } = useClanMemberData(profile?.nickJogo || undefined);
  const { config } = usePowerRouletteConfig();
  
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<PowerRoulettePrize | null>(null);
  
  // Wheel State
  const [rotation, setRotation] = useState(0);
  
  const [usedSpins, setUsedSpins] = useState(0);
  const [history, setHistory] = useState<{ prize: string; date: string; claimed: boolean }[]>([]);

  const getPreviousWeekRange = useCallback(() => {
    const now = new Date();
    const currentDay = now.getDay(); 
    const currentHour = now.getHours();
    const currentMin = now.getMinutes();

    let daysToSubtract = (currentDay + 6) % 7; 
    if (currentDay === 1 && (currentHour < 9 || (currentHour === 9 && currentMin < 2))) {
      daysToSubtract = 7;
    }

    const startOfPrizeWeek = new Date(now);
    startOfPrizeWeek.setDate(now.getDate() - daysToSubtract);
    startOfPrizeWeek.setHours(9, 2, 0, 0);
    
    return { startOfPrizeWeek };
  }, []);

  const { startOfPrizeWeek } = getPreviousWeekRange();

  const rawWeeklyLoot = Number(stats?.weekly_loots || 0);
  const rawClanWeeklyLoot = Number(stats?.clan_weekly_loots || 0);
  const weeklyLoot = Math.max(rawWeeklyLoot, rawClanWeeklyLoot);

  const rawWeeklyTs = Number(stats?.weekly_ts || 0);
  const rawClanWeeklyTs = Number(stats?.clan_weekly_ts || 0);
  const weeklyTs = Math.max(rawWeeklyTs, rawClanWeeklyTs);

  const clanWeeklyLoot = Math.max(rawClanWeeklyLoot, rawWeeklyLoot);
  const clanWeeklyTs = Math.max(rawClanWeeklyTs, rawWeeklyTs);
  
  const isClanEventHighlight = clanWeeklyLoot >= 5000 || clanWeeklyTs >= 3_000_000_000;
  const isPowerRaw = weeklyLoot >= 800 || weeklyTs >= 350_000_000;
  const isQualified = isPowerRaw && !isClanEventHighlight;

  const weeklyTotal = isQualified ? 1 : 0;
  const powerSpins = profile?.powerSpins || 0;

  useEffect(() => {
    if (!profile?.userId) return;
    async function load() {
      try {
        const q = query(
            collection(db, 'power_roletas'), 
            where('userId', '==', profile!.userId)
        );
        const snap = await getDocs(q);
        
        let count = 0;
        const list: { prize: string; date: string; claimed: boolean }[] = [];
        const startTs = startOfPrizeWeek.getTime();

        snap.forEach(d => {
          const data = d.data();
          const dataDate = data.data?.toDate?.();
          
          if (dataDate && dataDate.getTime() >= startTs) {
             count++;
          }

          list.push({
            prize: data.premio,
            date: dataDate ? dataDate.toLocaleString('en-US') : String(data.data),
            claimed: !!data.entregue,
          });
        });

        list.reverse();
        setUsedSpins(count);
        setHistory(list);
      } catch (err) {
        console.error("Error loading spins:", err);
      }
    }
    load();
  }, [profile, startOfPrizeWeek]);

  const remainingWeeklySpins = Math.max(0, weeklyTotal - usedSpins);
  const availableSpins = Math.min(3, remainingWeeklySpins + powerSpins);

  const spinWheel = useCallback(async () => {
    if (spinning || availableSpins <= 0 || !profile?.userId || config.prizes.length === 0) return;
    
    setSpinning(true);
    setResult(null);

    const rand = Math.random() * 100;
    let accumulated = 0;
    let selected = config.prizes[0];
    let selectedIndex = 0;
    
    for (let i = 0; i < config.prizes.length; i++) {
        accumulated += config.prizes[i].chance;
        if (rand <= accumulated) {
            selected = config.prizes[i];
            selectedIndex = i;
            break;
        }
    }

    const sliceAngle = 360 / config.prizes.length;
    // Calculate precise landing point (middle of the slice)
    // Actually the slices are offset by half a slice in the conic gradient
    const prizeCenterAngle = (selectedIndex * sliceAngle); 
    
    // We want the prize to land at the top (0 degrees or 360).
    const spins = 5 * 360; 
    const offsetAngle = 360 - prizeCenterAngle; // to align with top pointer
    
    // Randomize slightly within the slice
    const variance = (Math.random() - 0.5) * (sliceAngle * 0.7); 
    
    const finalRotation = rotation + spins + offsetAngle + variance - (rotation % 360);
    setRotation(finalRotation);

    // Wait exactly 6 seconds for CSS transition
    await new Promise(r => setTimeout(r, 6000));
    
    try {
      await addDoc(collection(db, 'power_roletas'), {
        userId: profile.userId,
        premio: selected.name,
        data: Timestamp.now(),
        entregue: true,
      });

      const hasWeeklyAvailable = weeklyTotal > usedSpins;
      if (!hasWeeklyAvailable && powerSpins > 0) {
        await updateDoc(doc(db, 'usuarios', profile.userId), {
            powerSpins: increment(-1)
        });
      }
    } catch (err) {
      console.error('Error saving spin:', err);
    }
    
    setResult(selected);
    setUsedSpins(prev => prev + 1);
    
    // Re-fetch history
    setHistory(prev => [{ prize: selected.name, date: new Date().toLocaleString('en-US'), claimed: false }, ...prev]);
    
    await refreshProfile?.();
    setSpinning(false);
  }, [spinning, availableSpins, profile, config.prizes, rotation, weeklyTotal, usedSpins, powerSpins, refreshProfile]);

  return (
    <div className="w-full text-gray-200 font-serif selection:bg-purple-900/30 pt-4">
      <div className="w-full mx-auto space-y-10 animate-in fade-in duration-700">

        <header className="flex flex-col sm:flex-row items-center justify-between border-b border-white/10 pb-6 gap-4">
          <div className="flex items-center gap-5">
            <div className="p-4 bg-purple-950/40 rounded-xl text-purple-400 border border-purple-500/30 shadow-[0_0_20px_rgba(168,85,247,0.3)] ring-1 ring-purple-500/20">
              <Zap className="w-8 h-8 drop-shadow-[0_0_10px_rgba(168,85,247,0.8)]" />
            </div>
            <div>
              <h1 className="text-3xl md:text-5xl font-black text-white tracking-widest uppercase drop-shadow-[0_0_15px_rgba(255,255,255,0.2)] font-sans">
                <span className="text-yellow-600">Blood</span> Roleta
              </h1>
              <p className="text-gray-400 font-medium tracking-widest uppercase mt-2 text-sm flex items-center gap-2">
                <Info className="w-4 h-4"/> ONE SPIN PER WEEK • QUALIFICATION: 800+ LOOTS OR 350M+ TS
              </p>
            </div>
          </div>
        </header>

        {/* Dashboard Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-gray-950 border border-white/5 rounded-lg p-5 text-center shadow-2xl relative overflow-hidden group hover:border-purple-500/30 transition-colors">
            <div className="absolute top-0 left-0 w-1 h-full bg-purple-600/50"></div>
              <p className="text-xs text-gray-500 uppercase tracking-widest font-black">Weekly Loot</p>
            <p className="text-2xl font-black text-white mt-2 drop-shadow-md">
                {weeklyLoot.toLocaleString('en-US')}
            </p>
          </div>
          
          <div className="bg-gray-950 border border-white/5 rounded-lg p-5 text-center shadow-2xl relative overflow-hidden group hover:border-purple-500/30 transition-colors">
             <div className="absolute top-0 left-0 w-1 h-full bg-purple-600/50"></div>
            <p className="text-xs text-gray-500 uppercase tracking-widest font-black">Status</p>
            <p className={cn(
                "text-xl font-black mt-2 uppercase tracking-widest", 
                isQualified ? "text-emerald-400 drop-shadow-[0_0_10px_rgba(52,211,153,0.4)]" : "text-yellow-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.4)]"
            )}>
                {isQualified ? "QUALIFIED" : "UNQUALIFIED"}
            </p>
          </div>

          <div className="bg-gray-950 border border-white/5 rounded-lg p-5 text-center shadow-2xl relative overflow-hidden group hover:border-purple-500/30 transition-colors">
            <div className="absolute top-0 left-0 w-1 h-full bg-purple-600/50"></div>
            <p className="text-xs text-gray-500 uppercase tracking-widest font-black">Spins Used</p>
            <p className="text-2xl font-black text-white mt-2 drop-shadow-md">
                {usedSpins} <span className="text-lg text-gray-600">/ {weeklyTotal}</span>
            </p>
          </div>

          <div className="bg-gray-950 border border-purple-900/30 rounded-lg p-5 text-center shadow-[0_0_20px_rgba(168,85,247,0.1)] relative overflow-hidden">
             <div className="absolute top-0 left-0 w-1 h-full bg-fuchsia-500"></div>
            <p className="text-xs text-purple-400 uppercase tracking-widest font-black">Extra Spins</p>
            <p className="text-3xl font-black text-fuchsia-400 mt-2 drop-shadow-[0_0_10px_rgba(217,70,239,0.5)]">
                {powerSpins}
            </p>
          </div>
        </div>

        {/* Central Realistic Wheel Area */}
        <div className="flex flex-col items-center gap-10 py-20 bg-gradient-to-b from-stone-950 to-black rounded-xl border border-white/5 relative overflow-hidden shadow-2xl">
            {/* Background Studio Lights */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-fuchsia-900/20 via-black/90 to-black pointer-events-none"></div>

            {/* Turn Count Display */}
            <div className="z-10 bg-black/80 px-8 py-3 rounded-full border border-purple-500/20 backdrop-blur-md shadow-[0_0_30px_rgba(0,0,0,0.8)]">
                <span className="text-purple-300 font-bold uppercase tracking-widest text-sm flex items-center gap-2">
                    <Zap className="w-4 h-4" /> Available Spins: {availableSpins}
                </span>
            </div>

            {/* REALISTIC WHEEL */}
            <div className="relative w-[320px] h-[320px] sm:w-[480px] sm:h-[480px] flex items-center justify-center my-8 z-10">
                
                {/* Outer Frame Glow */}
                <div className="absolute inset-0 bg-yellow-600/20 rounded-full blur-2xl pointer-events-none scale-110"></div>
                
                {/* Center Pointer / Arrow */}
                <div className="absolute -top-6 z-30 flex flex-col items-center filter drop-shadow-[0_8px_16px_rgba(0,0,0,1)]">
                    <div className="w-10 h-12 bg-gradient-to-b from-stone-100 to-stone-400 rounded-t-lg shadow-[inset_0_2px_4px_rgba(255,255,255,0.8)] border border-gray-400 border-b-none z-10 flex items-center justify-center">
                        <div className="w-2 h-2 rounded-full bg-gray-500 shadow-inner"></div>
                    </div>
                    <div className="w-0 h-0 border-l-[20px] border-l-transparent border-r-[20px] border-r-transparent border-t-[40px] border-t-red-600 drop-shadow-xl z-20 -mt-2"></div>
                </div>

                {/* Outer Block (Brass / Gold / Metal) */}
                <div className="w-full h-full rounded-full relative bg-gradient-to-tr from-yellow-700 via-yellow-400 to-yellow-600 shadow-[0_30px_60px_rgba(0,0,0,0.9),inset_0_5px_15px_rgba(255,255,255,0.4)] border border-yellow-300/30 p-4 sm:p-6 flex items-center justify-center">
                    
                    {/* Decorative Bulbs Container */}
                    <div className="absolute inset-0 rounded-full border border-black/30 shadow-inner pointer-events-none z-20">
                        {Array.from({length: 24}).map((_, i) => (
                            <div key={i} className="absolute origin-bottom" style={{ 
                                height: '50%',
                                width: '12px',
                                top: 0,
                                left: 'calc(50% - 6px)',
                                transform: `rotate(${i * 15}deg)`
                            }}>
                               <div className={cn(
                                   "w-3 h-3 sm:w-4 sm:h-4 rounded-full mt-2 border border-black/50 shadow-2xl",
                                   (spinning ? (i % 2 === 0 ? "bg-amber-100 animate-ping drop-shadow-[0_0_12px_rgba(255,255,255,1)]" : "bg-yellow-500 drop-shadow-[0_0_12px_rgba(239,68,68,1)]") : "bg-yellow-100/50")
                               )}></div>
                            </div>
                        ))}
                    </div>

                    {/* Wheel Spinning Inner Area */}
                    <div 
                        className="w-full h-full rounded-full bg-gray-950 shadow-[0_0_50px_rgba(0,0,0,1)] relative overflow-hidden transition-transform ease-[cubic-bezier(0.1,0.1,0.05,1)] border-[12px] border-gray-800"
                        style={{ 
                            transform: `rotate(${rotation}deg)`,
                            transitionDuration: spinning ? '6000ms' : '0ms'
                        }}
                    >
                        {/* Conic Gradient Slices Backing */}
                        <div className="absolute inset-0 z-0" style={{
                            background: `conic-gradient(from ${-(360/config.prizes.length)/2}deg, ${config.prizes.map((_, i) => `${i%2===0?'#171717':'#262626'} ${i * (360/config.prizes.length)}deg ${(i+1) * (360/config.prizes.length)}deg`).join(', ')})`
                        }}></div>

                        {/* Divider Lines */}
                         <div className="absolute inset-0 z-0 opacity-80" style={{
                            background: `repeating-conic-gradient(from ${-(360/config.prizes.length)/2}deg, transparent 0, transparent ${(360/config.prizes.length) - 0.5}deg, #404040 ${(360/config.prizes.length) - 0.5}deg, #404040 ${360/config.prizes.length}deg)`
                        }}></div>

                        {/* Metal Inner Ring (Smallest) */}
                        <div className="absolute inset-2 md:inset-4 rounded-full border border-gray-700 pointer-events-none z-0"></div>

                        {/* Slices Content */}
                        {config.prizes.map((p, i) => {
                            const sliceAngle = 360 / config.prizes.length;
                            const currentRotation = i * sliceAngle;
                            return (
                                <div key={p.id} className="absolute origin-bottom flex flex-col items-center pt-8 sm:pt-10 z-10" style={{
                                    height: '50%',
                                    width: '100px',
                                    top: 0,
                                    left: 'calc(50% - 50px)',
                                    transform: `rotate(${currentRotation}deg)`
                                }}>
                                    <div className="text-3xl sm:text-5xl drop-shadow-[0_0_20px_rgba(255,255,255,0.4)]">
                                        {p.icon}
                                    </div>
                                </div>
                            )
                        })}
                        
                        {/* Center Hub Overlay */}
                        <div className="absolute inset-0 m-auto w-20 h-20 sm:w-28 sm:h-28 rounded-full bg-gradient-to-tr from-stone-900 to-stone-700 shadow-[0_0_30px_rgba(0,0,0,1)] border-[6px] border-gray-800 flex items-center justify-center z-20">
                            <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br from-fuchsia-900 to-purple-600 shadow-[inset_0_2px_10px_rgba(0,0,0,0.8)] flex items-center justify-center border-[3px] border-purple-950/80">
                                <Zap className="w-6 h-6 sm:w-8 sm:h-8 text-fuchsia-200 drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Spin Control Button */}
             <button
                onClick={spinWheel}
                disabled={spinning || availableSpins <= 0}
                className={cn(
                  "relative z-10 px-12 sm:px-20 py-5 sm:py-6 rounded-full font-sans font-black text-xl sm:text-2xl uppercase tracking-[0.2em] shadow-[0_15px_40px_rgba(0,0,0,0.6)] transform transition-transform active:scale-[0.98] border-b-[6px] active:border-b-0 active:translate-y-1 mt-4",
                  spinning
                    ? "bg-gray-900 text-gray-600 cursor-wait border-gray-950"
                    : availableSpins > 0
                      ? "bg-gradient-to-b from-purple-500 to-purple-700 text-white hover:from-purple-400 hover:to-purple-600 hover:shadow-[0_0_60px_rgba(168,85,247,0.7)] border-purple-900"
                      : "bg-gray-900 text-gray-700 cursor-not-allowed border-gray-950 shadow-none"
                )}
              >
                {spinning ? 'SPINNING...' : 'SPIN THE WHEEL'}
            </button>

             {/* Result Modal / Display */}
             {result && !spinning && (
                <div className="z-20 animate-in fade-in zoom-in duration-500 mt-8 text-center bg-gray-950/80 px-12 py-8 rounded-3xl border border-purple-500/40 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] min-w-[300px]">
                    <div className="text-fuchsia-400 font-sans font-bold uppercase text-xs tracking-[0.4em] mb-4 flex items-center justify-center gap-2">
                      <Zap className="w-4 h-4" /> PRIZE WON <Zap className="w-4 h-4" />
                    </div>
                    <div className="flex flex-col items-center justify-center gap-6">
                      <div className="relative">
                        <div className="absolute inset-0 bg-yellow-500/30 rounded-full blur-3xl scale-150 animate-pulse pointer-events-none"></div>
                        <span className="text-8xl drop-shadow-[0_0_30px_rgba(255,255,255,0.6)] relative z-10 animate-bounce">{result.icon}</span>
                      </div>
                      <p className={cn("text-3xl sm:text-5xl font-black drop-shadow-[0_0_20px_currentColor] uppercase px-4", result.color)}>{result.name}</p>
                      <button onClick={() => setResult(null)} className="mt-4 px-8 py-2 border border-white/10 text-gray-400 uppercase tracking-widest text-xs rounded-full hover:bg-white/5 hover:text-white transition-colors">
                        Close
                      </button>
                    </div>
                </div>
             )}

            {/* Prize Table / Legend */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mt-16 w-full max-w-6xl px-6 opacity-90 z-10">
                {config.prizes.map((p) => (
                    <div key={p.id} className="flex flex-col items-center justify-center p-6 rounded-2xl bg-black/40 border border-white/5 backdrop-blur-xl group hover:border-purple-500/40 hover:bg-purple-900/10 transition-all duration-500">
                        <div className="text-5xl mb-4 group-hover:scale-125 group-hover:-translate-y-2 transition-transform duration-500 drop-shadow-xl">{p.icon}</div>
                        <div className={cn("font-black text-sm tracking-widest uppercase text-center mt-2 font-sans", p.color)}>{p.name}</div>
                        <div className="text-xs text-gray-400 mt-3 font-mono bg-black/50 px-4 py-1.5 rounded-full border border-white/5 shadow-inner">
                          {p.chance}% CHANCE
                        </div>
                    </div>
                ))}
            </div>
        </div>

        {/* History */}
        {history.length > 0 && (
          <div className="bg-gray-950 border border-white/10 rounded-2xl overflow-hidden shadow-[0_20px_40px_rgba(0,0,0,0.6)]">
            <div className="px-8 py-6 border-b border-white/10 bg-gradient-to-r from-purple-950/40 to-transparent flex items-center gap-3">
              <Zap className="w-5 h-5 text-purple-500" />
              <h2 className="text-xl font-black text-white tracking-widest uppercase">Spin History</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm font-sans">
                <thead className="text-xs text-gray-400 uppercase bg-black/50 border-b border-white/5 tracking-wider">
                  <tr>
                    <th className="px-8 py-6 text-left font-bold">Date & Time</th>
                    <th className="px-8 py-6 text-left font-bold">Prize Acquired</th>
                    <th className="px-8 py-6 text-center font-bold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {history.map((h, i) => (
                    <tr key={i} className="hover:bg-purple-900/10 transition-colors group">   
                      <td className="px-8 py-6 text-gray-400 tracking-wide font-mono text-sm group-hover:text-gray-300">{h.date}</td>
                      <td className="px-8 py-6 text-white font-bold tracking-wider">{h.prize}</td>
                      <td className="px-8 py-6 text-center">
                        <span className={cn(
                          "inline-flex px-4 py-1.5 rounded-full text-[10px] uppercase font-black tracking-widest border shadow-inner",
                          h.claimed 
                            ? "bg-emerald-950/40 text-emerald-400 border-emerald-900/40 shadow-[0_0_15px_rgba(52,211,153,0.15)]" 
                            : "bg-amber-950/40 text-amber-400 border-amber-900/40 shadow-[0_0_15px_rgba(251,191,36,0.15)]"
                        )}>
                          {h.claimed ? 'CLAIMED' : 'PENDING'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
