/// <reference lib="webworker" />

import type { ManifestEntry } from "workbox-build";
import { cacheNames, clientsClaim } from "workbox-core";
import { registerRoute, setCatchHandler } from "workbox-routing";
import { NetworkFirst } from "workbox-strategies";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<ManifestEntry>;
};

const appCache = `${cacheNames.prefix}-app-${cacheNames.suffix}`;
const entries = self.__WB_MANIFEST;
const appUrls = new Set(
  entries.map(({ url }) => new URL(url, self.location.href).href),
);
const fallbackUrl = new URL("index.html", self.registration.scope).href;
const networkFirst = new NetworkFirst({
  cacheName: appCache,
  networkTimeoutSeconds: 3,
});

// Seed the complete app shell so the first successful online visit is enough
// to make the next load work offline.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(appCache).then((cache) =>
      cache.addAll(
        [...appUrls].map((url) => new Request(url, { credentials: "same-origin" })),
      ),
    ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.open(appCache).then(async (cache) => {
      const requests = await cache.keys();
      await Promise.all(
        requests
          .filter((request) => !appUrls.has(request.url))
          .map((request) => cache.delete(request)),
      );
    }),
  );
});

// Navigations always try the network first. The timeout makes genuinely bad
// connections fall back promptly instead of leaving the breathing UI hanging.
registerRoute(
  ({ request, url }) =>
    request.mode === "navigate" && url.origin === self.location.origin,
  networkFirst,
);

// Generated files and public assets use the same strategy. Their cached copy
// was seeded during install, while every online request can refresh it.
registerRoute(
  ({ request, url }) =>
    request.method === "GET" && appUrls.has(url.href),
  networkFirst,
);

setCatchHandler(async ({ request }) => {
  if (request.destination === "document") {
    return (await caches.match(fallbackUrl)) ?? Response.error();
  }
  return Response.error();
});

clientsClaim();
