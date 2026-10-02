/** Tab 5 — quiz with explanations. */
import { QUIZ, score } from '../core/quiz';
import { state } from '../core/store';
import { esc } from './dom';

export function renderQuiz(root: HTMLElement): void {
  const draw = () => {
    const s = score(state.quizAnswers);
    const answered = state.quizAnswers.filter((a) => a !== null && a !== undefined).length;
    root.innerHTML = `
      <h2>Check yourself</h2>
      <p class="lede">Six questions on what the lab showed. ${answered === QUIZ.length ? `<strong>Score: ${s.correct}/${s.total}</strong>` : `${answered}/${QUIZ.length} answered`}</p>
      ${QUIZ.map((q, i) => {
        const a = state.quizAnswers[i];
        const done = a !== null && a !== undefined;
        return `<div class="card q"><strong>${i + 1}. ${esc(q.q)}</strong>
          <div class="opts">${q.options
            .map((o, j) => {
              const cls = done ? (j === q.answer ? 'right' : j === a ? 'wrong' : '') : '';
              return `<button data-q="${i}" data-o="${j}" class="${cls}" ${done ? 'disabled' : ''}>${esc(o)}</button>`;
            })
            .join('')}</div>
          ${done ? `<p class="${a === q.answer ? 'o-ok' : 'o-upset'}" style="margin:8px 0 0">${a === q.answer ? 'Correct.' : 'Not quite.'} <span class="muted">${esc(q.why)}</span></p>` : ''}
        </div>`;
      }).join('')}
      <button id="quiz-reset">Reset quiz</button>`;
    root.querySelectorAll<HTMLButtonElement>('[data-q]').forEach((b) =>
      b.addEventListener('click', () => {
        state.quizAnswers[Number(b.dataset.q)] = Number(b.dataset.o);
        draw();
      }),
    );
    root.querySelector('#quiz-reset')!.addEventListener('click', () => {
      state.quizAnswers = [];
      draw();
    });
  };
  draw();
}
