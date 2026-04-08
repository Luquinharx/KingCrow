import { Link } from 'react-router-dom';
import { Skull, Users, Shield, Package, Hammer, Calendar, Bird } from 'lucide-react';
import Navbar from '../Navbar';

export default function Home() {
  return (
    <div className="min-h-screen bg-black text-gray-300 font-cinzel overflow-x-hidden">
      <Navbar />
      
      {/* HERO SECTION */}
      <section className="relative h-screen flex flex-col items-center justify-center overflow-hidden">
        {/* Background Video */}
        <div className="absolute inset-0 z-0 bg-black">
             <video 
                autoPlay 
                loop 
                muted 
                playsInline
                className="absolute inset-0 w-full h-full object-cover opacity-60"
             >
                <source src="/herocorvo.mp4" type="video/mp4" />
             </video>
             
             {/* Vignette (Darker edges) */}
             <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.9)_100%)] z-10 pointer-events-none"></div>
             
             {/* Bottom Fade for content readability */}
             <div className="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-black via-black/80 to-transparent z-10 pointer-events-none"></div>
        </div>

        {/* Content */}
        <div className="absolute z-20 flex flex-col items-center justify-center w-full px-4 text-center">
            
            <h1 className="text-5xl md:text-7xl lg:text-8xl font-black text-white/50 tracking-widest drop-shadow-md uppercase mb-6 mix-blend-screen" style={{ textShadow: '2px 2px 8px rgba(0,0,0,0.8)', fontFamily: "'Cinzel Decorative', serif" }}>
               The Gang of King Crow
            </h1>

            <div className="flex flex-col md:flex-row items-center gap-6 justify-center w-full mt-8 mb-12">
                <a href="https://discord.gg/rWzSQQNV" target="_blank" className="relative group px-12 py-5 bg-yellow-900/60 text-white font-bold uppercase tracking-[0.3em] border border-yellow-500/50 hover:bg-yellow-600/90 transition-all rounded-full overflow-hidden backdrop-blur-md shadow-[0_0_30px_rgba(234,179,8,0.4)] hover:shadow-[0_0_60px_rgba(234,179,8,0.9)]">
                    <div className="absolute inset-0 w-full h-full bg-yellow-400/20 -translate-x-full group-hover:translate-x-0 transition-transform duration-500 ease-out"></div>
                    <span className="relative inline-block drop-shadow-lg text-lg">Join The Gang</span>
                </a>
            </div>

            <p className="max-w-2xl text-center text-gray-400 text-lg md:text-xl font-light tracking-widest drop-shadow-2xl bg-black/40 p-6 rounded-[2rem] backdrop-blur-md border border-white/10 shadow-2xl">
               A relaxed Gang with shared storage, fair ranks, and weekly progress tracking.
            </p>
        </div>
      </section>

      {/* Footer minimal */}
      <footer className="py-8 border-t border-white/5 bg-black text-center relative z-20">
          <p className="text-gray-700 text-xs tracking-[0.3em] uppercase">The Gang of King Crow // EST. 2024</p>
      </footer>
    </div>
  );
}
