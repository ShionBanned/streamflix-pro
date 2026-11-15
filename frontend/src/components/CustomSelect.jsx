import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ChevronDown, Check, Sparkles, Search, X } from 'lucide-react';

/**
 * CustomSelect — Selector desplegable futurista con estética Glassmorphic para StreamFlix Pro v5.0
 * Reemplaza el 100% de las etiquetas nativas <select> y <option> del sistema operativo.
 */
export default function CustomSelect({
  options = [],
  value,
  onChange,
  label = null,
  icon: LeadingIcon = null,
  placeholder = 'Seleccionar...',
  size = 'md', // 'sm' | 'md' | 'lg'
  variant = 'default', // 'default' | 'red' | 'pill'
  searchable = false,
  align = 'left', // 'left' | 'right'
  className = '',
  menuClassName = '',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedIdx, setHighlightedIdx] = useState(0);
  const containerRef = useRef(null);
  const searchInputRef = useRef(null);

  const normalizedOptions = useMemo(() => {
    return options.map((opt) => {
      if (typeof opt === 'string' || typeof opt === 'number') {
        return { id: opt, value: opt, label: String(opt) };
      }
      const val = opt.value !== undefined ? opt.value : opt.id;
      return {
        ...opt,
        id: val,
        value: val,
        label: opt.label || String(val),
      };
    });
  }, [options]);

  const selectedOption = useMemo(() => {
    return (
      normalizedOptions.find((opt) => String(opt.value) === String(value)) ||
      normalizedOptions[0] ||
      null
    );
  }, [normalizedOptions, value]);

  const filteredOptions = useMemo(() => {
    if (!searchable || !searchTerm.trim()) return normalizedOptions;
    const q = searchTerm.toLowerCase().trim();
    return normalizedOptions.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        (opt.description && opt.description.toLowerCase().includes(q)) ||
        (opt.badge && opt.badge.toLowerCase().includes(q))
    );
  }, [normalizedOptions, searchable, searchTerm]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        setSearchTerm('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  useEffect(() => {
    if (isOpen && searchable && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 40);
    }
    if (isOpen) {
      const idx = filteredOptions.findIndex((o) => String(o.value) === String(value));
      setHighlightedIdx(idx >= 0 ? idx : 0);
    }
  }, [isOpen, searchable, filteredOptions, value]);

  const handleSelect = (optValue) => {
    if (onChange) onChange(optValue);
    setIsOpen(false);
    setSearchTerm('');
  };

  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIdx((prev) => (prev + 1) % Math.max(1, filteredOptions.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIdx((prev) =>
        prev - 1 < 0 ? Math.max(0, filteredOptions.length - 1) : prev - 1
      );
    } else if (e.key === 'Enter' && filteredOptions[highlightedIdx]) {
      e.preventDefault();
      handleSelect(filteredOptions[highlightedIdx].value);
    }
  };

  const sizeClasses = {
    sm: 'px-2.5 py-1 text-[11px] gap-1.5 rounded-lg',
    md: 'px-3.5 py-2 text-xs gap-2 rounded-xl',
    lg: 'px-4 py-2.5 text-sm gap-2.5 rounded-2xl',
  };

  const variantClasses = {
    default: isOpen
      ? 'bg-[#161616]/95 border-[#E50914] text-white shadow-[0_0_20px_rgba(229,9,20,0.28)]'
      : 'bg-[#141414]/90 hover:bg-[#1d1d1d] border-white/15 hover:border-white/30 text-white shadow-lg',
    red: isOpen
      ? 'bg-[#E50914] border-red-300 text-white shadow-[0_0_24px_rgba(229,9,20,0.5)]'
      : 'bg-[#E50914]/20 hover:bg-[#E50914]/30 border-[#E50914]/50 text-white',
    pill: isOpen
      ? 'bg-[#161616]/95 border-[#E50914] text-white rounded-full shadow-[0_0_20px_rgba(229,9,20,0.3)]'
      : 'bg-black/75 hover:bg-neutral-900/95 border-white/15 hover:border-white/35 text-white rounded-full shadow-md',
  };

  return (
    <div
      ref={containerRef}
      className={`relative inline-block text-left select-none font-netflix ${className}`}
    >
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`w-full flex items-center justify-between font-bold border backdrop-blur-2xl transition-all duration-200 focus:outline-none ${
          sizeClasses[size] || sizeClasses.md
        } ${variantClasses[variant] || variantClasses.default}`}
      >
        <div className="flex items-center gap-2 min-w-0 truncate">
          {LeadingIcon && (
            <LeadingIcon className="w-3.5 h-3.5 text-[#E50914] shrink-0" />
          )}
          {label && (
            <span className="text-neutral-400 font-semibold shrink-0">{label}:</span>
          )}
          {selectedOption?.icon && (
            <span className="shrink-0 leading-none">{selectedOption.icon}</span>
          )}
          <span className="truncate font-extrabold tracking-tight">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          {selectedOption?.badge && (
            <span className="px-1.5 py-0.2 rounded bg-[#E50914]/25 border border-[#E50914]/40 text-red-200 text-[9px] font-black uppercase tracking-wider shrink-0">
              {selectedOption.badge}
            </span>
          )}
        </div>

        <ChevronDown
          className={`w-3.5 h-3.5 text-neutral-400 shrink-0 transition-transform duration-300 ${
            isOpen ? 'rotate-180 text-[#E50914]' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          className={`absolute z-50 mt-2 min-w-[230px] w-max max-w-[90vw] bg-[#121212]/98 backdrop-blur-3xl border border-white/15 ring-1 ring-[#E50914]/30 rounded-2xl shadow-[0_24px_65px_rgba(0,0,0,0.95)] p-1.5 animate-fadeIn ${
            align === 'right' ? 'right-0' : 'left-0'
          } ${menuClassName}`}
        >
          {(searchable || normalizedOptions.length > 8) && (
            <div className="p-1.5 pb-2 border-b border-white/10 mb-1">
              <div className="relative flex items-center">
                <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Filtrar opción..."
                  className="w-full bg-black/70 border border-white/15 focus:border-[#E50914] rounded-xl pl-8 pr-7 py-1.5 text-xs text-white placeholder-neutral-500 focus:outline-none"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2 text-neutral-400 hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          )}

          <div
            role="listbox"
            className="max-h-64 overflow-y-auto space-y-1 pr-0.5"
          >
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-neutral-500">
                Sin coincidencias
              </div>
            ) : (
              filteredOptions.map((opt, idx) => {
                const isSelected = String(opt.value) === String(value);
                const isHighlighted = idx === highlightedIdx;

                return (
                  <button
                    key={String(opt.value)}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setHighlightedIdx(idx)}
                    onClick={() => handleSelect(opt.value)}
                    className={`w-full text-left px-3 py-2 rounded-xl transition-all duration-150 flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-gradient-to-r from-[#E50914]/30 via-[#E50914]/15 to-transparent border border-[#E50914]/60 text-white shadow-[0_0_15px_rgba(229,9,20,0.2)]'
                        : isHighlighted
                        ? 'bg-white/[0.08] text-white border border-transparent'
                        : 'text-neutral-300 hover:bg-white/[0.05] hover:text-white border border-transparent'
                    }`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      {opt.icon && (
                        <span className="text-sm leading-none mt-0.5 shrink-0">
                          {opt.icon}
                        </span>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-xs truncate ${
                              isSelected ? 'font-black text-white' : 'font-bold'
                            }`}
                          >
                            {opt.label}
                          </span>
                          {opt.badge && (
                            <span
                              className={`text-[9px] px-1.5 py-0.2 rounded font-extrabold uppercase tracking-wider shrink-0 ${
                                isSelected
                                  ? 'bg-[#E50914] text-white'
                                  : 'bg-white/10 text-neutral-300'
                              }`}
                            >
                              {opt.badge}
                            </span>
                          )}
                        </div>
                        {opt.description && (
                          <p className="text-[10px] text-neutral-400 mt-0.5 leading-snug line-clamp-1">
                            {opt.description}
                          </p>
                        )}
                      </div>
                    </div>

                    {isSelected && (
                      <span className="w-5 h-5 rounded-full bg-[#E50914] text-white flex items-center justify-center shrink-0 shadow-[0_0_10px_#E50914]">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
