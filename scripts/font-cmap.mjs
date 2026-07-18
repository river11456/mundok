/**
 * TTF/OTF cmap 파서 (의존성 없음) — 폰트가 실제 지원하는 코드포인트 집합을 얻는다.
 *
 * subset-font(harfbuzz)는 원본에 없는 글리프를 조용히 누락시키므로,
 * 서브셋 전에 원본 커버리지를 확인하는 용도 (scripts/subset-font.mjs 가 사용).
 * 지원 서브테이블: format 4 (BMP), format 12 (전체 평면). 그 외 포맷은 무시.
 */

/** @param {Buffer} buf TTF/OTF 바이너리 @returns {Set<number>} 지원 코드포인트 집합 */
export function readCmapCoverage(buf) {
  const numTables = buf.readUInt16BE(4);
  let cmapOffset = -1;
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    if (buf.toString('latin1', rec, rec + 4) === 'cmap') { cmapOffset = buf.readUInt32BE(rec + 8); break; }
  }
  if (cmapOffset < 0) throw new Error('cmap 테이블 없음');

  // 유니코드 서브테이블 선택 — format 12(3/10, 0/4~6) 우선, 없으면 format 4(3/1, 0/*)
  const n = buf.readUInt16BE(cmapOffset + 2);
  let best = -1, bestFormat = -1;
  for (let i = 0; i < n; i++) {
    const rec = cmapOffset + 4 + i * 8;
    const platform = buf.readUInt16BE(rec);
    const encoding = buf.readUInt16BE(rec + 2);
    const offset   = cmapOffset + buf.readUInt32BE(rec + 4);
    const format   = buf.readUInt16BE(offset);
    const unicode  = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
    if (!unicode) continue;
    if (format === 12 && bestFormat !== 12) { best = offset; bestFormat = 12; }
    else if (format === 4 && bestFormat < 0) { best = offset; bestFormat = 4; }
  }
  if (best < 0) throw new Error('유니코드 cmap 서브테이블 없음');

  const cps = new Set();
  if (bestFormat === 12) {
    const nGroups = buf.readUInt32BE(best + 12);
    for (let g = 0; g < nGroups; g++) {
      const rec = best + 16 + g * 12;
      const start = buf.readUInt32BE(rec), end = buf.readUInt32BE(rec + 4);
      for (let cp = start; cp <= end; cp++) cps.add(cp);
    }
  } else {
    const segCount = buf.readUInt16BE(best + 6) / 2;
    const endBase = best + 14, startBase = endBase + segCount * 2 + 2;
    const deltaBase = startBase + segCount * 2, rangeBase = deltaBase + segCount * 2;
    for (let s = 0; s < segCount; s++) {
      const end = buf.readUInt16BE(endBase + s * 2);
      const start = buf.readUInt16BE(startBase + s * 2);
      if (start === 0xFFFF) continue;
      const delta = buf.readInt16BE(deltaBase + s * 2);
      const rangeOff = buf.readUInt16BE(rangeBase + s * 2);
      for (let cp = start; cp <= end; cp++) {
        if (rangeOff === 0) { cps.add(cp); continue; }
        const gidAddr = rangeBase + s * 2 + rangeOff + (cp - start) * 2;
        const gid = buf.readUInt16BE(gidAddr);
        if (gid !== 0 && ((gid + delta) & 0xFFFF) !== 0) cps.add(cp);
      }
    }
  }
  cps.delete(0);
  return cps;
}
