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
        <tr class="border-b border-stone-100">
          <td class="py-4 px-5 text-center text-stone-400 text-sm">${i + 1}</td>
          <td class="hanja py-4 px-5 text-center text-2xl text-stone-900">${esc(c.front)}</td>
          <td class="py-4 px-5 text-sm text-stone-500 leading-relaxed">${esc(c.reading)}${c.reading && c.back ? ' — ' : ''}${esc(c.back)}</td>
          <td class="py-4 px-5 text-center text-sm font-bold text-red-500">${c.fail_count}</td>
        </tr>`)
        .join('')
    : `<tr><td colspan="4" class="py-12 text-center text-stone-400 text-base">오답 없음 · 완벽합니다</td></tr>`;

  $app().innerHTML = `
    <div class="screen-enter w-full max-w-2xl flex flex-col gap-8">
      <div class="flex items-center justify-between">
        ${backBtn(`${d.title} / ${S.lv!.label}`)}
        ${homeBtn()}
      </div>
      <div class="text-center">
        <div class="text-3xl font-bold text-stone-900">학습 완료</div>
        <div class="text-sm text-stone-400 mt-2">${S.total}장 완료 · 오답 ${failed.length}장</div>
        <div class="flex justify-center gap-8 mt-5">
          <div class="text-center">
            <div class="text-2xl font-bold text-stone-800">${streak.count}일</div>
            <div class="text-xs text-stone-400 mt-1">연속 학습</div>
          </div>
          <div class="w-px bg-stone-100"></div>
          <div class="text-center">
            <div class="text-2xl font-bold text-stone-800">${streak.todayCards}장</div>
            <div class="text-xs text-stone-400 mt-1">오늘 학습</div>
          </div>
        </div>
      </div>
      <div class="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm">
        <table class="w-full border-collapse">
          <thead>
            <tr class="border-b border-stone-100 bg-stone-50">
              <th class="py-4 px-5 text-center text-sm text-stone-400 font-medium">#</th>
              <th class="py-4 px-5 text-center text-sm text-stone-400 font-medium">한자</th>
              <th class="py-4 px-5 text-left text-sm text-stone-400 font-medium">해석</th>
              <th class="py-4 px-5 text-center text-sm text-stone-400 font-medium">오답</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="flex justify-center gap-8 text-sm text-stone-400">
        <span>R — 다시 시작</span>
        <span>Ctrl+Shift+R — 초기화</span>
      </div>
    </div>`;
}
