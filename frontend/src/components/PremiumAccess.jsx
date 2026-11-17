import React from 'react';
import { ExternalLink, Tv } from 'lucide-react';

const providers = [
  { name: 'Win Play / Win Sports+', description: 'Fútbol colombiano y planes de acceso publicados por Win Sports.', url: 'https://www.winsportsmas.com/' },
  { name: 'DGO · Win Sports+', description: 'Opción de Win Sports+ como complemento de la suscripción.', url: 'https://cms74.directvgo.com/co/autoservicio/extras/winsports-' },
  { name: 'Movistar · Win+', description: 'Opciones de Win+ Fútbol y Win Play mediante Movistar.', url: 'https://www.movistar.com.co/win-sports' },
  { name: 'Claro · canales premium', description: 'Opciones de Win+ Fútbol, HBO y otros canales de pago.', url: 'https://www.claro.com.co/personas/servicios/servicios-hogar/television/canales-premium/' },
  { name: 'Tigo · paquetes premium', description: 'Opciones de Win+ Fútbol, Win Play, HBO y otros paquetes.', url: 'https://ayuda.tigo.com.co/hc/centro-de-ayuda/articles/1728716760' },
  { name: 'DGO · HBO', description: 'Señales HBO en vivo dentro de la plataforma DGO.', url: 'https://www.directvgo.com/co/autoservicio/extras/hbo' },
];

export default function PremiumAccess({ onOpenLiveTv }) {
  return <section className="pt-24 sm:pt-28 px-4 sm:px-8 lg:px-12 max-w-[1100px] mx-auto">
    <h1 className="text-3xl font-black mb-3 flex items-center gap-3"><Tv className="text-red-500" /> Canales premium</h1>
    <p className="text-neutral-300 mb-7">Consulta opciones oficiales de acceso a Win Sports+ y otros canales de pago. Cada proveedor reproduce sus señales en su propia plataforma. Una suscripción personal no aporta automáticamente una señal integrable en StreamFlix.</p>
    <div className="grid sm:grid-cols-2 gap-4">
      {providers.map(provider => <a key={provider.name} href={provider.url} target="_blank" rel="noopener noreferrer" className="rounded-2xl border border-white/10 bg-neutral-900/80 p-5 hover:border-red-500/60 transition">
        <h2 className="font-bold flex items-center justify-between gap-2">{provider.name}<ExternalLink size={16} /></h2>
        <p className="text-sm text-neutral-400 mt-2">{provider.description}</p>
      </a>)}
    </div>
    <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-5">
      <h2 className="font-bold mb-2">¿Tienes una señal autorizada?</h2>
      <p className="text-sm text-neutral-400 mb-4">Puedes añadir una lista M3U o un proveedor Xtream con derechos de reproducción en TV en vivo. Para señales con DRM se necesita una integración y licencia del proveedor.</p>
      <button type="button" onClick={onOpenLiveTv} className="rounded-lg bg-red-600 hover:bg-red-500 px-4 py-2 font-semibold text-sm">Abrir TV en vivo</button>
    </div>
  </section>;
}
