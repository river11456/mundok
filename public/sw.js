// 文讀 서비스 워커 — 앱 셸(HTML/JS/CSS)과 Google Fonts를 캐싱해 오프라인 사용을 지원한다.
// 캐시 무효화: 배포 시 내용이 크게 바뀌면 아래 버전 문자열을 올릴 것(자동화 없음, 소규모 앱이라 수동으로 충분).
const CACHE_NAME = 'mundok-shell-v1';
const FONT_CACHE = 'mundok-fonts-v1';
const CORE_ASSETS = ['./', './index.html', './manifest.json'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS).catch(() => {}))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME && k !== FONT_CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

function isFontCdn(url) {
  return url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com'
    || url.hostname === 'cdn.jsdelivr.net'; // Pretendard 웹폰트 (WenKai는 self-host라 CDN 불필요)
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 폰트 CDN(Google Fonts·jsdelivr): 글꼴 파일은 사실상 불변이므로 캐시 우선 — 오프라인에서도 폰트 유지
  if (isFontCdn(url)) {
    event.respondWith(
      caches.open(FONT_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // 앱 셸: stale-while-revalidate — 캐시가 있으면 즉시 응답하고 백그라운드에서 갱신
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(req);
      const fetchPromise = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached ?? fetchPromise;
    })
  );
});
