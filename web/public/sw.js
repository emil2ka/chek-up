// Чек-ап: запуск без сети и приём фото чека из «Поделиться». Данные чеков здесь не кешируются.
const SHELL = 'chekup-shell-v1';
const STATIC = 'chekup-static-v1';
const SHARE = 'chekup-share';
const MAX_SHARED = 5;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.add('/')).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('chekup-') && ![SHELL, STATIC, SHARE].includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function receiveShare(request) {
  try {
    const form = await request.formData();
    const files = form.getAll('photo').filter(f => f && typeof f === 'object' && String(f.type).startsWith('image/')).slice(0, MAX_SHARED);
    const cache = await caches.open(SHARE);
    await Promise.all(files.map((f, i) => cache.put(`/__shared/${Date.now()}-${i}`, new Response(f, { headers: { 'content-type': f.type } }))));
  } catch { /* откроем приложение как обычно */ }
  return Response.redirect('/?shared=1', 303);
}

self.addEventListener('fetch', e => {
  const { request } = e;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.method === 'POST' && url.pathname === '/share') { e.respondWith(receiveShare(request)); return; }
  if (request.method !== 'GET' || url.pathname.startsWith('/api/')) return;

  // страница: сначала сеть, без неё — последняя сохранённая оболочка
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request).then(res => {
        if (res.ok && url.pathname === '/') { const copy = res.clone(); e.waitUntil(caches.open(SHELL).then(c => c.put('/', copy))); }
        return res;
      }).catch(async () => (await caches.match('/')) || Response.error()),
    );
    return;
  }
  // файлы сборки с хешем в имени не меняются
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    e.respondWith(
      caches.match(request).then(hit => hit || fetch(request).then(res => {
        if (res.ok) { const copy = res.clone(); e.waitUntil(caches.open(STATIC).then(c => c.put(request, copy))); }
        return res;
      })),
    );
  }
});
