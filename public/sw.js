// Service worker minimal : requis pour qu'un navigateur considère Namae comme
// une PWA installable (et donc autorise l'apparition de Namae dans la share
// sheet du système via le `share_target` du manifest). On ne met rien en cache
// — l'app est rendue statiquement et tourne très bien hors-ligne tant que les
// fichiers sont déjà téléchargés.

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {})
