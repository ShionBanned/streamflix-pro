import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  X,
  Shuffle,
  Headphones,
  Check,
  ChevronDown,
  Bell,
} from 'lucide-react';
import BrandLogo from './BrandLogo.jsx';
import { LANGUAGE_OPTIONS, AUDIO_ENGINE_PRESETS } from '../hooks/useUserMedia.js';

/**
 * Navbar.jsx — Barra superior oficial estilo Netflix Web (StreamFlix Pro v5.0)
 * - Alineación izquierda: Logo + enlaces tipográficos limpios (Inicio, Series, Películas, Anime, TV en Vivo, Mi lista)
 * - Eliminación total de la pestaña aislada "Clásicos 80s/90s" (integrados pasivamente en los catálogos)
 * - Alineación derecha: Buscador rectangular expandible estilo Netflix Web, Sorpréndeme, Selector de Motor de Audio Pre-Preparado y Avatar
 */
export default function Navbar({
  activeTab,
  setActiveTab,
  onSearch,
  searchQuery,
  watchlistCount = 0,
  preferredLanguage = 'latino',
  onChangeLanguage = null,
  audioEnginePreset = 'latino-aac',
  onChangeAudioPreset = null,
  onSurpriseMe = null,
  profile = null,
}) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [localQuery, setLocalQuery] = useState(searchQuery || '');
  const [audioMenuOpen, setAudioMenuOpen] = useState(false);
  const audioMenuRef = useRef(null);
  const searchInputRef = useRef(null);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 15);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    setLocalQuery(searchQuery || '');
  }, [searchQuery]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (audioMenuRef.current && !audioMenuRef.current.contains(e.target)) {
        setAudioMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (onSearch) onSearch(localQuery);
  };

  const handleClearSearch = () => {
    setLocalQuery('');
    if (onSearch) onSearch('');
  };

  const currentLang =
    LANGUAGE_OPTIONS.find((l) => l.id === preferredLanguage) || LANGUAGE_OPTIONS[0];

  const currentAudioPreset =
    AUDIO_ENGINE_PRESETS.find((p) => p.id === audioEnginePreset) || AUDIO_ENGINE_PRESETS[0];

  // Enlaces tipográficos limpios estilo Netflix Web (sin pestaña aislada de Clásicos 80s/90s)
  const navItems = [
    { id: 'home', label: 'Inicio' },
    { id: 'series', label: 'Series' },
    { id: 'movies', label: 'Películas' },
    { id: 'anime', label: 'Anime', badge: 'SIMULCAST' },
    { id: 'live_tv', label: 'TV en Vivo', isLive: true },
    { id: 'watchlist', label: 'Mi lista', count: watchlistCount },
  ];

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-40 transition-all duration-500 ${
        isScrolled
          ? 'bg-[#141414]/95 backdrop-blur-2xl shadow-[0_10px_30px_rgba(0,0,0,0.9)] py-3 border-b border-white/[0.06]'
          : 'bg-gradient-to-b from-black/90 via-black/50 to-transparent py-4'
      }`}
    >
      <div className="max-w-[1480px] mx-auto px-4 sm:px-8 lg:px-12 flex items-center justify-between gap-4">
        {/* Izquierda: Logo + Navegación Tipográfica Estilo Netflix */}
        <div className="flex items-center gap-6 lg:gap-9">
          <button
            type="button"
            onClick={() => {
              setActiveTab('home');
              setLocalQuery('');
              if (onSearch) onSearch('');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="text-left focus:outline-none shrink-0 transition-transform hover:scale-[1.02]"
          >
            <BrandLogo size="md" showSubtitle={false} />
          </button>

          {/* Enlaces Desktop Estilo Netflix */}
          <nav className="hidden lg:flex items-center gap-5 xl:gap-6">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(item.id);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className={`relative py-1 text-[13.5px] tracking-wide transition-colors duration-200 flex items-center gap-1.5 whitespace-nowrap ${
                    isActive
                      ? 'text-white font-extrabold'
                      : 'text-[#e5e5e5]/75 hover:text-[#b3b3b3] font-medium'
                  }`}
                >
                  {item.isLive && (
                    <span className="w-2 h-2 rounded-full bg-[#E50914] animate-pulse shadow-[0_0_8px_#E50914]" />
                  )}
                  <span>{item.label}</span>
                  {item.badge && (
                    <span className="px-1.5 py-0.2 text-[9px] rounded bg-[#E50914]/20 border border-[#E50914]/50 text-red-300 font-black uppercase tracking-wider">
                      {item.badge}
                    </span>
                  )}
                  {item.count > 0 && (
                    <span className="px-1.5 py-0.2 bg-[#E50914] text-white text-[10px] font-black rounded-full">
                      {item.count}
                    </span>
                  )}
                  {isActive && (
                    <span className="absolute -bottom-1.5 left-0 right-0 h-[2.5px] bg-[#E50914] rounded-full shadow-[0_0_10px_#E50914]" />
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Derecha: Buscador Rectangular Expandible Netflix + Sorpréndeme + Motor de Audio + Perfil */}
        <div className="flex items-center gap-2.5 sm:gap-3.5">
          {/* Buscador Rectangular Expandible idéntico a Netflix Web */}
          <form onSubmit={handleSearchSubmit} className="relative flex items-center">
            <div
              onClick={() => {
                setSearchOpen(true);
                setTimeout(() => searchInputRef.current?.focus(), 30);
              }}
              className={`flex items-center transition-all duration-300 ${
                searchOpen || localQuery
                  ? 'w-48 sm:w-64 md:w-72 bg-black/90 border border-white/85 px-2.5 py-1.5 shadow-[0_0_20px_rgba(0,0,0,0.85)]'
                  : 'w-8 h-8 justify-center border border-transparent hover:text-white cursor-pointer'
              }`}
            >
              <Search className="w-4 h-4 text-white shrink-0" />
              {(searchOpen || localQuery) && (
                <>
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={localQuery}
                    onChange={(e) => {
                      setLocalQuery(e.target.value);
                      if (onSearch) onSearch(e.target.value);
                    }}
                    onBlur={() => {
                      if (!localQuery) setSearchOpen(false);
                    }}
                    placeholder="Títulos, géneros, años 80s/90s..."
                    className="w-full bg-transparent border-none text-xs sm:text-[13px] text-white placeholder-neutral-400 focus:outline-none ml-2.5"
                  />
                  {localQuery && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleClearSearch();
                      }}
                      className="p-0.5 text-neutral-400 hover:text-white transition"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </>
              )}
            </div>
          </form>

          {/* Botón "¿Qué veo hoy? / Sorpréndeme" estilo Netflix */}
          {onSurpriseMe && (
            <button
              type="button"
              onClick={onSurpriseMe}
              className="hidden sm:flex items-center gap-1.5 bg-white/[0.08] hover:bg-white/[0.15] border border-white/15 px-3 py-1.5 rounded text-xs font-bold text-white transition-all hover:scale-105"
              title="Reproducir o descubrir una recomendación al azar"
            >
              <Shuffle className="w-3.5 h-3.5 text-[#E50914]" />
              <span className="hidden xl:inline">Sorpréndeme</span>
            </button>
          )}

          {/* Selector de Motor de Audio Pre-Preparado + Idioma */}
          <div className="relative" ref={audioMenuRef}>
            <button
              type="button"
              onClick={() => setAudioMenuOpen((prev) => !prev)}
              className="flex items-center gap-1.5 bg-[#181818]/90 hover:bg-[#222222] border border-white/15 hover:border-[#E50914]/60 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-all shadow-md"
              title="Motor de Audio Pre-Preparado e Idioma"
            >
              <Headphones className="w-3.5 h-3.5 text-[#E50914]" />
              <span className="text-sm leading-none">{currentLang.flag}</span>
              <span className="hidden md:inline text-neutral-200">
                {currentAudioPreset.shortLabel}
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-neutral-400 transition-transform duration-200 ${
                  audioMenuOpen ? 'rotate-180 text-[#E50914]' : ''
                }`}
              />
            </button>

            {audioMenuOpen && (
              <div className="absolute right-0 mt-2.5 w-80 bg-[#121212]/98 backdrop-blur-3xl border border-white/15 ring-1 ring-[#E50914]/30 rounded-2xl shadow-[0_24px_65px_rgba(0,0,0,0.95)] p-3 z-50 animate-fadeIn space-y-3">
                <div>
                  <div className="px-2 pb-1.5 border-b border-white/10 flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-red-400 flex items-center gap-1.5">
                      <Headphones className="w-3.5 h-3.5 text-[#E50914]" />
                      🎧 Motor de Audio Pre-Preparado (1 Clic)
                    </span>
                  </div>
                  <div className="pt-1.5 space-y-1">
                    {AUDIO_ENGINE_PRESETS.map((preset) => {
                      const active = preset.id === audioEnginePreset;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => {
                            if (onChangeAudioPreset) onChangeAudioPreset(preset.id);
                            else if (preset.langId && onChangeLanguage) {
                              onChangeLanguage(preset.langId);
                            }
                            setAudioMenuOpen(false);
                          }}
                          className={`w-full text-left px-2.5 py-2 rounded-xl transition flex items-start justify-between gap-2 ${
                            active
                              ? 'bg-[#E50914]/25 border border-[#E50914]/60 text-white'
                              : 'hover:bg-white/[0.06] text-neutral-300 border border-transparent'
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <span className="text-base leading-none mt-0.5">{preset.flag}</span>
                            <div>
                              <div className="text-xs font-extrabold flex items-center gap-1.5">
                                <span>{preset.label}</span>
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-white/10 text-neutral-200 font-bold">
                                  {preset.badge}
                                </span>
                              </div>
                              <p className="text-[10px] text-neutral-400 mt-0.5 leading-snug">
                                {preset.description}
                              </p>
                            </div>
                          </div>
                          {active && <Check className="w-4 h-4 text-[#E50914] shrink-0 mt-1" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-2 border-t border-white/10">
                  <span className="px-2 text-[10px] font-extrabold uppercase tracking-wider text-neutral-400 block mb-1.5">
                    Idioma de Interfaz & Metadatos
                  </span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {LANGUAGE_OPTIONS.map((opt) => {
                      const active = opt.id === preferredLanguage;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            if (onChangeLanguage) onChangeLanguage(opt.id);
                            setAudioMenuOpen(false);
                          }}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border transition ${
                            active
                              ? 'bg-[#E50914] text-white border-red-400'
                              : 'bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border-white/10'
                          }`}
                        >
                          <span>{opt.flag}</span>
                          <span className="truncate">{opt.shortLabel}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Notificación + Avatar de Perfil Estilo Netflix */}
          <div className="hidden sm:flex items-center gap-3 pl-1">
            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              aria-label="Abrir Mi Perfil"
              title={profile?.name || 'Mi Perfil'}
              className="w-9 h-9 rounded bg-gradient-to-br from-[#E50914] to-[#8c060d] flex items-center justify-center text-white font-black text-lg shadow-md border border-white/20 cursor-pointer hover:scale-105 transition overflow-hidden"
            >
              {profile?.photo ? <img src={profile.photo} alt="" className="w-full h-full object-cover" /> : profile?.avatar || '🎬'}
            </button>
          </div>
        </div>
      </div>

      {/* Navegación Móvil Compacta */}
      <nav className="flex lg:hidden items-center justify-around px-2 pt-2 border-t border-white/[0.06] mt-2 bg-[#141414]/95 overflow-x-auto no-scrollbar">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setActiveTab(item.id);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className={`py-2 px-2.5 text-xs font-bold whitespace-nowrap transition-colors relative flex items-center gap-1 ${
                isActive ? 'text-white font-extrabold' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {item.isLive && <span className="w-1.5 h-1.5 rounded-full bg-[#E50914] animate-pulse" />}
              <span>{item.label}</span>
              {isActive && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-[#E50914] rounded-full" />
              )}
            </button>
          );
        })}
        <button type="button" onClick={() => setActiveTab('profile')} className={`py-2 px-2.5 text-xs font-bold whitespace-nowrap ${activeTab === 'profile' ? 'text-white border-b-2 border-[#E50914]' : 'text-neutral-400'}`}>Mi Perfil</button>
      </nav>
    </header>
  );
}
