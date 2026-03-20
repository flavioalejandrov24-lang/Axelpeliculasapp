// ============================================
//   SERVICE WORKER - AXO Movies
//   Permite navegación offline del catálogo
// ============================================

const CACHE_NAME = "axo-movies-v1";
const SUPABASE_URL = "https://fzslqxsclswkedlohgtr.supabase.co";

// Archivos estáticos que se cachean al instalar
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./logotipo.png",
  "./moviesicon.png",
];

// ──────────────────────────────────────────────
// INSTALACIÓN: cachea los archivos estáticos
// ──────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// ──────────────────────────────────────────────
// ACTIVACIÓN: limpia cachés viejas si las hay
// ──────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ──────────────────────────────────────────────
// FETCH: intercepta todas las peticiones
// ──────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const url = event.request.url;

  // 1. Peticiones a Supabase (datos e imágenes)
  if (url.startsWith(SUPABASE_URL)) {
    event.respondWith(networkFirstStrategy(event.request));
    return;
  }

  // 2. CDNs externos (Tailwind, Supabase SDK)
  if (url.includes("cdn.tailwindcss.com") || url.includes("esm.sh")) {
    event.respondWith(cacheFirstStrategy(event.request));
    return;
  }

  // 3. Archivos locales de la app
  if (url.startsWith(self.location.origin)) {
    event.respondWith(cacheFirstStrategy(event.request));
    return;
  }
});

// ──────────────────────────────────────────────
// ESTRATEGIA 1: Network First (datos de Supabase)
// Intenta la red primero, si falla usa caché
// ──────────────────────────────────────────────
async function networkFirstStrategy(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const networkResponse = await fetch(request.clone());

    // Si la respuesta es válida, la guarda en caché
    if (networkResponse && networkResponse.status === 200) {
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch {
    // Sin internet → devuelve lo que tenga en caché
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    // Si no hay caché tampoco, devuelve JSON vacío
    // para que la app no se rompa
    return new Response(JSON.stringify([]), {
      headers: { "Content-Type": "application/json" },
    });
  }
}

// ──────────────────────────────────────────────
// ESTRATEGIA 2: Cache First (archivos estáticos)
// Usa caché primero, si no existe va a la red
// ──────────────────────────────────────────────
async function cacheFirstStrategy(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request.clone());
    if (networkResponse && networkResponse.status === 200) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    // Si es una navegación y no hay caché, devuelve index.html
    if (request.mode === "navigate") {
      const indexResponse = await cache.match("./index.html");
      if (indexResponse) return indexResponse;
    }
    return new Response("Sin conexión y sin caché disponible.", { status: 503 });
  }
}
