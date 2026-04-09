import { cn } from '../lib/utils';
import { Shield, Swords, Star, Circle, User } from 'lucide-react';

export function RankBadge({ rank }: { rank: string }) {
  let color = 'bg-gray-900 text-gray-400 ring-stone-800';
  let Icon = User;
  let displayName = rank || 'Unknown';

  switch (rank) {
    case 'KING':
    case 'K I N G':
      color = 'bg-yellow-500 text-yellow-950 ring-yellow-400 font-black';
      Icon = Star;
      displayName = '1. KING';
      break;
    case 'Regent Crow':
      color = 'bg-gray-300 text-gray-900 ring-gray-400 font-bold';
      Icon = Shield;
      displayName = '2. Regent Crow';
      break;
    case 'Eternal Crow':
    case 'Eternal Crows':
      color = 'bg-[#cd7f32] text-white ring-[#a05f20] font-bold';
      Icon = Swords;
      displayName = '3. Eternal Crows';
      break;
    case 'Legendary Crows':
      color = 'bg-zinc-800 text-zinc-300 ring-zinc-700';
      Icon = Shield;
      displayName = '4. Legendary Crows';
      break;
    case 'Black Crows':
      color = 'bg-neutral-900 text-neutral-400 ring-neutral-800';
      Icon = Circle;
      displayName = '5. Black Crows';
      break;
    case 'Nest Crows':
      color = 'bg-stone-950 text-stone-500 ring-stone-800';
      Icon = User;
      displayName = '6. Nest Crows';
      break;
    default:
      color = 'bg-black text-gray-600 ring-gray-800';
      Icon = User;
      break;
  }

  return (
    <span className={cn(
      'inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ring-1 uppercase tracking-wider w-[10rem]',
      color
    )}>
      <Icon className="w-3 h-3 flex-shrink-0" />
      <span className="truncate">{displayName}</span>
    </span>
  );
}
