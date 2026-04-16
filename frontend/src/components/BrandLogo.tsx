import { cn } from '../lib/utils';

interface BrandLogoProps {
  className?: string;
  iconClassName?: string;
  textClassName?: string;
  showText?: boolean;
  text?: string;
}

export default function BrandLogo({
  className,
  iconClassName,
  textClassName,
  showText = true,
  text = 'King Crow',
}: BrandLogoProps) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div className={cn(
        'relative h-11 w-11 overflow-hidden rounded-full border border-cyan-400/40 shadow-[0_0_20px_rgba(34,211,238,0.35)]',
        iconClassName,
      )}>
        <video
          autoPlay
          loop
          muted
          playsInline
          className="h-full w-full object-cover"
        >
          <source src="/G.mp4" type="video/mp4" />
        </video>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/15 via-transparent to-cyan-400/25" />
      </div>

      {showText && (
        <span className={cn(
          'text-xl sm:text-2xl font-serif font-black tracking-widest text-white uppercase drop-shadow-sm',
          textClassName,
        )}>
          <span className="text-cyan-400">{text.split(' ')[0]}</span> {text.split(' ').slice(1).join(' ')}
        </span>
      )}
    </div>
  );
}
