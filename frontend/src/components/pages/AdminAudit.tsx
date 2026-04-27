import { useMemo, useState } from 'react';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  CalendarCheck,
  CalendarX,
  Coins,
  Gauge,
  Search,
  ShieldAlert,
  Trophy,
  Users,
} from 'lucide-react';
import BrandLogo from '../BrandLogo';
import { RankBadge } from '../RankBadge';
import { useAuth } from '../../hooks/useAuth';
import { useAdminAuditData, type AuditUserRow } from '../../hooks/useAdminAuditData';
import { isAdminCargo, isSuperAdminEmail } from '../../lib/admin';
import { cn } from '../../lib/utils';

type SortKey = 'username' | 'score' | 'monthlyLoot' | 'monthlyTs' | 'activeDays' | 'inactiveDays' | 'donations';
type SortDirection = 'asc' | 'desc';

function formatNumber(value: number): string {
  return value.toLocaleString('pt-BR');
}

function formatCompactNumber(value: number): string {
  const abs = Math.abs(value);
  const units = [
    { value: 1_000_000_000_000, suffix: 'T' },
    { value: 1_000_000_000, suffix: 'B' },
    { value: 1_000_000, suffix: 'M' },
    { value: 1_000, suffix: 'K' },
  ];
  const unit = units.find(item => abs >= item.value);

  if (!unit) return formatNumber(value);

  const compactValue = value / unit.value;
  const maximumFractionDigits = Math.abs(compactValue) < 10 ? 2 : 1;

  return `${compactValue.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  })}${unit.suffix}`;
}

function formatDate(value: string): string {
  if (!value) return 'Sem registro';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function scoreColor(score: number): string {
  if (score >= 80) return 'from-emerald-400 to-cyan-300 text-emerald-200';
  if (score >= 55) return 'from-cyan-400 to-blue-400 text-cyan-200';
  if (score >= 30) return 'from-yellow-400 to-orange-400 text-yellow-200';
  return 'from-rose-500 to-red-400 text-rose-200';
}

function scoreLabel(score: number): string {
  if (score >= 80) return 'Alta';
  if (score >= 55) return 'Boa';
  if (score >= 30) return 'Baixa';
  return 'Critica';
}

function accessLabel(access: string): string {
  return isAdminCargo(access) ? 'Admin' : 'Usuario';
}

function SortButton({
  label,
  sortKey,
  currentKey,
  direction,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey;
  direction: SortDirection;
  onSort: (key: SortKey) => void;
}) {
  const active = currentKey === sortKey;
  const Icon = direction === 'asc' ? ArrowUp : ArrowDown;

  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={cn(
        'inline-flex items-center gap-1 text-left text-[11px] font-bold uppercase text-gray-500 transition-colors hover:text-cyan-200',
        active && 'text-cyan-300',
      )}
    >
      {label}
      {active && <Icon className="h-3 w-3" />}
    </button>
  );
}

function ScoreMeter({ score }: { score: number }) {
  return (
    <div className="min-w-[8.5rem]">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className={cn('text-sm font-black', scoreColor(score))}>{score}</span>
        <span className="text-[11px] uppercase text-gray-500">{scoreLabel(score)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-900 ring-1 ring-white/10">
        <div
          className={cn('h-full rounded-full bg-gradient-to-r shadow-[0_0_14px_rgba(34,211,238,0.35)]', scoreColor(score))}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

export default function AdminAudit() {
  const { user, profile, loading: authLoading } = useAuth();
  const { rows, totals, loading, error, updatedAt } = useAdminAuditData();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [rank, setRank] = useState('all');
  const [scoreBand, setScoreBand] = useState<'all' | 'high' | 'mid' | 'low'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const isAdmin = isAdminCargo(profile?.cargo) || isSuperAdminEmail(user?.email || profile?.email);
  const currentMonth = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date());
  const updatedLabel = updatedAt ? formatDate(updatedAt) : 'Carregando';

  const ranks = useMemo(() => {
    return Array.from(new Set(rows.map(row => row.rank).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const visibleRows = useMemo(() => {
    const term = search.trim().toLowerCase();

    const filtered = rows.filter(row => {
      const matchesTerm = !term || [
        row.username,
        row.email,
        row.discord,
        row.rank,
      ].some(value => value.toLowerCase().includes(term));
      const matchesStatus = status === 'all' || (status === 'active' ? row.activeDays > 0 : row.activeDays === 0);
      const matchesRank = rank === 'all' || row.rank === rank;
      const matchesScore =
        scoreBand === 'all' ||
        (scoreBand === 'high' && row.score >= 80) ||
        (scoreBand === 'mid' && row.score >= 40 && row.score < 80) ||
        (scoreBand === 'low' && row.score < 40);

      return matchesTerm && matchesStatus && matchesRank && matchesScore;
    });

    return [...filtered].sort((a, b) => {
      const aValue = a[sortKey];
      const bValue = b[sortKey];
      const result = typeof aValue === 'string' && typeof bValue === 'string'
        ? aValue.localeCompare(bValue)
        : Number(aValue) - Number(bValue);
      return sortDirection === 'asc' ? result : -result;
    });
  }, [rows, search, status, rank, scoreBand, sortKey, sortDirection]);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDirection(direction => direction === 'asc' ? 'desc' : 'asc');
      return;
    }

    setSortKey(key);
    setSortDirection(key === 'username' ? 'asc' : 'desc');
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-black px-6 py-16 text-cyan-300">
        <div className="mx-auto max-w-7xl">Carregando acesso...</div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-black px-6 py-16 text-gray-300">
        <div className="mx-auto flex max-w-3xl items-center gap-4 border border-red-500/30 bg-red-950/20 p-6">
          <ShieldAlert className="h-8 w-8 text-red-300" />
          <div>
            <h1 className="text-xl font-black text-white">Acesso restrito</h1>
            <p className="mt-1 text-sm text-gray-400">Esta auditoria esta disponivel apenas para administradores.</p>
          </div>
        </div>
      </div>
    );
  }

  const kpis = [
    { label: 'Usuarios', value: formatNumber(totals.users), icon: Users, tone: 'text-cyan-300' },
    { label: 'Ativos', value: formatNumber(totals.activeUsers), icon: CalendarCheck, tone: 'text-emerald-300' },
    { label: 'Loot mensal', value: formatNumber(totals.loot), icon: Trophy, tone: 'text-yellow-300' },
    { label: 'TS mensal', value: formatNumber(totals.ts), icon: Activity, tone: 'text-blue-300' },
    { label: 'Doacoes', value: formatCompactNumber(totals.donations), icon: Coins, tone: 'text-amber-300' },
    { label: 'Score medio', value: `${totals.averageScore}/100`, icon: Gauge, tone: 'text-purple-300' },
  ];

  return (
    <main className="min-h-screen bg-black text-white">
      <section className="border-b border-cyan-400/15 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.13),transparent_36%),linear-gradient(135deg,rgba(0,0,0,1),rgba(7,16,24,0.94))]">
        <div className="mx-auto max-w-[96rem] px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-4">
              <BrandLogo text="King Crow" />
              <div>
                <p className="text-sm font-bold uppercase text-cyan-300">Auditoria mensal</p>
                <h1 className="mt-2 text-3xl font-black uppercase text-white sm:text-5xl">Painel de atividade</h1>
                <p className="mt-2 max-w-3xl text-sm text-gray-400">
                  {currentMonth} - atualizado {updatedLabel}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:min-w-[42rem]">
              {kpis.map(item => (
                <div key={item.label} className="border border-white/10 bg-black/55 p-4 shadow-[0_0_24px_rgba(0,0,0,0.3)]">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-bold uppercase text-gray-500">{item.label}</span>
                    <item.icon className={cn('h-5 w-5', item.tone)} />
                  </div>
                  <p className={cn('mt-3 text-2xl font-black', item.tone)}>{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[96rem] px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-5 grid gap-3 lg:grid-cols-[1fr_11rem_13rem_13rem]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-400" />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Buscar usuario, email, Discord ou rank"
              className="h-12 w-full border border-cyan-500/20 bg-gray-950 pl-11 pr-4 text-sm text-white outline-none transition-colors placeholder:text-gray-600 focus:border-cyan-300"
            />
          </label>

          <select
            value={status}
            onChange={event => setStatus(event.target.value as 'all' | 'active' | 'inactive')}
            className="h-12 border border-cyan-500/20 bg-gray-950 px-3 text-sm text-white outline-none focus:border-cyan-300"
          >
            <option value="all">Todos</option>
            <option value="active">Ativos</option>
            <option value="inactive">Inativos</option>
          </select>

          <select
            value={rank}
            onChange={event => setRank(event.target.value)}
            className="h-12 border border-cyan-500/20 bg-gray-950 px-3 text-sm text-white outline-none focus:border-cyan-300"
          >
            <option value="all">Todos os ranks</option>
            {ranks.map(item => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>

          <select
            value={scoreBand}
            onChange={event => setScoreBand(event.target.value as 'all' | 'high' | 'mid' | 'low')}
            className="h-12 border border-cyan-500/20 bg-gray-950 px-3 text-sm text-white outline-none focus:border-cyan-300"
          >
            <option value="all">Todos os scores</option>
            <option value="high">80 a 100</option>
            <option value="mid">40 a 79</option>
            <option value="low">0 a 39</option>
          </select>
        </div>

        {error && (
          <div className="mb-5 border border-red-500/30 bg-red-950/30 px-5 py-4 text-sm font-bold text-red-200">
            ERROR: {error}
          </div>
        )}

        <div className="overflow-hidden border border-white/10 bg-black shadow-[0_0_32px_rgba(34,211,238,0.08)]">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <div>
              <h2 className="text-lg font-black uppercase text-white">Operatives audit</h2>
              <p className="mt-1 text-xs uppercase text-gray-500">{formatNumber(visibleRows.length)} registros filtrados</p>
            </div>
            {loading && <span className="text-sm font-bold text-cyan-300">Sincronizando...</span>}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[72rem] border-collapse">
              <thead className="bg-gray-950">
                <tr className="border-b border-white/10">
                  <th className="px-5 py-4 text-left">
                    <SortButton label="Usuario" sortKey="username" currentKey={sortKey} direction={sortDirection} onSort={handleSort} />
                  </th>
                  <th className="px-5 py-4 text-left">
                    <SortButton label="Score" sortKey="score" currentKey={sortKey} direction={sortDirection} onSort={handleSort} />
                  </th>
                  <th className="px-5 py-4 text-right">
                    <SortButton label="Loot mes" sortKey="monthlyLoot" currentKey={sortKey} direction={sortDirection} onSort={handleSort} />
                  </th>
                  <th className="px-5 py-4 text-right">
                    <SortButton label="TS mes" sortKey="monthlyTs" currentKey={sortKey} direction={sortDirection} onSort={handleSort} />
                  </th>
                  <th className="px-5 py-4 text-center">
                    <SortButton label="Dias ativos" sortKey="activeDays" currentKey={sortKey} direction={sortDirection} onSort={handleSort} />
                  </th>
                  <th className="px-5 py-4 text-center">
                    <SortButton label="Dias inativos" sortKey="inactiveDays" currentKey={sortKey} direction={sortDirection} onSort={handleSort} />
                  </th>
                  <th className="px-5 py-4 text-right">
                    <SortButton label="Doacao" sortKey="donations" currentKey={sortKey} direction={sortDirection} onSort={handleSort} />
                  </th>
                  <th className="px-5 py-4 text-left">
                    <span className="text-[11px] font-bold uppercase text-gray-500">Rank</span>
                  </th>
                  <th className="px-5 py-4 text-left">
                    <span className="text-[11px] font-bold uppercase text-gray-500">Acesso</span>
                  </th>
                  <th className="px-5 py-4 text-left">
                    <span className="text-[11px] font-bold uppercase text-gray-500">Ultimo registro</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {!loading && visibleRows.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-5 py-12 text-center text-sm text-gray-500">
                      Nenhum usuario encontrado.
                    </td>
                  </tr>
                )}

                {visibleRows.map((row: AuditUserRow) => (
                  <tr key={`${row.username}-${row.email}`} className="border-b border-white/5 transition-colors hover:bg-cyan-950/10">
                    <td className="px-5 py-4">
                      <div className="font-black text-white">{row.username}</div>
                      <div className="mt-1 text-xs text-gray-500">{row.email || 'Sem email'}</div>
                      {row.discord && <div className="mt-1 text-xs text-cyan-500">{row.discord}</div>}
                    </td>
                    <td className="px-5 py-4">
                      <ScoreMeter score={row.score} />
                    </td>
                    <td className="px-5 py-4 text-right font-mono text-sm font-bold text-yellow-300">
                      {formatNumber(row.monthlyLoot)}
                    </td>
                    <td className="px-5 py-4 text-right font-mono text-sm font-bold text-blue-300">
                      {formatNumber(row.monthlyTs)}
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span className="inline-flex min-w-12 items-center justify-center gap-1 border border-emerald-400/20 bg-emerald-950/20 px-3 py-1 text-sm font-bold text-emerald-300">
                        <CalendarCheck className="h-4 w-4" />
                        {row.activeDays}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span className="inline-flex min-w-12 items-center justify-center gap-1 border border-red-400/20 bg-red-950/20 px-3 py-1 text-sm font-bold text-red-300">
                        <CalendarX className="h-4 w-4" />
                        {row.inactiveDays}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right font-mono text-sm font-bold text-amber-300">
                      <span title={formatNumber(row.donations)}>{formatCompactNumber(row.donations)}</span>
                    </td>
                    <td className="px-5 py-4">
                      <RankBadge rank={row.rank} />
                    </td>
                    <td className="px-5 py-4">
                      <span className={cn(
                        'inline-flex min-w-20 justify-center border px-3 py-1 text-xs font-black uppercase',
                        accessLabel(row.access) === 'Admin'
                          ? 'border-cyan-400/30 bg-cyan-950/30 text-cyan-200'
                          : 'border-gray-700 bg-gray-950 text-gray-400',
                      )}>
                        {accessLabel(row.access)}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-400">
                      {formatDate(row.lastSeen)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}
