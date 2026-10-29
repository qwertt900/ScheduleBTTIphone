const CACHE_NAME = 'btt-schedule-v8';  
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './logo.png',
  './manifest.json'
];

self.addEventListener('install', (e) => {
  self.skipWaiting(); // Принудительно устанавливаем новый SW
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName); // Удаляем старый кэш
          }
        })
      );
    }).then(() => self.clients.claim()) // Берем контроль над страницей
  );
});

// Слушаем команду от app.js на пропуск ожидания
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (e) => {
  // Только GET-запросы кэшируем
  if (e.request.method !== 'GET') return;

  // Стратегия «сеть в приоритете, кэш как резерв»:
  // свежие данные при интернете, кэш при отсутствии сети
  e.respondWith(
    fetch(e.request)
      .then((response) => {
        // Кэшируем успешный ответ для офлайн-режима
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(e.request))
  );
});