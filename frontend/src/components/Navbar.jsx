import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  X,
  Shuffle,
  Headphones,
  Check,
  ChevronDown,
} from 'lucide-react';
import BrandLogo from './BrandLogo.jsx';
import { LANGUAGE_OPTIONS, AUDIO_ENGINE_PRESETS } from '../hooks/useUserMedia.js';

/**
 * Navbar.jsx — Barra superior fiel a la identidad visual y física de movimiento de Netflix Web
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

  const navItems = [
    { id: 'home', label: 'Inicio' },
    { id: 'series', label: 'Series' },
    { id: 'movies', label: 'Películas' },
    { id: 'anime', label: 'Anime' },
    { id: 'live_tv', label: 'TV en Vivo' },
    { id: 'downloads', label: 'Offline' },
    { id: 'watchlist', label: 'Mi lista' },
  ];

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-40 transition-all duration-500 ease-nf-out ${
        isScrolled
          ? 'bg-[#141414]/95 backdrop-blur-md py-3 shadow-[0_10px_30px_rgba(0,0,0,0.65)]'
          : 'bg-gradient-to-b from-black/85 via-black/40 to-transparent py-3.5'
      }`}
    >
      <div className="w-full px-4 sm:px-6 lg:px-[3.2%] flex items-center justify-between gap-4">
        {/* Izquierda: Wordmark STREAMFLIX + Navegación estilo Netflix */}
        <div className="flex items-center gap-5 lg:gap-8">
          <button
            type="button"
            onClick={() => {
              setActiveTab('home');
              setLocalQuery('');
              if (onSearch) onSearch('');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="text-left focus:outline-none shrink-0 flex items-center"
          >
            <BrandLogo size="md" showSubtitle={false} />
          </button>

          <nav className="hidden lg:flex items-center gap-1.5 xl:gap-2.5">
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
                  aria-current={isActive ? 'page' : undefined}
                  className={`nav-item relative text-[14px] whitespace-nowrap rounded-full ${
                    isActive ? 'nav-item--active' : ''
                  } ${
                    isActive
                      ? 'text-white font-semibold bg-white/[0.08] px-4 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]'
                      : 'text-[#e5e5e5]/85 hover:text-white font-normal px-3 py-1.5'
                  }`}
                >
                  {item.label}
                  {item.id === 'watchlist' && watchlistCount > 0 && (
                    <span className="ml-1.5 inline-flex items-center justify-center px-1.5 py-0.2 text-[10px] font-black rounded-full bg-[#E50914] text-white animate-capsule-icon">
                      {watchlistCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Derecha: Controles minimalistas estilo Netflix */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Buscador Expandible Netflix con apertura elástica */}
          <form onSubmit={handleSearchSubmit} className="relative flex items-center">
            <div
              onClick={() => {
                setSearchOpen(true);
                setTimeout(() => searchInputRef.current?.focus(), 30);
              }}
              className={`flex items-center rounded-[4px] transition-all duration-300 ease-nf-out ${
                searchOpen || localQuery
                  ? 'w-48 sm:w-64 md:w-72 bg-black/90 border border-white/85 px-2.5 py-1.5 shadow-[0_8px_28px_rgba(0,0,0,0.75)]'
                  : 'w-9 h-9 justify-center border border-transparent hover:bg-white/10 rounded-full cursor-pointer'
              }`}
            >
              <Search
                className={`w-5 h-5 text-white shrink-0 transition-transform duration-300 ease-nf-spring ${
                  searchOpen || localQuery ? 'scale-95 text-neutral-200' : 'hover:scale-110'
                }`}
                strokeWidth={2.2}
              />
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
                    placeholder="Títulos, personas, géneros"
                    className="w-full bg-transparent border-none text-xs sm:text-[13px] text-white placeholder-neutral-400 focus:outline-none ml-2.5 animate-fadeIn"
                  />
                  {localQuery && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleClearSearch();
                      }}
                      className="nf-icon-btn p-1 rounded-full text-neutral-400 hover:text-white animate-capsule-icon"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </>
              )}
            </div>
          </form>

          {/* Sorpréndeme con rotación elástica de icono */}
          {onSurpriseMe && (
            <button
              type="button"
              onClick={onSurpriseMe}
              className="nf-btn nf-shuffle-btn hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-white/12 text-[13px] font-medium text-[#e5e5e5] hover:text-white"
              title="Reproducir o descubrir una recomendación al azar"
            >
              <Shuffle className="w-4 h-4 text-white/90" />
              <span className="hidden xl:inline">Sorpréndeme</span>
            </button>
          )}

          {/* Preferencia de Audio / Idioma con despliegue anclado */}
          <div className="relative" ref={audioMenuRef}>
            <button
              type="button"
              onClick={() => setAudioMenuOpen((prev) => !prev)}
              className={`nf-btn flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
                audioMenuOpen
                  ? 'bg-white/15 text-white'
                  : 'hover:bg-white/10 text-[#e5e5e5] hover:text-white'
              }`}
              title="Motor de Audio Pre-Preparado e Idioma"
            >
              <span className="text-sm leading-none">{currentLang.flag}</span>
              <span className="hidden md:inline">
                {currentAudioPreset.shortLabel}
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-white/80 transition-transform duration-300 ease-nf-out ${
                  audioMenuOpen ? 'rotate-180 text-[#E50914]' : ''
                }`}
              />
            </button>

            {audioMenuOpen && (
              <div className="absolute right-0 mt-2.5 w-80 bg-[#141414]/98 backdrop-blur-2xl border border-white/15 rounded-xl shadow-[0_24px_65px_rgba(0,0,0,0.95)] p-3 z-50 animate-nfDropdown space-y-3">
                <div>
                  <div className="px-2 pb-1.5 border-b border-white/10 flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-300 flex items-center gap-1.5">
                      <Headphones className="w-3.5 h-3.5 text-[#E50914]" />
                      Motor de Audio Pre-Preparado
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
                          className={`w-full text-left px-2.5 py-2 rounded-lg transition-all duration-200 ease-nf-out flex items-start justify-between gap-2 ${
                            active
                              ? 'bg-[#E50914]/20 border border-[#E50914]/60 text-white shadow-[0_0_16px_rgba(229,9,20,0.2)]'
                              : 'hover:bg-white/[0.07] hover:translate-x-0.5 text-neutral-300 border border-transparent'
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <span className="text-base leading-none mt-0.5">{preset.flag}</span>
                            <div>
                              <div className="text-xs font-bold flex items-center gap-1.5">
                                <span>{preset.label}</span>
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-white/10 text-neutral-200 font-semibold">
                                  {preset.badge}
                                </span>
                              </div>
                              <p className="text-[10px] text-neutral-400 mt-0.5 leading-snug">
                                {preset.description}
                              </p>
                            </div>
                          </div>
                          {active && <Check className="w-4 h-4 text-[#E50914] shrink-0 mt-1 animate-nfCheckPop" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-2 border-t border-white/10">
                  <span className="px-2 text-[10px] font-bold uppercase tracking-wider text-neutral-400 block mb-1.5">
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
                          className={`nf-btn px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border ${
                            active
                              ? 'bg-[#E50914] text-white border-red-400 shadow-[0_0_14px_rgba(229,9,20,0.4)]'
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

          {/* Avatar de Perfil Estilo Netflix */}
          <div className="hidden sm:flex items-center pl-1">
            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              aria-label="Abrir Mi Perfil"
              title={profile?.name || 'Mi Perfil'}
              className="flex items-center gap-1.5 group cursor-pointer focus:outline-none"
            >
              <div className="w-8 h-8 rounded-[4px] bg-[#262626] border border-white/15 group-hover:border-white/60 flex items-center justify-center text-white text-base overflow-hidden shadow-sm transition-all duration-300 ease-nf-spring group-hover:scale-105 group-active:scale-95">
                {profile?.photo ? (
                  <img src={profile.photo} alt={profile?.name || 'Perfil'} className="w-full h-full object-cover" />
                ) : (
                  <span>{profile?.avatar || '🎬'}</span>
                )}
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-white/80 group-hover:rotate-180 transition-transform duration-300 ease-nf-out" />
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
              className={`nf-pill py-1.5 px-3 text-xs font-semibold whitespace-nowrap rounded-full ${
                isActive ? 'bg-white/20 text-white shadow-sm' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {item.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setActiveTab('profile')}
          className={`nf-pill py-1.5 px-3 text-xs font-semibold whitespace-nowrap rounded-full ${
            activeTab === 'profile' ? 'bg-white/20 text-white shadow-sm' : 'text-neutral-400'
          }`}
        >
          Mi Perfil
        </button>
      </nav>
    </header>
  );
}
