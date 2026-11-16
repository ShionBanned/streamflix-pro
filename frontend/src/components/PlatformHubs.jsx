import React from 'react';
import { Layers3, ChevronRight } from 'lucide-react';

export const PLATFORMS = [
  {
    id: 8,
    name: 'Netflix',
    badge: 'N',
    color: '#E50914',
    bgClass: 'bg-red-950/40 border-red-800/40 hover:border-red-500 hover:bg-red-900/40 text-red-100',
    activeClass: 'ring-2 ring-red-500 border-red-500 bg-red-950/80 shadow-lg shadow-red-950/50',
    accentText: 'text-red-500',
  },
  {
    id: 1899,
    name: 'Max',
    badge: 'MAX',
    color: '#002BE7',
    bgClass: 'bg-blue-950/40 border-blue-800/40 hover:border-blue-500 hover:bg-blue-900/40 text-blue-100',
    activeClass: 'ring-2 ring-blue-500 border-blue-500 bg-blue-950/80 shadow-lg shadow-blue-950/50',
    accentText: 'text-blue-400',
  },
  {
    id: 337,
    name: 'Disney+',
    badge: 'D+',
    color: '#113CCF',
    bgClass: 'bg-indigo-950/40 border-indigo-800/40 hover:border-cyan-400 hover:bg-indigo-900/40 text-cyan-100',
    activeClass: 'ring-2 ring-cyan-400 border-cyan-400 bg-indigo-950/80 shadow-lg shadow-indigo-950/50',
    accentText: 'text-cyan-400',
  },
  {
    id: 119,
    name: 'Prime Video',
    badge: 'prime',
    color: '#00A8E1',
    bgClass: 'bg-sky-950/40 border-sky-800/40 hover:border-sky-400 hover:bg-sky-900/40 text-sky-100',
    activeClass: 'ring-2 ring-sky-400 border-sky-400 bg-sky-950/80 shadow-lg shadow-sky-950/50',
    accentText: 'text-sky-400',
  },
  {
    id: 283,
    name: 'Crunchyroll',
    badge: 'CR',
    color: '#F47521',
    bgClass: 'bg-orange-950/40 border-orange-800/40 hover:border-orange-500 hover:bg-orange-900/40 text-orange-100',
    activeClass: 'ring-2 ring-orange-500 border-orange-500 bg-orange-950/80 shadow-lg shadow-orange-950/50',
    accentText: 'text-orange-400',
  },
  {
    id: 350,
    name: 'Apple TV+',
    badge: 'tv+',
    color: '#A2A2A2',
    bgClass: 'bg-neutral-900/60 border-neutral-700/50 hover:border-neutral-400 hover:bg-neutral-800 text-gray-100',
    activeClass: 'ring-2 ring-white border-white bg-neutral-800 shadow-lg shadow-white/10',
    accentText: 'text-gray-300',
  },
];

export default function PlatformHubs({ activeHub, onSelectHub }) {
  return (
    <div className="w-full max-w-[1480px] mx-auto px-4 sm:px-8 lg:px-12 my-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Layers3 className="w-4 h-4 text-[#E50914]" />
          <span className="text-xs sm:text-sm font-bold text-white">
            Explorar por plataforma
          </span>
        </div>
        {activeHub && (
          <button
            onClick={() => onSelectHub(null)}
            className="text-xs text-red-400 hover:text-red-300 font-semibold transition flex items-center gap-1"
          >
            <span>Ver todo el catálogo</span>
            <span>✕</span>
          </button>
        )}
      </div>

      <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-2">
        {PLATFORMS.map((platform) => {
          const isSelected = activeHub?.id === platform.id;
          return (
            <button
              key={platform.id}
              onClick={() => onSelectHub(isSelected ? null : platform)}
              className={`group relative min-w-[145px] sm:min-w-[172px] py-3 px-3.5 rounded-md border transition-all duration-300 text-left flex items-center justify-between overflow-hidden ${isSelected ? 'bg-[#292929] border-white/70 shadow-lg' : 'bg-[#1b1b1b] border-white/10 hover:bg-[#292929] hover:border-white/30'}`}
            >
              <span className="absolute left-0 top-0 bottom-0 w-0.5 opacity-70 group-hover:opacity-100 transition-opacity" style={{ backgroundColor: platform.color }} />
              <div>
                <span className="block text-xs sm:text-sm font-bold text-white tracking-wide font-netflix">
                  {platform.name}
                </span>
                <span className="text-[10px] font-medium text-neutral-400">
                  {isSelected ? 'Seleccionado' : 'Ver títulos'}
                </span>
              </div>
              <ChevronRight className={`w-4 h-4 transition-transform group-hover:translate-x-1 ${isSelected ? 'text-white' : 'text-neutral-500'}`} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
