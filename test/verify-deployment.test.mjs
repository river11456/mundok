import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { verifyDeployment } from '../scripts/verify-deployment.mjs';

function fixture(overrides = {}) {
  const content = { 'index.html': '<html lang="ko"><body>문독</body></html>', 'sw.js': "const CACHE_NAME = 'mundok-shell-2.4.0';" };
  const metadata = { version: '2.4.0', commit: 'a'.repeat(40), files: Object.fromEntries(Object.entries(content).map(([name, value]) => [name, createHash('sha256').update(value).digest('hex')])) };
  const responses = { ...content, 'release.json': JSON.stringify(metadata), ...overrides };
  return async url => {
    assert.equal(url.origin, 'https://example.com');
    assert.equal(url.searchParams.get('release'), 'a'.repeat(40));
    const key = url.pathname.replace('/mundok/', '');
    return new Response(responses[key] ?? '', { status: Object.hasOwn(responses, key) ? 200 : 404 });
  };
}

test('운영 하위 경로에서 버전·커밋·파일 해시를 확인한다', async () => {
  const result = await verifyDeployment('https://example.com/mundok', '2.4.0', 'a'.repeat(40), fixture());
  assert.equal(result.version, '2.4.0');
  assert.deepEqual(result.verified, ['release.json', 'index.html', 'sw.js']);
});
test('같은 앱 버전이어도 다른 커밋의 배포는 거부한다', async () => {
  await assert.rejects(verifyDeployment('https://example.com/mundok/', '2.4.0', 'a'.repeat(40), fixture({ 'release.json': JSON.stringify({ version: '2.4.0', commit: 'b'.repeat(40) }) })), /커밋/);
});
test('새 메타데이터와 오래된 HTML이 섞인 부분 갱신을 거부한다', async () => {
  await assert.rejects(verifyDeployment('https://example.com/mundok/', '2.4.0', 'a'.repeat(40), fixture({ 'index.html': '<html>old</html>' })), /해시 불일치/);
});
test('404와 잘못된 메타데이터를 성공 처리하지 않는다', async () => {
  await assert.rejects(verifyDeployment('https://example.com/mundok/', '2.4.0', 'a'.repeat(40), async () => new Response('', { status: 404 })), /HTTP 404/);
  await assert.rejects(verifyDeployment('https://example.com/mundok/', '2.4.0', 'a'.repeat(40), fixture({ 'release.json': '<html>not json</html>' })), SyntaxError);
});
