/** End-of-lab quiz. Pure. */

export interface Question {
  q: string;
  options: string[];
  answer: number;
  why: string;
}

export const QUIZ: Question[] = [
  {
    q: 'In a webcam "invisibility cloak", what does the AI model actually do?',
    options: ['Bends light around you', 'Labels which pixels are you (segmentation)', 'Generates a new person', 'Turns off the camera'],
    answer: 1,
    why: 'The neural network only produces the mask. Replacing those pixels with the stored background is plain compositing.',
  },
  {
    q: 'Why does a clean-plate cloak break when the room lights change?',
    options: ['The model gets tired', 'The stored background no longer matches the live scene', 'The mask becomes larger', 'It does not break'],
    answer: 1,
    why: 'Your silhouette is filled with an old photo of the background; any change in light or camera position makes the patch visible.',
  },
  {
    q: 'A person detector says 0% on your cloaked video. Are you invisible?',
    options: ['Yes, to everything', 'Only in that video — a camera seeing the real scene, or a thermal or radar sensor, still sees you', 'Only at night', 'Only to radar'],
    answer: 1,
    why: 'The detector judges the pixels it receives. The real world, and other bands, are untouched.',
  },
  {
    q: 'What happens to your thermal signature when you wear an active display cloak?',
    options: ['It drops', 'It rises — electronics produce heat', 'It does not change', 'It disappears'],
    answer: 1,
    why: 'Every watt of display and computing becomes heat on your body.',
  },
  {
    q: 'Which is the best defence for electronics against the fast E1 part of an EMP?',
    options: ['Longer cables', 'A well-sealed conductive enclosure plus filtered or fibre-optic connections', 'Painting it black', 'Turning the brightness down'],
    answer: 1,
    why: 'Shielding attenuates the field; filters clamp what enters through wires; fibre carries no current.',
  },
  {
    q: 'Why are AI language models not used inside a live 30 fps cloak loop?',
    options: ['They cannot see images', 'Each answer takes far longer than the 33 ms frame budget', 'They are illegal', 'They only work offline'],
    answer: 1,
    why: 'They are excellent for writing and testing the pipeline, or judging recordings, but far too slow per frame.',
  },
];

export function score(answers: (number | null)[]): { correct: number; total: number; percent: number } {
  const correct = QUIZ.reduce((a, q, i) => a + (answers[i] === q.answer ? 1 : 0), 0);
  return { correct, total: QUIZ.length, percent: Math.round((100 * correct) / QUIZ.length) };
}
