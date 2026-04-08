import { cn } from '../lib/utils';
import { Shield, Swords, Star, Circle, User } from 'lucide-react';

export function RankBadge({ rank }: { rank: string }) {
  let color = 'bg-gray-900 text-gray-400 ring-stone-800';
  let Icon = User;
  let displayName = rank || 'Unknown';

  switch (rank) {
    case 'IronHeart':
    case 'Leader':
      color = 'bg-yellow-500 text-black ring-yellow-400';
      Icon = Star;
      displayName = '1. The King';
      break;
    case 'High Warden':
      color = 'bg-yellow-900 text-yellow-300 ring-yellow-700';
      Icon = Shield;
      displayName = '2. Night Watcher';
      break;
    case 'Blade Master':
      color = 'bg-gray-700 text-gray-200 ring-gray-500';
      Icon = Swords;
      displayName = '3. Talon Master';
      break;
    case 'Guardian':
      color = 'bg-gray-800 text-gray-300 ring-gray-600';
      Icon = Shield;
      displayName = '4. Shadow Guard';
      break;
    case 'Gate Soldier':
      color = 'bg-gray-900 text-gray-400 ring-gray-700';
      Icon = Circle;
      displayName = '5. Flock Grunt';
      break;
    case 'Street Cleaner':
      color = 'bg-black text-gray-500 ring-gray-800';
      Icon = User;
      displayName = '6. Scavenger';
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
