import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

/** 버전 문자열만 일치하는 예전 배포본이나 부분 갱신을 성공으로 처리하지 않는다. */
export async function verifyDeployment(baseUrl, version, commit, fetcher = fetch) {
  const base = new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  if (!['https:', 'http:'].includes(base.protocol)) throw new Error('HTTP(S) URL이 필요합니다.');
  async function read(name) {
    const url = new URL(name, base);
    url.searchParams.set('release', commit);
    const response = await fetcher(url, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
    return response.text();
  }
  const metadata = JSON.parse(await read('release.json'));
  if (metadata.version !== version || metadata.commit !== commit) {
    throw new Error('운영 배포의 버전 또는 커밋이 예상과 다릅니다.');
  }
  for (const name of ['index.html', 'sw.js']) {
    const content = await read(name);
    const digest = createHash('sha256').update(content).digest('hex');
    if (metadata.files?.[name] !== digest) throw new Error(`${name}: 배포 파일 해시 불일치`);
    if (name === 'index.html' && !/<html[\s>]/i.test(content)) throw new Error('HTML 앱 셸이 아닙니다.');
    if (name === 'sw.js' && !content.includes(`mundok-shell-${version}`)) throw new Error('PWA 캐시 버전 불일치');
  }
  return { version, commit, url: base.href, verified: ['release.json', 'index.html', 'sw.js'] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [baseUrl, version, commit] = process.argv.slice(2);
  if (!baseUrl || !/^\d+\.\d+\.\d+$/.test(version ?? '') || !/^[a-f0-9]{40}$/.test(commit ?? '')) {
    console.error('Usage: node scripts/verify-deployment.mjs <url> <version> <commit-sha>');
    process.exitCode = 1;
  } else {
    for (let attempt = 1; attempt <= 6; attempt++) {
      try {
        console.log(JSON.stringify(await verifyDeployment(baseUrl, version, commit)));
        break;
      } catch (error) {
        console.error(`배포 확인 ${attempt}/6: ${error.message}`);
        if (attempt === 6) process.exitCode = 1;
        else await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }
}
