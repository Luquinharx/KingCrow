import { useState, useEffect } from 'react';
import { usePowerRouletteConfig, defaultPowerRouletteConfig } from '../../hooks/usePowerRouletteConfig';
import type { PowerRouletteConfig } from '../../hooks/usePowerRouletteConfig';
import { Save, Plus, Trash2, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '../../lib/utils';

export default function PowerRouletteSettings() {
  const { config, updateConfig, loading } = usePowerRouletteConfig();
  const [localConfig, setLocalConfig] = useState<PowerRouletteConfig>(defaultPowerRouletteConfig);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!loading) {
      setLocalConfig(config);
    }
  }, [config, loading]);

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      // Validate totals
      const totalChance = localConfig.prizes.reduce((acc, p) => acc + Number(p.chance), 0);
      if (Math.abs(totalChance - 100) > 0.1) {
        setMessage(`Error: Chances sum to ${totalChance}%. The total must be exactly 100%.`);
        setSaving(false);
        return;
      }
      
      await updateConfig(localConfig);
      setMessage('Settings saved successfully!');
      setTimeout(() => setMessage(''), 3000);
    } catch (e) {
      setMessage('Error saving settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-yellow-500" /></div>;
  }

  return (
    <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
      
      <div className="bg-gray-950/50 border border-white/10 rounded-sm p-6">
        <div className="flex items-center justify-between mb-6 border-b border-white/10 pb-4">
          <div>
            <h2 className="text-xl font-bold text-white uppercase tracking-widest">Reward Probabilities</h2>
            <p className="text-xs text-gray-500 font-mono mt-1">Configure the prizes, chances, and colors of the roulette. The total must be 100%.</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-12 gap-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest px-2">
            <div className="col-span-3">Prize Name</div>
            <div className="col-span-2">Value (ex: 500k)</div>
            <div className="col-span-2">Chance (%)</div>
            <div className="col-span-2">Icon</div>
            <div className="col-span-2">Color (Tailwind)</div>
            <div className="col-span-1 text-right">Action</div>
          </div>
          
          {localConfig.prizes.map((prize, index) => (
            <div key={prize.id} className="grid grid-cols-12 gap-4 items-center bg-black border border-white/5 p-2 rounded-sm">
              <div className="col-span-3">
                <input
                  type="text"
                  value={prize.name}
                  onChange={e => {
                    const newPrizes = [...localConfig.prizes];
                    newPrizes[index].name = e.target.value;
                    setLocalConfig({ ...localConfig, prizes: newPrizes });
                  }}
                  className="w-full bg-gray-900 border border-white/10 rounded-sm px-2 py-1 text-sm text-white focus:border-yellow-500 outline-none"
                />
              </div>
              <div className="col-span-2">
                <input
                  type="text"
                  value={prize.value}
                  onChange={e => {
                    const newPrizes = [...localConfig.prizes];
                    newPrizes[index].value = e.target.value;
                    setLocalConfig({ ...localConfig, prizes: newPrizes });
                  }}
                  className="w-full bg-gray-900 border border-white/10 rounded-sm px-2 py-1 text-sm text-white focus:border-yellow-500 outline-none"
                />
              </div>
              <div className="col-span-2 text-right flex items-center gap-2">
                <input
                  type="number"
                  value={prize.chance}
                  onChange={e => {
                    const newPrizes = [...localConfig.prizes];
                    newPrizes[index].chance = Number(e.target.value);
                    setLocalConfig({ ...localConfig, prizes: newPrizes });
                  }}
                  className="w-full bg-gray-900 border border-white/10 rounded-sm px-2 py-1 text-sm text-white focus:border-yellow-500 outline-none"
                />
              </div>
              <div className="col-span-2">
                <input
                  type="text"
                  value={prize.icon}
                  onChange={e => {
                    const newPrizes = [...localConfig.prizes];
                    newPrizes[index].icon = e.target.value;
                    setLocalConfig({ ...localConfig, prizes: newPrizes });
                  }}
                  className="w-full bg-gray-900 border border-white/10 rounded-sm px-2 py-1 text-sm text-center focus:border-yellow-500 outline-none"
                />
              </div>
              <div className="col-span-2 flex items-center gap-2">
                 <input
                  type="text"
                  value={prize.color}
                  onChange={e => {
                    const newPrizes = [...localConfig.prizes];
                    newPrizes[index].color = e.target.value;
                    setLocalConfig({ ...localConfig, prizes: newPrizes });
                  }}
                  className="w-full bg-gray-900 border border-white/10 rounded-sm px-2 py-1 text-xs focus:border-yellow-500 outline-none text-gray-300"
                />
              </div>
              <div className="col-span-1 flex justify-end">
                <button
                  onClick={() => {
                    const newPrizes = localConfig.prizes.filter((_, i) => i !== index);
                    setLocalConfig({ ...localConfig, prizes: newPrizes });
                  }}
                  className="p-1.5 text-yellow-900 hover:text-yellow-500 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}

          <button
            onClick={() => {
              const newId = localConfig.prizes.length > 0 ? Math.max(...localConfig.prizes.map(p => p.id)) + 1 : 1;
              setLocalConfig({
                ...localConfig,
                prizes: [...localConfig.prizes, { id: newId, name: 'New prize', chance: 0, value: '0', color: 'text-white', icon: '❓' }]
              });
            }}
            className="flex items-center gap-2 text-xs text-yellow-500 uppercase tracking-widest font-bold hover:text-yellow-400 mt-4"
          >
            <Plus className="w-4 h-4" />
            Add Prize
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        
        <div className="bg-gray-950/50 border border-white/10 rounded-sm p-6">
          <div className="flex items-center justify-between mb-6 border-b border-white/10 pb-4">
            <div>
              <h2 className="text-xl font-bold text-white uppercase tracking-widest">Spins per Loot</h2>
              <p className="text-xs text-gray-500 font-mono mt-1">Loot milestones that award spins</p>
            </div>
          </div>

          <div className="space-y-4">
             <div className="grid grid-cols-2 gap-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest px-2">
                <div>Total Accumulated Loot</div>
                <div>Granted Spins (Total)</div>
             </div>

             {localConfig.lootRules.map((rule, index) => (
                <div key={index} className="grid grid-cols-2 gap-4 bg-black border border-white/5 p-2 rounded-sm items-center">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 text-xs">≥</span>
                    <input
                      type="number"
                      value={rule.amount}
                      onChange={e => {
                        const newRules = [...localConfig.lootRules];
                        newRules[index].amount = Number(e.target.value);
                        setLocalConfig({ ...localConfig, lootRules: newRules });
                      }}
                      className="w-full bg-gray-900 border border-white/10 rounded-sm px-2 py-1 text-sm text-white focus:border-yellow-500 outline-none"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={rule.spins}
                      onChange={e => {
                        const newRules = [...localConfig.lootRules];
                        newRules[index].spins = Number(e.target.value);
                        setLocalConfig({ ...localConfig, lootRules: newRules });
                      }}
                      className="w-full bg-gray-900 border border-white/10 rounded-sm px-2 py-1 text-sm text-white focus:border-yellow-500 outline-none"
                    />
                    <button
                      onClick={() => {
                        const newRules = localConfig.lootRules.filter((_, i) => i !== index);
                        setLocalConfig({ ...localConfig, lootRules: newRules });
                      }}
                      className="text-yellow-900 hover:text-yellow-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
             ))}

            <button
              onClick={() => {
                setLocalConfig({
                  ...localConfig,
                  lootRules: [...localConfig.lootRules, { amount: 0, spins: 0 }]
                });
              }}
              className="flex items-center gap-2 text-xs text-yellow-500 uppercase tracking-widest font-bold hover:text-yellow-400 mt-2"
            >
              <Plus className="w-4 h-4" />
              Add Milestone
            </button>
          </div>
        </div>


        <div className="bg-gray-950/50 border border-white/10 rounded-sm p-6">
          <div className="flex items-center justify-between mb-6 border-b border-white/10 pb-4">
            <div>
              <h2 className="text-xl font-bold text-white uppercase tracking-widest">Spins per Donation</h2>
              <p className="text-xs text-gray-500 font-mono mt-1">Conversion of donated money to spins</p>
            </div>
          </div>

          <div className="space-y-6">
             <div className="flex flex-col gap-2">                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Enable Spins per Donation</label>
                  <button
                    onClick={() => setLocalConfig(prev => ({
                      ...prev, donationRule: { ...prev.donationRule, enabled: !(prev.donationRule.enabled ?? true) }
                    }))}
                    className={cn(
                      "w-12 h-6 rounded-full transition-colors relative",
                      (localConfig.donationRule.enabled ?? true) ? "bg-emerald-600" : "bg-gray-700"
                    )}
                  >
                    <span className={cn(
                      "w-4 h-4 bg-white rounded-full absolute top-1 shadow-md transition-transform",
                      (localConfig.donationRule.enabled ?? true) ? "left-7" : "left-1"
                    )} />
                  </button>
               </div>
               
               <div className={cn("transition-opacity", !(localConfig.donationRule.enabled ?? true) && "opacity-50 pointer-events-none")}>
                 <div className="flex flex-col gap-2 mb-6">                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Donated Value ($ or Base in-game money)</label>
                <input
                  type="number"
                  value={localConfig.donationRule.amount}
                  onChange={e => setLocalConfig(prev => ({
                    ...prev, donationRule: { ...prev.donationRule, amount: Number(e.target.value) }
                  }))}
                  className="w-full bg-black border border-white/10 rounded-sm px-3 py-2 text-sm text-white focus:border-yellow-500 outline-none"
                />
             </div>
             
             <div className="flex flex-col gap-2">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Results in How Many Spins?</label>
                <input
                  type="number"
                  value={localConfig.donationRule.spins}
                  onChange={e => setLocalConfig(prev => ({
                    ...prev, donationRule: { ...prev.donationRule, spins: Number(e.target.value) }
                  }))}
                  className="w-full bg-black border border-white/10 rounded-sm px-3 py-2 text-sm text-white focus:border-yellow-500 outline-none"
                />
             </div>

             <div className="p-4 bg-gray-900/50 rounded-sm border border-gray-800 text-xs text-gray-400 font-mono">
               Example: If configured to 1 resulting in 2 spins, a total donation of 5 will result in {10} automatic spins on the member total account.
             </div>
               </div>
            </div>
          </div>
        <div className="flex items-center justify-between sticky bottom-4 bg-black/90 p-4 border border-white/10 shadow-[0_-10px_30px_rgba(0,0,0,0.8)] backdrop-blur-md rounded-sm mt-8">
          <div>
             {message && (
               <div className={cn("text-xs font-mono font-bold flex items-center gap-2", message.includes('Erro') ? "text-yellow-500" : "text-emerald-500")}>
                 <AlertCircle className="w-4 h-4" />
                 {message}
               </div>
             )}
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-8 py-3 bg-yellow-900/20 border border-yellow-900/50 text-yellow-500 rounded-sm text-sm uppercase tracking-widest font-bold hover:bg-yellow-900/40 hover:shadow-[0_0_15px_rgba(234,179,8,0.3)] transition-all cursor-pointer disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'SALVANDO...' : 'SALVAR CONFIGURAÇÕES'}
          </button>
        </div>
      </div>
    </div>
  );
}
