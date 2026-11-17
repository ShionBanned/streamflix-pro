# Distribución y actualizaciones de StreamFlix (Guía Maestra y Operativa)

## 1. Arquitectura de Distribución para Windows

StreamFlix está empaquetado como aplicación nativa de Windows mediante **Electron**, **electron-builder** y **NSIS**, eliminando la necesidad de que los usuarios tengan Node.js o Vite instalados.

### Componentes de Producción:
- **Frontend Compilado:** Construido con `vite build` hacia `frontend/dist`. Servido por Express con fallback SPA para navegación sin recargas.
- **Backend Integrado:** Express 4 se ejecuta en el proceso principal o como proceso hijo de Electron (`ELECTRON_RUN_AS_NODE=1`), compartiendo el origen local `http://127.0.0.1:4000`.
- **Instalador NSIS por Usuario:**
  - Ubicación: `%LOCALAPPDATA%\Programs\StreamFlix`.
  - No requiere permisos de administrador.
  - Accesos directos en Escritorio y Menú Inicio.
  - Nombre del artefacto: `StreamFlix-Setup-<versión>.exe`.
  - Invariante de seguridad: `deleteAppDataOnUninstall: false` (el desinstalador nunca toca los datos del usuario).

---

## 2. Motor de Actualizaciones (`UpdateEngine`)

Controlado en `electron/updater.cjs` mediante `electron-updater` con canal `stable`:

1. **Frecuencia:**
   - Comprobación automática al iniciar la aplicación (con amortiguación de 6 segundos).
   - Comprobación periódica **cada 2 horas** mientras la app permanezca abierta.
2. **Prevención de Consultas Simultáneas:**
   - Mutex `isChecking`. Si una petición está en vuelo, cualquier llamada duplicada se descarta (`concurrent_check_prevented`).
3. **Silencio Absoluto:**
   - Si la aplicación está al día (`update-not-available`), no se muestra ninguna ventana, notificación, sonido ni indicador visual.
   - Si no hay conexión o GitHub está caído, el fallo se absorbe en silencio sin interrumpir al usuario y se programa el reintento para el siguiente intervalo.
4. **Descarga en Segundo Plano y Notificación:**
   - Al detectar una nueva versión, se descarga automáticamente en segundo plano reportando el progreso (`0% - 100%`).
   - Al completarse la descarga (`update-downloaded`), aparece el banner inferior:
     - **«Instalar ahora»**: consulta `/api/system/activity`. Si hay descargas o reproducción en curso, abre un diálogo de confirmación para advertir al usuario. Si se confirma, realiza un apagado ordenado del backend y llama a `autoUpdater.quitAndInstall(false, true)`.
     - **«Más tarde»**: pospone la actualización para el próximo inicio sin reiniciar ni insistir.

---

## 3. Persistencia de Datos y Migración de Almacenamiento

Para garantizar que ninguna actualización borre la configuración del usuario ni sus descargas:

1. **Directorio Externo de Datos:**
   - Windows: `%APPDATA%\StreamFlix` (ejemplo: `C:\Users\<usuario>\AppData\Roaming\StreamFlix`).
   - Contenido:
     - `downloads/` (archivos descargados e `index.json`).
     - `iptv-channels-cache.json` (caché de canales de TV).
     - `iptv-health.json` (estado de salud de fuentes).
     - `ai-jobs/` (trabajos de subtítulos locales).
     - `user-preferences.json` (respaldo de perfil, Mi lista, Continuar viendo y preferencias).
2. **Migración Automática:**
   - Al arrancar, `backend/config/paths.js` comprueba si existen datos en la ruta local antigua (`.local/`) y los migra de forma transparente hacia `%APPDATA%\StreamFlix`.
3. **Sincronización de LocalStorage:**
   - El frontend cuenta con `storageSync.js`. Al iniciar, hidrata el `localStorage` del navegador/Electron desde `user-preferences.json`.
   - Cada mutación de «Mi lista», «Continuar viendo» o perfil se sincroniza con el backend de forma diferida, haciendo inmunes las preferencias a cambios de origen o borrados de caché web.

---

## 4. Pruebas Automatizadas del Sistema

El proyecto cuenta con cuatro suites de verificación continua:

| Suite | Comando | Cobertura | Estado |
|---|---|---|---|
| **Backend Core** | `npm run test:backend` | 38 pruebas (P2P, HLS Offline, FFmpeg, IPTV, Proxy) | ✅ 38/38 PASS |
| **Frontend UI** | `npm run test:frontend` | 8 pruebas (selectores, atajos de reproducción, UI) | ✅ 8/8 PASS |
| **Updater Unit** | `node --test tests/updater.test.mjs` | 7 pruebas (silencio, concurrencia, descarga, botones) | ✅ 7/7 PASS |
| **Windows E2E** | `node --test tests/e2e-windows-update.test.mjs` | Detección, integridad SHA512, apagado y persistencia | ✅ 1/1 PASS |

---

## 5. Procedimiento Operativo para Publicar una Versión

Sigue estrictamente estos pasos cada vez que desees lanzar una actualización:

### Paso 1: Incrementar la Versión
Edita la versión semántica única en:
- `shared/version.mjs`
- `package.json`
- `backend/package.json`
- `frontend/package.json`

*(O ejecuta `npm version <nueva_version> --no-git-tag-version`)*

### Paso 2: Ejecutar el Control de Calidad Local
```bash
npm run check
```
Verifica que pasen las comprobaciones de linting, tipado estático TypeScript y todas las pruebas automatizadas.

### Paso 3: Crear y Subir el Tag Git
```bash
git add .
git commit -m "chore: release vX.Y.Z"
git tag vX.Y.Z
git push origin main
git push origin vX.Y.Z
```

### Paso 4: Publicación Automática vía GitHub Actions
El workflow `.github/workflows/release.yml`:
1. Valida que el tag `vX.Y.Z` coincida con la versión declarada en `package.json`.
2. Ejecuta todo el Quality Gate.
3. Compila el frontend Vite y empaqueta el instalador Windows con `electron-builder`.
4. Publica en GitHub Releases el instalador `StreamFlix-Setup-X.Y.Z.exe` y el archivo de verificación `latest.yml` generados en la misma compilación (Release publicada, no borrador).

---

## 6. Seguridad y Configuración de Repositorios

### Repositorio Privado vs. Canal Público de Releases
Si el código fuente de StreamFlix se mantiene en un repositorio privado (`streamflix-pro`), GitHub Releases dentro de ese repositorio privado requeriría autenticación. Para evitar incrustar tokens en los clientes de tus amigos:

1. **Repositorio Público de Distribución:** Crea un repositorio público vacío, por ejemplo `https://github.com/ShionBanned/streamflix-releases`.
2. **Token Limitado (Fine-Grained PAT):**
   - En tu cuenta de GitHub, genera un **Fine-Grained Personal Access Token**:
     - Nombre: `StreamFlix Releases Publisher`.
     - Repositorio seleccionado: Únicamente `streamflix-releases`.
     - Permisos del repositorio: `Contents: Read and write`.
   - En tu repositorio de código privado `streamflix-pro`, ve a **Settings > Secrets and variables > Actions** y añade el secret:
     - Nombre: `RELEASES_PAT`
     - Valor: `<el_token_generado>`.
3. **Resultado:** El workflow compila de forma segura desde el repositorio privado y sube el instalador y `latest.yml` al repositorio público. Los clientes de tus amigos consultan el canal público sin requerir ningún token.
