import React, { useState, useEffect } from 'react';
import { Film, Tv, Play, Radio, Search, X, Sparkles, Server, Flame, Bookmark } from 'lucide-react';

export default function Navbar({ activeTab, setActiveTab, onSearch, searchQuery, watchlistCount = 0 }) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [localQuery, setLocalQuery] = useState(searchQuery || '');

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 15);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (onSearch) onSearch(localQuery);
  };

  const handleClearSearch = () => {
    setLocalQuery('');
    if (onSearch) onSearch('');
  };

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? 'bg-[#141414] shadow-2xl py-3 border-b border-white/10'
          : 'bg-gradient-to-b from-[#141414]/95 via-[#141414]/80 to-transparent py-3.5'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
        {/* Brand Logo */}
        <div className="flex items-center gap-6 lg:gap-8">
          <button
            onClick={() => {
              setActiveTab('home');
              setLocalQuery('');
              if (onSearch) onSearch('');
            }}
            className="flex items-center gap-2.5 group text-left focus:outline-none"
          >
            <div className="w-9 h-9 bg-gradient-to-tr from-[#B81D24] to-[#E50914] rounded-lg flex items-center justify-center shadow-lg shadow-red-950/50 group-hover:scale-105 transition-transform">
              <Play className="w-5 h-5 text-white fill-current ml-0.5" />
            </div>
            <div className="flex flex-col">
              <span className="text-xl sm:text-2xl font-black tracking-wider text-[#E50914] leading-none font-netflix">
                STREAM<span className="text-white">FLIX</span>
              </span>
              <span className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold flex items-center gap-1">
                Híbrido <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse"></span> Pro
              </span>
            </div>
          </button>

          {/* Navigation Links (Desktop) */}
          <nav className="hidden lg:flex items-center gap-1">
            <button
              onClick={() => setActiveTab('home')}
              className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${
                activeTab === 'home'
                  ? 'text-white bg-white/10 shadow-sm'
                  : 'text-gray-300 hover:text-white hover:bg-white/5'
              }`}
            >
              Inicio
            </button>

            <button
              onClick={() => setActiveTab('movies')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${
                activeTab === 'movies'
                  ? 'text-white bg-white/10 shadow-sm'
                  : 'text-gray-300 hover:text-white hover:bg-white/5'
              }`}
            >
              <Film className="w-4 h-4 text-red-500" />
              Películas
            </button>

            <button
              onClick={() => setActiveTab('series')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${
                activeTab === 'series'
                  ? 'text-white bg-white/10 shadow-sm'
                  : 'text-gray-300 hover:text-white hover:bg-white/5'
              }`}
            >
              <Tv className="w-4 h-4 text-blue-400" />
              Series
            </button>

            {/* Pestaña ANIME (Estilo Crunchyroll) */}
            <button
              onClick={() => setActiveTab('anime')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${
                activeTab === 'anime'
                  ? 'text-white bg-orange-600/30 font-bold border border-orange-500/50 shadow-sm'
                  : 'text-orange-400 hover:text-orange-300 hover:bg-orange-500/10'
              }`}
            >
              <Flame className="w-4 h-4 text-orange-500 fill-current" />
              <span>Anime</span>
              <span className="px-1 py-0.2 bg-[#F47521] text-[9px] font-black rounded-sm text-black">
                CR
              </span>
            </button>

            {/* Pestaña TV EN VIVO */}
            <button
              onClick={() => setActiveTab('live_tv')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold transition-colors relative ${
                activeTab === 'live_tv'
                  ? 'text-white bg-white/10 shadow-sm'
                  : 'text-gray-300 hover:text-white hover:bg-white/5'
              }`}
            >
              <Radio className="w-4 h-4 text-red-500 animate-pulse" />
              TV en Vivo
              <span className="px-1.5 py-0.2 bg-red-600 text-[10px] font-bold rounded-sm uppercase tracking-wider text-white">
                LIVE
              </span>
            </button>

            {/* Pestaña MI LISTA */}
            <button
              onClick={() => setActiveTab('watchlist')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${
                activeTab === 'watchlist'
                  ? 'text-white bg-white/10 shadow-sm'
                  : 'text-gray-300 hover:text-white hover:bg-white/5'
              }`}
            >
              <Bookmark className="w-4 h-4 text-amber-400" />
              <span>Mi Lista</span>
              {watchlistCount > 0 && (
                <span className="px-1.5 py-0.2 bg-neutral-700 text-[10px] font-bold rounded-full text-white">
                  {watchlistCount}
                </span>
              )}
            </button>
          </nav>
        </div>

        {/* Right Actions: Search & Engine Badge */}
        <div className="flex items-center gap-3">
          {/* Search Bar */}
          <form onSubmit={handleSearchSubmit} className="relative flex items-center">
            <div
              className={`flex items-center transition-all duration-300 rounded-full border ${
                searchOpen || localQuery
                  ? 'w-48 sm:w-64 bg-black/90 border-neutral-600 px-3 py-1.5'
                  : 'w-9 h-9 border-transparent justify-center hover:bg-white/10 cursor-pointer'
              }`}
              onClick={() => setSearchOpen(true)}
            >
              <Search className="w-4 h-4 text-gray-300 shrink-0" />
              {(searchOpen || localQuery) && (
                <>
                  <input
                    type="text"
                    value={localQuery}
                    onChange={(e) => {
                      setLocalQuery(e.target.value);
                      if (onSearch) onSearch(e.target.value);
                    }}
                    placeholder="Películas, series, anime..."
                    className="w-full bg-transparent border-none text-xs sm:text-sm text-white placeholder-gray-400 focus:outline-none ml-2"
                    autoFocus
                  />
                  {localQuery && (
                    <button
                      type="button"
                      onClick={handleClearSearch}
                      className="p-1 hover:text-white text-gray-400 transition"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </>
              )}
            </div>
          </form>

          {/* Engine indicator pill */}
          <div className="hidden xl:flex items-center gap-1.5 bg-neutral-900/90 border border-neutral-800 px-3 py-1.5 rounded-full text-xs text-gray-300">
            <Server className="w-3.5 h-3.5 text-emerald-400" />
            <span>P2P Latino + Anime Multi-Subs</span>
          </div>
        </div>
      </div>

      {/* Mobile Navigation Bar */}
      <nav className="flex lg:hidden items-center justify-around px-2 pt-2 border-t border-white/5 mt-2 bg-[#141414] overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveTab('home')}
          className={`py-2 px-2 text-xs font-semibold whitespace-nowrap ${
            activeTab === 'home' ? 'text-red-500 border-b-2 border-red-500' : 'text-gray-400'
          }`}
        >
          Inicio
        </button>
        <button
          onClick={() => setActiveTab('movies')}
          className={`py-2 px-2 text-xs font-semibold whitespace-nowrap ${
            activeTab === 'movies' ? 'text-red-500 border-b-2 border-red-500' : 'text-gray-400'
          }`}
        >
          Películas
        </button>
        <button
          onClick={() => setActiveTab('series')}
          className={`py-2 px-2 text-xs font-semibold whitespace-nowrap ${
            activeTab === 'series' ? 'text-red-500 border-b-2 border-red-500' : 'text-gray-400'
          }`}
        >
          Series
        </button>
        <button
          onClick={() => setActiveTab('anime')}
          className={`py-2 px-2 text-xs font-semibold whitespace-nowrap text-orange-400 flex items-center gap-1 ${
            activeTab === 'anime' ? 'border-b-2 border-orange-500' : ''
          }`}
        >
          <Flame className="w-3.5 h-3.5 fill-current" />
          Anime
        </button>
        <button
          onClick={() => setActiveTab('live_tv')}
          className={`py-2 px-2 text-xs font-semibold whitespace-nowrap flex items-center gap-1 ${
            activeTab === 'live_tv' ? 'text-red-500 border-b-2 border-red-500' : 'text-gray-400'
          }`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
          En Vivo
        </button>
        <button
          onClick={() => setActiveTab('watchlist')}
          className={`py-2 px-2 text-xs font-semibold whitespace-nowrap flex items-center gap-1 ${
            activeTab === 'watchlist' ? 'text-amber-400 border-b-2 border-amber-400' : 'text-gray-400'
          }`}
        >
          <Bookmark className="w-3.5 h-3.5" />
          Mi Lista
        </button>
      </nav>
    </header>
  );
}
