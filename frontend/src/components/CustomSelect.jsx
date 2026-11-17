import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, Search, X } from 'lucide-react';

/**
 * CustomSelect — Selector desplegable con estética Netflix y Portal flotante (z-[9999])
 * Reemplaza las etiquetas nativas <select> y <option> y evita cualquier colisión de stacking context
 * con barras con backdrop-blur, píldoras con transform: scale() o tarjetas.
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
  const [menuStyle, setMenuStyle] = useState({});
  const containerRef = useRef(null);
  const menuRef = useRef(null);
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
    if (!isOpen) return;

    const updatePosition = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;
      const spaceBelow = viewportH - rect.bottom;
      const openUpward = spaceBelow < 270 && rect.top > 290;

      const style = {
        position: 'fixed',
        minWidth: `${Math.max(240, Math.round(rect.width))}px`,
        maxWidth: 'min(92vw, 480px)',
        zIndex: 9999,
      };

      if (menuClassName.includes('w-full')) {
        style.width = `${Math.round(rect.width)}px`;
      }

      if (align === 'right') {
        style.right = `${Math.max(8, Math.round(viewportW - rect.right))}px`;
      } else {
        style.left = `${Math.max(8, Math.min(Math.round(rect.left), viewportW - 260))}px`;
      }

      if (openUpward) {
        style.bottom = `${Math.round(viewportH - rect.top + 6)}px`;
      } else {
        style.top = `${Math.round(rect.bottom + 6)}px`;
      }

      setMenuStyle(style);
    };

    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen, align, menuClassName]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event) => {
      const inTrigger = containerRef.current && containerRef.current.contains(event.target);
      const inMenu = menuRef.current && menuRef.current.contains(event.target);
      if (!inTrigger && !inMenu) {
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
  }, [isOpen]);

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
    sm: 'px-2.5 py-1 text-[11px] gap-1.5 rounded-[4px]',
    md: 'px-3.5 py-2 text-xs gap-2 rounded-[4px]',
    lg: 'px-4 py-2.5 text-sm gap-2.5 rounded-[4px]',
  };

  const variantClasses = {
    default: isOpen
      ? 'bg-black/95 border-white text-white shadow-[0_8px_28px_rgba(0,0,0,0.85)]'
      : 'bg-black/80 hover:bg-black/95 border-white/30 hover:border-white/75 text-white shadow-md',
    red: isOpen
      ? 'bg-[#E50914] border-red-300 text-white shadow-[0_0_24px_rgba(229,9,20,0.5)]'
      : 'bg-[#E50914]/20 hover:bg-[#E50914]/30 border-[#E50914]/50 text-white',
    pill: isOpen
      ? 'bg-black/95 border-white text-white rounded-full shadow-[0_8px_28px_rgba(0,0,0,0.85)]'
      : 'bg-black/75 hover:bg-neutral-900/95 border-white/25 hover:border-white/60 text-white rounded-full shadow-md',
  };

  const dropdownMenu =
    isOpen && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={menuRef}
            style={menuStyle}
            onClick={(e) => e.stopPropagation()}
            className={`font-netflix select-none bg-[#141414]/98 backdrop-blur-2xl border border-white/20 rounded-md shadow-[0_28px_70px_rgba(0,0,0,0.96)] p-1.5 animate-fadeIn ${menuClassName}`}
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
                    className="w-full bg-black border border-white/20 focus:border-white rounded-[4px] pl-8 pr-7 py-1.5 text-xs text-white placeholder-neutral-500 focus:outline-none font-netflix"
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

            <div role="listbox" className="max-h-64 overflow-y-auto space-y-0.5 pr-0.5">
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
                      className={`w-full text-left px-3 py-2 rounded-[4px] transition-colors duration-150 flex items-center justify-between gap-3 ${
                        isSelected
                          ? 'bg-white/[0.12] border-l-2 border-[#E50914] text-white'
                          : isHighlighted
                          ? 'bg-white/[0.08] text-white'
                          : 'text-neutral-300 hover:bg-white/[0.06] hover:text-white'
                      }`}
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        {opt.icon && (
                          <span className="text-sm leading-none mt-0.5 shrink-0">{opt.icon}</span>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`text-xs truncate ${
                                isSelected ? 'font-bold text-white' : 'font-medium'
                              }`}
                            >
                              {opt.label}
                            </span>
                            {opt.badge && (
                              <span
                                className={`text-[9px] px-1.5 py-0.2 rounded-[2px] font-bold uppercase tracking-wider shrink-0 ${
                                  isSelected
                                    ? 'bg-[#E50914] text-white'
                                    : 'bg-white/10 text-neutral-300 border border-white/15'
                                }`}
                              >
                                {opt.badge}
                              </span>
                            )}
                          </div>
                          {opt.description && (
                            <p className="text-[11px] text-neutral-400 mt-0.5 leading-snug line-clamp-1 font-normal">
                              {opt.description}
                            </p>
                          )}
                        </div>
                      </div>

                      {isSelected && (
                        <Check className="w-4 h-4 text-white shrink-0 stroke-[2.5]" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div
      ref={containerRef}
      className={`relative inline-block text-left select-none font-netflix ${
        isOpen ? 'z-50' : ''
      } ${className}`}
    >
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`w-full flex items-center justify-between font-semibold border transition-all duration-150 focus:outline-none ${
          sizeClasses[size] || sizeClasses.md
        } ${variantClasses[variant] || variantClasses.default}`}
      >
        <div className="flex items-center gap-2 min-w-0 truncate">
          {LeadingIcon && <LeadingIcon className="w-3.5 h-3.5 text-[#E50914] shrink-0" />}
          {label && <span className="text-neutral-400 font-normal shrink-0">{label}:</span>}
          {selectedOption?.icon && (
            <span className="shrink-0 leading-none">{selectedOption.icon}</span>
          )}
          <span className="truncate font-bold tracking-tight">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          {selectedOption?.badge && (
            <span className="px-1.5 py-0.2 rounded-[2px] bg-[#E50914] text-white text-[9px] font-bold uppercase tracking-wider shrink-0">
              {selectedOption.badge}
            </span>
          )}
        </div>

        <ChevronDown
          className={`w-3.5 h-3.5 text-neutral-300 shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-white' : ''
          }`}
        />
      </button>

      {dropdownMenu}
    </div>
  );
}
