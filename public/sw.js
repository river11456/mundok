// 文讀 서비스 워커 — 앱 셸(HTML/JS/CSS)과 폰트를 캐싱해 오프라인 사용을 지원한다.
// 셸 캐시: 빌드 시 vite(sw-cache-version 플러그인)가 __APP_VERSION__을 package.json 버전으로 치환
//   → 릴리스(=버전업)마다 자동 무효화. 수동 관리 불필요.
// 폰트 캐시: 폰트 파일은 사실상 불변이라 수동 버전 유지 (폰트 구성이 바뀔 때만 올릴 것).
const CACHE_NAME = 'mundok-shell-__APP_VERSION__';
const FONT_CACHE = 'mundok-fonts-v2'; // v2: Noto Serif 폐기 (구 명조 캐시 정리)
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
