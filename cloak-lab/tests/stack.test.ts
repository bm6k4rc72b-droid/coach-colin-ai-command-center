import { describe, expect, it, vi } from 'vitest';
import { budget, STAGES, TECH } from '../src/core/techStack';
import { QUIZ, score } from '../src/core/quiz';
import { TOUR, TourRunner, type TourActions } from '../src/core/tour';

describe('AI stack catalogue', () => {
  it('every entry is complete and labelled with a maturity', () => {
    for (const t of TECH) {
      expect(t.what.length).toBeGreaterThan(10);
      expect(t.limits.length).toBeGreaterThan(5);
      expect(['Shipping', 'Prototype', 'Research', 'Fiction']).toContain(t.maturity);
    }
    expect(TECH.some((t) => t.maturity === 'Fiction')).toBe(true);
    expect(TECH.filter((t) => t.inLab).length).toBeGreaterThanOrEqual(4);
  });
});

describe('real-time budget', () => {
  it('segmenter + clean plate is real-time', () => {
    const b = budget(['mp-seg', 'plate']);
    expect(b.realtime).toBe(true);
    expect(b.fps).toBeGreaterThan(30);
    expect(b.quality).toBeGreaterThan(0);
  });
  it('generative inpainting or a language model breaks the budget', () => {
    expect(budget(['mp-seg', 'lama']).realtime).toBe(false);
    expect(budget(['mp-seg', 'plate', 'llm']).realtime).toBe(false);
    expect(budget(['mp-seg', 'plate', 'llm']).fps).toBeLessThan(1);
  });
  it('a pipeline needs both a mask and a background stage', () => {
    expect(budget(['plate']).quality).toBe(0);
    expect(budget(['plate']).verdict).toMatch(/No mask/);
    expect(budget(['mp-seg']).verdict).toMatch(/No background/);
    expect(STAGES.every((s) => s.ms > 0)).toBe(true);
  });
});

describe('quiz', () => {
  it('scores answers', () => {
    expect(score([]).correct).toBe(0);
    expect(score(QUIZ.map((q) => q.answer)).percent).toBe(100);
  });
});

describe('guided tour', () => {
  it('runs every step through the shared action interface and ends on the quiz', () => {
    const calls: string[] = [];
    const actions = new Proxy({} as TourActions, {
      get: (_t, name: string) =>
        vi.fn((...args: unknown[]) => {
          calls.push(`${name}(${args.map((a) => JSON.stringify(a)).join(',')})`);
        }),
    });
    const tour = new TourRunner(actions);
    tour.start();
    let guard = 0;
    while (tour.active && guard++ < 10000) tour.update(0.25);
    expect(tour.active).toBe(false);
    expect(calls.filter((c) => c.startsWith('goto')).map((c) => c)).toContain('goto("quiz")');
    expect(calls).toContain('capturePlate()');
    expect(calls).toContain('cloakEmpTest()');
    expect(calls.some((c) => c.startsWith('pulse'))).toBe(true);
    const total = TOUR.reduce((a, s) => a + s.seconds, 0);
    expect(total).toBeGreaterThan(60);
  });
  it('can step back and pause', () => {
    const tour = new TourRunner(new Proxy({} as TourActions, { get: () => () => undefined }));
    tour.start();
    tour.next();
    tour.next();
    expect(tour.index).toBe(2);
    tour.prev();
    expect(tour.index).toBe(1);
    tour.update(100, true);
    expect(tour.index).toBe(1);
  });
});
