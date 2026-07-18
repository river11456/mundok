import { S, curDoc, getStreak } from './state';
import { $app, esc, backBtn, homeBtn } from './render-shared';

export function renderResult(): void {
  const streak = getStreak();   // 집계는 학습 완료 시점(anki.ts rate)에서 이미 1회 수행됨
  const failed = [...S.allCards]
    .filter(c => c.fail_count > 0)
    .sort((a, b) => b.fail_count - a.fail_count);
  const d = curDoc();

  const rows = failed.length > 0
    ? failed.map((c, i) => `
        <tr>
          <td class="text-center t-faint text-[13px] num">${i + 1}</td>
          <td class="hanja text-center text-[25px] t-ink">${esc(c.front)}</td>
          <td class="text-[13.5px] t-sub leading-relaxed">${esc(c.reading)}${c.reading && c.back ? ' — ' : ''}${esc(c.back)}</td>
          <td class="fails text-center num">${c.fail_count}</td>
        </tr>`)
        .join('')
    : `<tr><td colspan="4" class="py-12 text-center t-sub text-base">오답 없음 · 완벽합니다</td></tr>`;

  $app().innerHTML = `
    <div class="screen-enter w-full max-w-2xl flex flex-col gap-7">
      <div class="flex items-center justify-between">
        ${backBtn(`${d.title} / ${S.lv!.label}`)}
        ${homeBtn()}
      </div>
      <div class="text-center">
        <h2 class="text-[26px] font-extrabold t-ink">학습 완료</h2>
        <div class="text-[13.5px] t-sub mt-2"><span class="num">${S.total}장</span> 완료 · 오답 <span class="num">${failed.length}장</span></div>
      </div>
      <div class="grid grid-cols-3 gap-2.5">
        <div class="stat"><b class="num">${streak.count}<small>일</small></b><span>연속 학습</span></div>
        <div class="stat"><b class="num">${streak.todayCards}<small>장</small></b><span>오늘 학습</span></div>
        <div class="stat${failed.length > 0 ? ' bad' : ''}"><b class="num">${failed.length}<small>장</small></b><span>오답</span></div>
      </div>
      <div class="table-card">
        <table class="w-full border-collapse">
          <thead>
            <tr>
              <th class="text-center">#</th>
              <th class="text-center">한자</th>
              <th class="text-left">해석</th>
              <th class="text-center">오답</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="flex flex-col items-center gap-4">
        <button data-action="restart" class="btn-primary">다시 시작</button>
        <div class="kb-only flex justify-center gap-6 text-[12.5px] t-faint">
          <span><kbd class="kbd">R</kbd> 다시 시작</span>
          <span><kbd class="kbd">Ctrl⇧R</kbd> 초기화</span>
        </div>
      </div>
    </div>`;
}
