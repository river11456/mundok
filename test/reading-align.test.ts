import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  alignReading, isHan, readingDraftFromText, readingFromDraftCells, resolveReading, readingTokens,
} from '../src/reading-align.ts';

test('isHan — 한자만 참', () => {
  assert.equal(isHan('春'), true);
  assert.equal(isHan('은'), false);
  assert.equal(isHan(' '), false);
  assert.equal(isHan('『'), false);
});

test('전체 1:1 — 공백 미러링 포함', () => {
  assert.deepEqual(
    alignReading('春三月 此謂發陳', '춘삼월 차위발진'),
    ['춘', '삼', '월', null, '차', '위', '발', '진'],
  );
});

test('현토 미러링 — 한글 현토는 음 없이 통과', () => {
  assert.deepEqual(
    alignReading('上古之人은 其知道者라', '상고지인은 기지도자라'),
    ['상', '고', '지', '인', null, null, '기', '지', '도', '자', null],
  );
});

test('문장부호 — text에만 있는 따옴표는 건너뛴다', () => {
  assert.deepEqual(
    alignReading('曰 “見肝”', '왈 견간'),
    ['왈', null, null, '견', '간', null],
  );
});

test('독음에 공백이 없어도 정렬된다', () => {
  assert.deepEqual(alignReading('春三月 此謂', '춘삼월차위'), ['춘', '삼', '월', null, '차', '위']);
});

test('라틴 문자 미러링 (與A不若B)', () => {
  assert.deepEqual(alignReading('與A不若B', '여A불약B'), ['여', null, '불', '약', null]);
});

test('훈+음(char 카드) — 정렬 실패', () => {
  assert.equal(alignReading('春', '봄 춘'), null);
});

test('독음 음절 초과 — 정렬 실패', () => {
  assert.equal(alignReading('春三月', '춘삼월 차위'), null);
});

test('한자 수 부족 — 정렬 실패', () => {
  assert.equal(alignReading('春三月', '춘삼'), null);
});

test('빈 독음 — null', () => {
  assert.equal(alignReading('春', ''), null);
});

test('꼬리 공백·부호는 허용', () => {
  assert.deepEqual(alignReading('春三月', '춘삼월 '), ['춘', '삼', '월']);
});

test('BMP 밖 벽자도 1글자로 정렬된다', () => {
  const rare = String.fromCodePoint(0x20000); // 𠀀 (Ext-B)
  assert.deepEqual(alignReading(`${rare}春`, '가춘'), ['가', '춘']);
});

test('편집 draft — 완성 전 독음도 입력된 만큼 한자 칸에 배치한다', () => {
  assert.deepEqual(readingDraftFromText('春三月 此謂', '춘삼월차'), {
    cells: [
      { ch: '春', textIndex: 0, value: '춘' },
      { ch: '三', textIndex: 1, value: '삼' },
      { ch: '月', textIndex: 2, value: '월' },
      { ch: '此', textIndex: 4, value: '차' },
      { ch: '謂', textIndex: 5, value: '' },
    ],
    overflow: '',
  });
});

test('편집 draft — 현토와 공백을 소비해 한자 독음만 분리한다', () => {
  const draft = readingDraftFromText('上古之人은 其知道者라', '상고지인은 기지도자라');
  assert.deepEqual(draft.cells.map(cell => cell.value), ['상', '고', '지', '인', '기', '지', '도', '자']);
  assert.equal(draft.overflow, '');
});

test('편집 draft — 한자 수를 넘는 독음은 overflow로 보존한다', () => {
  assert.deepEqual(readingDraftFromText('春三月', '춘삼월차위').overflow, '차위');
});

test('한자별 draft 저장값은 기존 alignReading과 호환된다', () => {
  const reading = readingFromDraftCells(['춘', '삼', '', '차']);
  assert.equal(reading, '춘삼·차');
  assert.deepEqual(readingFromDraftCells(['춘', '삼', '월']), '춘삼월');
  assert.deepEqual(alignReading('春三月', readingFromDraftCells(['춘', '삼', '월'])), ['춘', '삼', '월']);
});

test('편집 draft — 중간 빈칸도 저장 후 같은 위치로 복원한다', () => {
  const saved = readingFromDraftCells(['춘', '', '월']);
  assert.equal(saved, '춘·월');
  assert.deepEqual(readingDraftFromText('春三月', saved).cells.map(cell => cell.value), ['춘', '', '월']);
});

test('회귀 — 토의 일부와 같은 독음도 순수 슬롯에서 소비하지 않는다', () => {
  for (const [text, reading, expected] of [
    ['人이고 而學', '인이학', ['인', '이', '학']],
    ['人이고 高學', '인고학', ['인', '고', '학']],
  ] as const) {
    assert.deepEqual(readingDraftFromText(text, reading).cells.map(cell => cell.value), expected);
  }
});

test('회귀 — 원문을 포함한 저장은 부호와 후행 빈칸을 보존한다', () => {
  assert.equal(readingFromDraftCells(['춘', '', '추'], '春·夏秋'), '춘··추');
  assert.equal(readingFromDraftCells(['인', '', ''], '人이 而學'), '인이 ··');
});

test('기존 부분 독음의 다른 배치는 선택 전 자동 확정하지 않는다', () => {
  for (const [text, raw, options] of [
    ['人이 而學', '인이', [['인', '이', ''], ['인', '', '']]],
    ['人이고 而高學', '인이고학', [['인', '이', '고', '학'], ['인', '학', '', '']]],
    ['春·夏秋', '춘·추', [['춘', '', '추'], ['춘', '추', '']]],
    ['春·夏秋', '춘 ·추', [['춘', '', '추'], ['춘', '추', '']]],
  ] as const) {
    const result = resolveReading(text, raw);
    assert.equal(result.status, 'ambiguous', raw);
    assert.equal(result.overflow, raw);
    assert.deepEqual(result.candidates.map(candidate => candidate.values), options);
    assert.ok(result.cells.every(cell => !cell.value));
    assert.equal(alignReading(text, raw), null);
  }
});

test('일부 토만 포함된 기존 혼합형은 원본 문자열을 보존한다', () => {
  const raw = '인이고학';
  const result = resolveReading('人이 而고 學', raw);
  assert.equal(result.status, 'unresolved');
  assert.equal(result.overflow, raw);
  assert.equal(alignReading('人이 而고 學', raw), null);
});

test('새 저장은 반복 음절과 모든 빈칸 조합을 두 번 왕복한다', () => {
  const fixtures = [
    ['人이 而學', ['인', '이', '학']],
    ['人이고 而以學', ['인', '이', '이', '학']],
    ['人이고 高學', ['인', '고', '학']],
    ['人이고 而高學', ['인', '이', '고', '학']],
    ['春·夏秋', ['춘', '하', '추']],
    ['\t𠀀이고\n而·以 學이라! ', ['가', '이', '이', '학']],
    ['이 人이 이 而고 學이고', ['인', '이', '학']],
    ['春··夏 秋', ['춘', '하', '추']],
  ] as const;
  let combinations = 0;
  for (const [text, readings] of fixtures) {
    for (let mask = 0; mask < 2 ** readings.length; mask++) {
      const values = readings.map((value, i) => mask & (1 << i) ? value : '');
      let saved = readingFromDraftCells(values, text);
      for (let cycle = 0; cycle < 2; cycle++) {
        const result = resolveReading(text, saved);
        assert.equal(result.status, 'ready', `${text}: ${saved}`);
        assert.equal(result.overflow, '');
        assert.deepEqual(result.cells.map(cell => cell.value), values);
        const next = readingFromDraftCells(result.cells.map(cell => cell.value), text);
        assert.equal(next, saved);
        saved = next;
      }
      combinations++;
    }
  }
  assert.equal(combinations, 88);
});

test('공백 뒤 빈칸과 초과 빈칸도 위치를 보존한다', () => {
  const result = resolveReading('春夏秋', ' 춘 \n·\t 추·하');
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.cells.map(cell => cell.value), ['춘', '', '추']);
  assert.equal(result.overflow, '·하');
});

test('입력 토큰은 NFC로 정규화하고 빈칸 토큰을 유지한다', () => {
  assert.deepEqual(readingTokens('이 ·\n학!'), ['이', '·', '학']);
  assert.equal(readingFromDraftCells(['이', ''], '而學'), '이·');
});

test('긴 반복 토 문장도 한정된 두 해석만 사용한다', () => {
  const text = '人이고 而·學 '.repeat(5000);
  const values = Array.from({ length: 15000 }, (_, i) => i % 3 === 1 ? '' : '이');
  const saved = readingFromDraftCells(values, text);
  const result = resolveReading(text, saved);
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.cells.map(cell => cell.value), values);
});


test('첫 토는 빠지고 뒤 토만 들어간 혼합형도 자동 확정하지 않는다', () => {
  const result = resolveReading('人은 而고 學', '인이고학');
  assert.equal(result.status, 'unresolved');
  assert.equal(result.overflow, '인이고학');
});

test('원문 자모는 원래 인덱스를 유지하며 NFC 독음과 왕복한다', () => {
  const text = '人이 而學';
  const values = ['인', '이', '학'];
  const saved = readingFromDraftCells(values, text);
  assert.equal(saved, '인이 이학');
  const result = resolveReading(text, saved);
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.cells.map(cell => cell.value), values);
  assert.deepEqual(result.cells.map(cell => cell.textIndex), [0, 4, 5]);
});

test('혼합형 진단은 독음 수가 한자 수 이하여도 원본을 보존한다', () => {
  for (const text of ['人은 而고 學天', '人이 而고 學天']) {
    const raw = '인이고학';
    const result = resolveReading(text, raw);
    assert.equal(result.status, 'unresolved', text);
    assert.equal(result.overflow, raw);
    assert.ok(result.cells.every(cell => !cell.value));
    assert.equal(alignReading(text, raw), null);
  }
});

test('토와 충돌하지 않는 순수 독음은 완성·부분·초과 모두 유지한다', () => {
  for (const [raw, expected, overflow] of [
    ['인이학천', ['인', '이', '학', '천'], ''],
    ['인이학', ['인', '이', '학', ''], ''],
    ['인이학천지', ['인', '이', '학', '천'], '지'],
  ] as const) {
    const result = resolveReading('人은 而고 學天', raw);
    assert.equal(result.status, 'ready');
    assert.deepEqual(result.cells.map(cell => cell.value), expected);
    assert.equal(result.overflow, overflow);
  }
});
