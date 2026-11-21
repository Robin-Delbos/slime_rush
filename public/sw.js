/*
 * Service worker de Slime Rush.
 *
 * Il est nécessaire pour que Chrome (Android) propose « Installer l'application » au lieu d'un simple raccourci.
 * Stratégie « le réseau d'abord » : en ligne, le jeu vient toujours du serveur (une nouvelle version est donc prise
 * tout de suite, sans cache périmé) et chaque fichier est gardé au passage ; hors connexion, on rend la copie gardée.
 * Rien n'est envoyé nulle part : les fichiers restent sur l'appareil (voir la politique de confidentialité).
 */
const CACHE = 'slime-rush-v1';

self.addEventListener('install', () => {
  void self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Efface les copies d'une ancienne version du cache.
      for (const name of await caches.keys()) if (name !== CACHE) await caches.delete(name);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  // Seulement les fichiers du jeu : pas les autres sites, pas les envois.
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(networkFirst(request));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    // Les réponses partielles (206) ne peuvent pas être gardées.
    if (response.status === 200) cache.put(request, response.clone()).catch(() => {});
    return response;
  } catch (error) {
    // « ignoreSearch » : le jeu s'ouvre aussi hors connexion avec un « ?debug » ou autre dans l'adresse.
    const copy = await cache.match(request, { ignoreSearch: true });
    if (copy) return copy;
    throw error;
  }
}
