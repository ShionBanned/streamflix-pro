import React, { useState } from 'react';
import { AUDIO_ENGINE_PRESETS, LANGUAGE_OPTIONS } from '../hooks/useUserMedia.js';

const AVATARS = ['🎬', '🍿', '🎭', '🚀', '🎮', '🌟'];

export default function ProfilePage({ profile, onSave, movieGenres, seriesGenres, preferredLanguage, onChangeLanguage, audioEnginePreset, onChangeAudioPreset }) {
  const [draft, setDraft] = useState(profile);
  const [message, setMessage] = useState('');

  const toggleGenre = (field, id) => setDraft((current) => {
    const values = current[field] || [];
    return { ...current, [field]: values.includes(id) ? values.filter((value) => value !== id) : [...values.slice(-4), id] };
  });

  const choosePhoto = async (file) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5_000_000) { setMessage('Usa una imagen JPG, PNG o WebP de hasta 5 MB.'); return; }
    const objectUrl = URL.createObjectURL(file);
    try {
      const picture = new Image(); picture.src = objectUrl; await picture.decode();
      const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256;
      const context = canvas.getContext('2d');
      const size = Math.min(picture.naturalWidth, picture.naturalHeight);
      context.drawImage(picture, (picture.naturalWidth - size) / 2, (picture.naturalHeight - size) / 2, size, size, 0, 0, 256, 256);
      setDraft((current) => ({ ...current, photo: canvas.toDataURL('image/webp', 0.8) }));
      setMessage('Foto lista para guardar.');
    } catch { setMessage('No se pudo abrir esa imagen.'); }
    finally { URL.revokeObjectURL(objectUrl); }
  };

  const save = () => {
    const next = { ...draft, name: draft.name.trim().slice(0, 24) || 'Mi Perfil' };
    onSave(next);
    setDraft(next);
    setMessage('Perfil guardado en este navegador.');
  };

  return (
    <div className="min-h-screen pt-28 pb-20 px-4 sm:px-8 max-w-5xl mx-auto animate-nfPageEnter">
      <p className="text-[11px] uppercase tracking-[0.25em] text-red-400 font-bold">Configuración personal</p>
      <h1 className="text-3xl sm:text-5xl font-black mt-2 mb-2 animate-heroContent">Mi Perfil</h1>
      <p className="text-sm text-neutral-400 mb-8">Personaliza las recomendaciones y el reproductor. Estos datos se guardan en este navegador.</p>

      <div className="grid lg:grid-cols-[300px_1fr] gap-6">
        <section className="profile-panel rounded-2xl bg-[#202020] border border-white/10 p-6 space-y-5 h-fit">
          <div className="profile-avatar h-28 w-28 rounded-lg bg-red-700 mx-auto overflow-hidden flex items-center justify-center text-5xl shadow-xl">
            {draft.photo ? <img src={draft.photo} alt="Foto del perfil" className="h-full w-full object-cover" /> : draft.avatar}
          </div>
          <label className="block text-sm font-semibold">
            Nombre
            <input
              value={draft.name}
              maxLength={24}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              className="mt-2 w-full rounded-lg bg-[#111] border border-white/20 px-3 py-2.5 text-white outline-none focus:border-red-500 transition-colors"
            />
          </label>
          <div>
            <p className="text-sm font-semibold mb-2">Avatar</p>
            <div className="flex flex-wrap gap-2">
              {AVATARS.map((avatar) => (
                <button
                  key={avatar}
                  type="button"
                  onClick={() => setDraft((current) => ({ ...current, avatar, photo: '' }))}
                  aria-label={`Usar avatar ${avatar}`}
                  className={`nf-icon-btn h-10 w-10 rounded-lg text-xl ${
                    draft.avatar === avatar && !draft.photo
                      ? 'ring-2 ring-red-500 bg-red-950 scale-105 shadow-[0_0_15px_rgba(229,9,20,0.4)]'
                      : 'bg-[#111] hover:bg-neutral-700'
                  }`}
                >
                  {avatar}
                </button>
              ))}
            </div>
          </div>
          <label className="block text-sm font-semibold cursor-pointer">
            Subir foto
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => choosePhoto(event.target.files?.[0])}
              className="mt-2 block w-full text-xs text-neutral-400 file:mr-3 file:rounded file:border-0 file:bg-neutral-700 hover:file:bg-neutral-600 file:px-3 file:py-2 file:text-white file:transition-colors file:cursor-pointer"
            />
          </label>
        </section>

        <div className="space-y-6">
          <section className="profile-panel rounded-2xl bg-[#202020] border border-white/10 p-6 space-y-4">
            <h2 className="text-xl font-bold">Reproducción</h2>
            <label className="block text-sm text-neutral-300">
              Idioma preferido
              <select
                value={preferredLanguage}
                onChange={(event) => onChangeLanguage(event.target.value)}
                className="mt-2 w-full rounded-lg bg-[#111] border border-white/20 px-3 py-2.5 text-white focus:border-red-500 transition-colors"
              >
                {LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-neutral-300">
              Motor de audio
              <select
                value={audioEnginePreset}
                onChange={(event) => onChangeAudioPreset(event.target.value)}
                className="mt-2 w-full rounded-lg bg-[#111] border border-white/20 px-3 py-2.5 text-white focus:border-red-500 transition-colors"
              >
                {AUDIO_ENGINE_PRESETS.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-3 text-sm text-neutral-300 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.autoplayTrailers !== false}
                onChange={(event) => setDraft((current) => ({ ...current, autoplayTrailers: event.target.checked }))}
                className="accent-red-600 w-4 h-4 cursor-pointer"
              />
              Reproducir avances automáticos
            </label>
          </section>

          <section className="profile-panel rounded-2xl bg-[#202020] border border-white/10 p-6 space-y-5">
            <div>
              <h2 className="text-xl font-bold">Mis géneros</h2>
              <p className="text-xs text-neutral-400 mt-1">Elige hasta cinco por tipo. Aparecerán primero en tus recomendaciones.</p>
            </div>
            {[['movieGenres', 'Películas', movieGenres], ['seriesGenres', 'Series', seriesGenres]].map(([field, label, options]) => (
              <div key={field}>
                <h3 className="text-sm font-bold mb-2">{label}</h3>
                <div className="flex flex-wrap gap-2">
                  {options.filter((option) => option.value !== 'all').map((option) => {
                    const gId = Number(String(option.value).split(',')[0]);
                    const active = draft[field]?.includes(gId);
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => toggleGenre(field, gId)}
                        className={`nf-pill rounded-full px-3.5 py-1.5 text-xs font-semibold border ${
                          active
                            ? 'bg-[#E50914] border-red-400 text-white shadow-[0_0_16px_rgba(229,9,20,0.4)] scale-105'
                            : 'bg-[#111] border-white/15 text-neutral-300 hover:border-white/40 hover:text-white'
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={save}
              className="hero-primary-cta rounded-md bg-white px-6 py-2.5 text-sm font-bold text-black hover:bg-neutral-200"
            >
              Guardar perfil
            </button>
            {message && (
              <span key={message} role="status" className="text-xs font-semibold text-emerald-300 animate-nfTabContent">
                {message}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
