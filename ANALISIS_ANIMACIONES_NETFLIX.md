# Arquitectura de Movimiento y Micro-Interacciones Estilo Netflix (Hawkins Motion System 60fps) — StreamFlix Pro

Este documento detalla la auditoría integral y la ingeniería de movimiento aplicada a **cada botón, panel, modal, carrusel, tarjeta, reproductor y control** de **StreamFlix Pro** para erradicar cualquier transición brusca o mecánica y alcanzar la fluidez orgánica del cliente web oficial de Netflix.

## 1. Curvas de Física y Tokens Globales (`index.css` & `tailwind.config.js`)

El cliente web de Netflix nunca utiliza interpolaciones lineales para elementos interactivos ni curvas estándar rígidas. Se implementaron cuatro curvas maestras basadas en `cubic-bezier` con aceleración por hardware (`translate3d`, `scale`, `will-change`):

| Token CSS / Tailwind | Curva Matemática | Propósito en la Interfaz |
| :--- | :--- | :--- |
| `--ease-nf-out` (`ease-nf-out`) | `cubic-bezier(0.16, 1, 0.3, 1)` | Desaceleración cinemática sedosa para apertura de modales, paneles desplegables, cajones laterales y desplazamiento de filas. |
| `--ease-nf-spring` (`ease-nf-spring`) | `cubic-bezier(0.22, 1.25, 0.36, 1)` | Micro-resorte elástico sin rebote exagerado para botones circulares (`Play`, `Mi Lista`, `Info`, `Calificar`), píldoras de filtro y el thumb de la barra de progreso. |
| `--ease-nf-cinematic` | `cubic-bezier(0.22, 1, 0.36, 1)` | Movimiento de cámara lenta Ken Burns en imágenes de fondo (`HeroBanner` y cabecera de `DetailModal`) y trayectorias de reacción. |
| `--ease-nf-smooth` (`ease-nf-smooth`) | `cubic-bezier(0.25, 0.1, 0.25, 1)` | Transiciones de color, bordes translúcidos, opacidad de capas y barras de scroll. |

## 2. Auditoría e Intervención Componente por Componente

### 2.1. Barra de Navegación Superior (`Navbar.jsx` & `BrandLogo.jsx`)
* **Logotipo `STREAMFLIX` (`BrandLogo.jsx`)**:
  * **Antes**: Cambio simple de opacidad (`group-hover:opacity-90`).
  * **Ahora**: Micro-escala con resorte (`group-hover:scale-[1.035] group-active:scale-[0.97]`) acompañada de un halo rojo difuso (`drop-shadow-[0_0_16px_rgba(229,9,20,0.55)]`).
* **Fondo del Header al Hacer Scroll**:
  * **Antes**: Cambio rápido de `300ms` sin sombra progresiva.
  * **Ahora**: Transición de `500ms ease-nf-out` hacia `#141414/95` con `backdrop-blur-md` y sombra ambiental profunda.
* **Pestañas de Navegación (`Inicio`, `Series`, `Películas`, `Anime`, `TV en Vivo`, `Offline`, `Mi lista`)**:
  * **Antes**: Cambio de padding que empujaba levemente a los botones vecinos.
  * **Ahora**: Fondo translúcido con luz especular interna (`bg-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]`), barra inferior roja con halo (`box-shadow: 0 0 10px rgba(229,9,20,0.65)`), respuesta táctil `active:scale-95` y contador de `Mi lista` animado con `animate-capsule-icon`.
* **Buscador Expandible (`Search`)**:
  * **Antes**: Aparición brusca del `<input>` al cambiar el ancho.
  * **Ahora**: Expansión horizontal fluida con `ease-nf-out`, micro-escala en el icono de lupa y botón `X` de limpieza con pop elástico (`nf-icon-btn animate-capsule-icon`).
* **Botón `Sorpréndeme` (`Shuffle`)**:
  * **Antes**: Hover plano de color.
  * **Ahora**: Clase `.nf-shuffle-btn` que rota el icono `180deg` con resorte (`--ease-nf-spring`) al pasar el cursor y comprime el botón al hacer clic (`active:scale-[0.96]`).
* **Menú Desplegable de Audio e Idioma (`audioMenuOpen`)**:
  * **Antes**: `animate-fadeIn` plano sin punto de anclaje.
  * **Ahora**: Despliegue anclado a la esquina superior derecha (`animate-nfDropdown`, `transform-origin: top right`), desplazamiento lateral sutil (`hover:translate-x-0.5`) en cada preset de audio y pop de confirmación (`animate-nfCheckPop`) en el icono `Check`.
* **Avatar de Perfil**:
  * **Antes**: Caja estática sin respuesta táctil.
  * **Ahora**: Escala con resorte (`group-hover:scale-105 group-active:scale-95`), iluminación del borde y rotación de `180deg` del `ChevronDown`.

### 2.2. Billboard Principal (`HeroBanner.jsx`)
* **Cascada Escalonada de Información (Staggered Entrance)**:
  * **Antes**: Todo el bloque de texto del Hero se movía como una sola pieza rígida (`animate-heroContent`).
  * **Ahora**: Cada nivel jerárquico entra en cascada cinemática al cambiar de slide:
    1. `animate-heroStagger-1` (`40ms`): Etiqueta de motivo (`🍿 Estallando en Taquilla`) y badge de sección.
    2. `animate-heroStagger-2` (`90ms`): Sello `N SERIE/PELÍCULA DESTACADA`, badge `TOP # HOY`, `% para ti`, estrellas y año.
    3. `animate-heroStagger-3` (`140ms`): Título principal de gran formato (`h1`).
    4. `animate-heroStagger-4` (`190ms`): Sinopsis descriptiva (`p`).
    5. `animate-heroStagger-5` (`240ms`): Fila de botones de acción (`Reproducir`, `Más información`, `Ver avance`, `Mi Lista`).
* **Flechas Laterales del Carrusel Hero (`ChevronLeft` / `ChevronRight`)**:
  * **Antes**: Visibles permanentemente sobre el arte.
  * **Ahora**: Se revelan suavemente al entrar al Hero (`opacity-0 group-hover/hero:opacity-100`) y desplazan el chevron interior en la dirección del movimiento (`group-hover/arrow:-translate-x-0.5` / `translate-x-0.5`).
* **Botones de Acción y Miniaturas Inferiores**:
  * `Reproducir` usa `.hero-primary-cta` con desplazamiento del icono `Play` y halo blanco; `Mi Lista` dispara `animate-nfCheckPop` al guardar; la insignia de clasificación por edad entra deslizándose desde el borde derecho (`animate-nfDrawerRight`).

### 2.3. Hubs de Plataformas (`PlatformHubs.jsx`)
* **Tarjetas de Marcas (`Netflix`, `Max`, `Disney+`, `Prime Video`, `Crunchyroll`, `Apple TV+`)**:
  * **Antes**: Elevación simple sin respuesta en la franja de color.
  * **Ahora**: Barrido diagonal de brillo especular (`.platform-hub::after`), expansión de la barra lateral del color oficial de cada plataforma con resplandor (`box-shadow: 0 0 14px <color>`), avance elástico del `ChevronRight` y botón `Ver todo el catálogo ✕` con entrada `animate-capsule-icon`.

### 2.4. Filas Horizontales, Top 10, Continuar Viendo y Grillas (`MediaGrid.jsx` & `DiscoveryRows.jsx`)
* **Retardo de Intención en Hover (Netflix Intent Delay)**:
  * **Antes**: Pasar el cursor rápidamente por la pantalla disparaba el escalado inmediato de todas las tarjetas intermedias, generando ruido visual.
  * **Ahora**: `.netflix-card-transition:hover` incorpora un `transition-delay: 55ms` al entrar (filtrando cruces accidentales del puntero) y `0ms` al salir para que la tarjeta regrese instantáneamente con `cubic-bezier(0.16, 1, 0.3, 1)`.
* **Revelación Interna de Acciones (`.card-overlay-actions`)**:
  * **Antes**: Los botones internos (`Play`, `Mi Lista`, `Info`) aparecían solo por opacidad.
  * **Ahora**: Emergen desde `translateY(8px)` hacia `translateY(0)` sincronizados con la expansión de la tarjeta, y cada botón circular responde con `.nf-icon-btn` y `animate-nfCheckPop`.
* **Números Gigantes del Top 10**:
  * **Ahora**: Al hacer hover sobre un título del Top 10, el numeral SVG se desplaza sutilmente a la izquierda (`group-hover:-translate-x-1`) mientras su trazo se enciende en `#E50914` con `drop-shadow` rojo.
* **Paletas de Desplazamiento Lateral (`scroll('left')` / `scroll('right')`)**:
  * **Ahora**: Degradado lateral más suave y botón cápsula que se enciende en `#E50914` con escala elástica (`group-hover/paddle:scale-110 group-active/paddle:scale-95`).

### 2.5. Selectores Desplegables (`CustomSelect.jsx`)
* **Menú Desplegable y Opciones**:
  * **Antes**: `animate-fadeIn` plano.
  * **Ahora**: `animate-nfDropdown` (alineado a la derecha) o `animate-nfDropdownLeft` (alineado a la izquierda) con rotación suave de `180deg` en el chevron, desplazamiento horizontal (`translate-x-0.5`) al recorrer opciones y pop elástico (`animate-nfCheckPop`) en el indicador de selección.

### 2.6. Modal de Detalles y Sub-Modal de Descargas (`DetailModal.jsx`)
* **Entrada del Modal y Fondo**:
  * Fondo con desenfoque progresivo (`animate-nfBackdrop`) y tarjeta principal con `animate-modalSlideUp` (`translate3d(0, 34px, 0) scale(0.93) -> scale(1)`).
  * Botón `Cerrar (X)` con rotación de `90deg` y encendido en rojo al pasar el cursor.
* **Lista de Episodios y Cambio de Temporada**:
  * Al cambiar de temporada en `CustomSelect`, el contenedor de episodios (`key="ep-list-${selectedSeason}"`) ejecuta `animate-nfTabContent`.
  * Cada fila de episodio (`.episode-row`) despliega una barra vertical roja a la izquierda (`.episode-row::before`), acerca suavemente la miniatura (`group-hover:scale-105 duration-500`) y hace emerger el botón `Play` central con resorte (`scale-75 group-hover:scale-100`).
* **Colecciones, Similares (3x3) y Sub-Modal de Descarga Offline**:
  * Las tarjetas de colección y títulos similares integran `.netflix-card-transition` con zoom en miniatura y pop en el botón de reproducción; el diálogo de descarga offline (`downloadOpen`) ahora entra con `animate-nfBackdrop` + `animate-modalSlideUp`.

### 2.7. Reproductor Inteligente, DirectPlayer y Subtítulos (`SmartPlayer.jsx`, `DirectPlayer.jsx`, `SubtitleOverlay.jsx`, `AiSubtitleControl.jsx`, `ExternalAudio.jsx`)
* **Barra de Progreso (`player-progress`)**:
  * Crece de `4px` a `8px` al acercar el puntero con resplandor rojo (`box-shadow: 0 0 14px rgba(229,9,20,0.45)`), mientras el thumb circular se expande con resorte (`scale(0.85) -> scale(1.28)`).
* **Cajones Superiores (`Audio e Idioma`, `Cambiar fuente de video`, `Episodios`) y Popover Inferior (`Subtítulos`)**:
  * Los cajones superiores abren con `animate-nfDropdown` y rotan el chevron de su píldora activadora; el panel de subtítulos abre desde abajo hacia arriba con `animate-nfPopoverUp`.
  * Cambiar entre pestañas internas (`Idioma y Pista` / `Audio alternativo` / `Mejora de sonido`, `Servidores Web` / `Torrent / HD` / `Sitios / URL`, `Pistas` / `Sincronizar` / `Estilo`) ejecuta `animate-nfTabContent` para evitar cortes secos.
  * Los acordeones de sitios (`Cuevana`, `AnimeAV1`, `PelisPlus`, `AnimeFLV`) y el panel de Whisper IA abren con `animate-nfAccordion`.
* **Subtítulos en Vivo (`SubtitleOverlay.jsx`)**:
  * Cada línea de diálogo entra con `animate-nfCueFade` (`160ms`) y ajusta su altura suavemente (`transition-[bottom] duration-300 ease-nf-out`) cuando aparece o se oculta el HUD.

### 2.8. Televisión en Vivo (`LiveTV.jsx`), Descargas (`DownloadsPage.jsx`), Perfil (`ProfilePage.jsx`) y Vistas (`App.jsx`)
* **Transición Global entre Pestañas (`App.jsx`)**:
  * Cambiar entre `Inicio`, `Series`, `Películas`, `Anime`, `TV en Vivo`, `Offline`, `Mi lista` y `Mi Perfil` ejecuta `animate-nfPageEnter` (`translate3d(0, 12px, 0) -> 0` en `380ms`).
* **Escenario y Guía EPG en `LiveTV.jsx`**:
  * El cajón lateral de la Guía Rápida EPG entra desde el borde derecho con `animate-nfDrawerRight`; la información del canal en vivo entra en cascada (`animate-heroStagger-1..4`); el modal M3U/Xtream anima tanto su apertura (`animate-modalSlideUp`) como el cambio entre pestañas (`animate-nfTabContent`).
* **Accesibilidad (`prefers-reduced-motion`)**:
  * Se preserva el soporte completo para usuarios con reducción de movimiento activada en el sistema operativo.
