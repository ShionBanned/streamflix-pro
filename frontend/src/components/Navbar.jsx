import React, { useState, useEffect, useRef } from 'react';
import {
  Film,
  Tv,
  Radio,
  Search,
  X,
  Flame,
  Bookmark,
  Globe,
  ChevronDown,
  Check,
  Sparkles,
  Shuffle,
  History,
} from 'lucide-react';
import BrandLogo from './BrandLogo.jsx';
import { LANGUAGE_OPTIONS } from '../hooks/useUserMedia.js';

export default function Navbar({
  activeTab,
  setActiveTab,
  onSearch,
  searchQuery,
  watchlistCount = 0,
  preferredLanguage = 'latino',
  onChangeLanguage = null,
  onSurpriseMe = null,
}) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [localQuery, setLocalQuery] = useState(searchQuery || '');
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const langMenuRef = useRef(null);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    setLocalQuery(searchQuery || '');
  }, [searchQuery]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (langMenuRef.current && !langMenuRef.current.contains(e.target)) {
        setLangMenuOpen(false);
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

  const navItems = [
    { id: 'home', label: 'Inicio', icon: null },
    { id: 'movies', label: 'Películas', icon: Film, iconColor: 'text-[#E50914]' },
    { id: 'series', label: 'Series', icon: Tv, iconColor: 'text-sky-400' },
    {
      id: 'classics',
      label: 'Clásicos 80s/90s',
      icon: History,
      iconColor: 'text-amber-400',
      badge: 'RETRO',
      badgeClass: 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-black',
    },
    {
      id: 'anime',
      label: 'Anime',
      icon: Flame,
      iconColor: 'text-orange-500 fill-current',
      badge: 'CR',
      badgeClass: 'bg-[#F47521] text-black font-black',
    },
    {
      id: 'live_tv',
      label: 'TV en Vivo',
      icon: Radio,
      iconColor: 'text-red-500 animate-pulse',
      badge: 'LIVE',
      badgeClass: 'bg-[#E50914] text-white font-extrabold',
    },
    {
      id: 'watchlist',
      label: 'Mi Lista',
      icon: Bookmark,
      iconColor: 'text-amber-400',
      count: watchlistCount,
    },
  ];

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-40 transition-all duration-500 ${
        isScrolled
          ? 'bg-[#0f0f0f]/95 backdrop-blur-2xl shadow-[0_12px_36px_rgba(0,0,0,0.9)] py-2.5 border-b border-white/[0.07]'
          : 'bg-gradient-to-b from-black/95 via-black/60 to-transparent py-3.5'
      }`}
    >
      <div className="max-w-[1480px] mx-auto px-4 sm:px-8 lg:px-12 flex items-center justify-between gap-3">
        {/* Left: Custom Brand Logo + Navigation Links */}
        <div className="flex items-center gap-5 xl:gap-8">
          <button
            onClick={() => {
              setActiveTab('home');
              setLocalQuery('');
              if (onSearch) onSearch('');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="text-left focus:outline-none shrink-0"
          >
            <BrandLogo size="md" showSubtitle={true} />
          </button>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className={`relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-semibold transition-all duration-200 whitespace-nowrap ${
                    isActive
                      ? 'text-white font-bold bg-white/[0.09] shadow-inner'
                      : 'text-neutral-300 hover:text-white hover:bg-white/[0.05]'
                  }`}
                >
                  {Icon && <Icon className={`w-3.5 h-3.5 ${item.iconColor}`} />}
                  <span>{item.label}</span>
                  {item.badge && (
                    <span
                      className={`px-1.5 py-0.2 text-[9px] rounded uppercase tracking-wider ${item.badgeClass}`}
                    >
                      {item.badge}
                    </span>
                  )}
                  {item.count > 0 && (
                    <span className="px-1.5 py-0.2 bg-amber-500/20 border border-amber-400/40 text-amber-300 text-[10px] font-extrabold rounded-full">
                      {item.count}
                    </span>
                  )}
                  {isActive && (
                    <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-[#E50914] rounded-full shadow-[0_0_8px_#E50914]" />
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Right: Search + Surprise Me + Global Language Selector */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* Search Input */}
          <form onSubmit={handleSearchSubmit} className="relative flex items-center">
            <div
              className={`flex items-center transition-all duration-300 rounded-full border ${
                searchOpen || localQuery
                  ? 'w-44 sm:w-64 bg-black/95 border-white/30 px-3 py-1.5 shadow-lg shadow-black/60'
                  : 'w-9 h-9 border-white/10 bg-white/[0.04] justify-center hover:bg-white/10 cursor-pointer'
              }`}
              onClick={() => setSearchOpen(true)}
            >
              <Search className="w-4 h-4 text-neutral-200 shrink-0" />
              {(searchOpen || localQuery) && (
                <>
                  <input
                    type="text"
                    value={localQuery}
                    onChange={(e) => {
                      setLocalQuery(e.target.value);
                      if (onSearch) onSearch(e.target.value);
                    }}
                    onBlur={() => {
                      if (!localQuery) setSearchOpen(false);
                    }}
                    placeholder="Película, serie de los 90s, actor..."
                    className="w-full bg-transparent border-none text-xs sm:text-sm text-white placeholder-neutral-500 focus:outline-none ml-2"
                    autoFocus
                  />
                  {localQuery && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleClearSearch();
                      }}
                      className="p-0.5 hover:text-white text-neutral-400 transition"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </>
              )}
            </div>
          </form>

          {/* Botón "¿Qué veo hoy? (Sorpréndeme)" estilo Netflix */}
          {onSurpriseMe && (
            <button
              onClick={onSurpriseMe}
              className="hidden sm:flex items-center gap-1.5 bg-gradient-to-r from-[#E50914]/20 to-amber-500/20 hover:from-[#E50914]/35 hover:to-amber-500/35 border border-red-500/35 px-3 py-1.5 rounded-full text-xs font-bold text-white transition-all hover:scale-105 shadow-md"
              title="Elegir una película o serie recomendada al azar"
            >
              <Shuffle className="w-3.5 h-3.5 text-red-400" />
              <span className="hidden xl:inline">Sorpréndeme</span>
            </button>
          )}

          {/* Selector Global de Idioma */}
          <div className="relative" ref={langMenuRef}>
            <button
              onClick={() => setLangMenuOpen((prev) => !prev)}
              className="flex items-center gap-1.5 bg-neutral-900/90 hover:bg-neutral-800 border border-white/15 hover:border-white/30 px-2.5 sm:px-3 py-1.5 rounded-full text-xs font-semibold text-white transition-all shadow-md"
              title="Idioma preferido de audio y subtítulos"
            >
              <Globe className="w-3.5 h-3.5 text-[#E50914]" />
              <span className="text-sm leading-none">{currentLang.flag}</span>
              <span className="hidden sm:inline text-neutral-200">{currentLang.shortLabel}</span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-neutral-400 transition-transform duration-200 ${
                  langMenuOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {langMenuOpen && (
              <div className="absolute right-0 mt-2 w-72 bg-[#161616]/98 backdrop-blur-2xl border border-white/15 rounded-2xl shadow-[0_24px_60px_rgba(0,0,0,0.95)] p-2 z-50 animate-fadeIn">
                <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#E50914]" />
                    Preferencia de Audio & Subtítulos
                  </span>
                </div>
                <div className="py-1 space-y-1">
                  {LANGUAGE_OPTIONS.map((opt) => {
                    const active = opt.id === preferredLanguage;
                    return (
                      <button
                        key={opt.id}
                        onClick={() => {
                          if (onChangeLanguage) onChangeLanguage(opt.id);
                          setLangMenuOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-xl transition flex items-start justify-between gap-2 ${
                          active
                            ? 'bg-[#E50914]/20 border border-[#E50914]/50 text-white'
                            : 'hover:bg-white/[0.06] text-neutral-300'
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          <span className="text-base leading-none mt-0.5">{opt.flag}</span>
                          <div>
                            <div className="text-xs font-bold flex items-center gap-1.5">
                              <span>{opt.label}</span>
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-white/10 text-neutral-300 font-semibold">
                                {opt.badge}
                              </span>
                            </div>
                            <p className="text-[10px] text-neutral-400 mt-0.5 leading-snug">
                              {opt.description}
                            </p>
                          </div>
                        </div>
                        {active && <Check className="w-4 h-4 text-[#E50914] shrink-0 mt-1" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Navigation Bar */}
      <nav className="flex lg:hidden items-center justify-around px-2 pt-2 border-t border-white/[0.06] mt-2 bg-[#0f0f0f]/95 overflow-x-auto no-scrollbar">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className={`py-2 px-2.5 text-xs font-bold whitespace-nowrap transition-colors relative ${
                isActive ? 'text-white' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <span>{item.label}</span>
              {isActive && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-[#E50914] rounded-full" />
              )}
            </button>
          );
        })}
      </nav>
    </header>
  );
}
