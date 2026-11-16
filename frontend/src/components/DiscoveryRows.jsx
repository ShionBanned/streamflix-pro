import React, { useEffect, useRef, useState } from 'react';
import api from '../services/api.js';
import MediaGrid from './MediaGrid.jsx';

const VARIANTS = [
  { id: 'popular', title: (name) => `Para fans de ${name}`, sortBy: 'popularity.desc', decade: 'all' },
  { id: 'recent', title: (name) => `${name}: estrenos recientes`, sortBy: 'popularity.desc', decade: '2020s' },
  { id: 'acclaimed', title: (name) => `${name}: los más aclamados`, sortBy: 'vote_count.desc', decade: 'all' },
  { id: 'last-decade', title: (name) => `${name}: joyas de los 2010`, sortBy: 'popularity.desc', decade: '2010s' },
];

export function buildGenreRows(options, type, { originalLanguage = null, preferredGenreIds = [], limit = 40 } = {}) {
  const genres = options.filter((option) => option.value !== 'all').slice(0, 12);
  genres.sort((a, b) => Number(preferredGenreIds.includes(Number(String(b.value).split(',')[0]))) - Number(preferredGenreIds.includes(Number(String(a.value).split(',')[0]))));
  return genres.flatMap((genre) => VARIANTS.map((variant) => ({
    key: `${type}-${genre.value}-${variant.id}`,
    title: variant.title(genre.label),
    type, genre: genre.value, sortBy: variant.sortBy, decade: variant.decade, originalLanguage,
  }))).slice(0, limit);
}

function DiscoveryRow({ spec, lang, mediaProps }) {
  const markerRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const marker = markerRef.current;
    if (!marker || visible) return;
    if (!('IntersectionObserver' in window)) { setVisible(true); return; }
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } }, { rootMargin: '500px' });
    observer.observe(marker);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    setLoading(true);
    api.getCatalogPage({ type: spec.type, genre: spec.genre, sortBy: spec.sortBy, decade: spec.decade, originalLanguage: spec.originalLanguage, lang })
      .then((results) => { if (active) setItems(results.filter((item) => item?.id && (item.poster_path || item.backdrop_path))); })
      .catch(() => { if (active) setItems([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [visible, spec.key, lang]);

  return <div ref={markerRef} className={visible ? '' : 'h-56'}>{visible && (loading || items.length > 0) && <MediaGrid title={spec.title} items={items} isLoading={loading} isRow={true} {...mediaProps} />}</div>;
}

export default function DiscoveryRows({ specs, lang, mediaProps }) {
  const [shown, setShown] = useState(8);
  const nextRef = useRef(null);
  useEffect(() => { setShown(8); }, [specs]);
  useEffect(() => {
    const node = nextRef.current;
    if (!node || shown >= specs.length) return;
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) setShown((count) => Math.min(count + 8, specs.length)); }, { rootMargin: '600px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [shown, specs.length]);
  return <div className="space-y-1">{specs.slice(0, shown).map((spec) => <DiscoveryRow key={`${spec.key}-${lang}`} spec={spec} lang={lang} mediaProps={mediaProps} />)}{shown < specs.length && <div ref={nextRef} className="h-8" aria-hidden="true" />}</div>;
}
