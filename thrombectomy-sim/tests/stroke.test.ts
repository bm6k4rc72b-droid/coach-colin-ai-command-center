import { describe, expect, it } from 'vitest';
import { CASES } from '../src/config/cases';
import { angDiff, buildTree, choose, descendants, pathTo, pointOn } from '../src/core/anatomy';
import { contrastReach, eTici, isSuccess, perfusedFraction, type Occlusion } from '../src/core/angio';
import { debrief } from '../src/core/debrief';
import { Autopilot } from '../src/core/demo';
import { coreVolume, finalInfarct, pIndependent, untreatedInfarct } from '../src/core/physiology';
import { Sim } from '../src/core/sim';
import { passOdds, resolvePass, type PassInput } from '../src/core/thrombus';

const tree = buildTree(1);

describe('anatomy', () => {
  it('is a connected tree from the descending aorta to the cortical MCA branches', () => {
    expect(pathTo(tree, 'm3a')).toEqual(['desc', 'arch1', 'lcca', 'ica', 'm1', 'm2s', 'm3a']);
    for (const id of tree.order) {
      const s = tree.segs[id];
      if (s.parent) {
        const end = tree.segs[s.parent].pts[tree.segs[s.parent].pts.length - 1];
        expect(s.pts[0]).toEqual(end);
      }
      expect(s.length).toBeGreaterThan(5);
    }
  });
  it('vessels taper from aorta (~24 mm) to cortical branches (~1 mm)', () => {
    expect(pointOn(tree.segs.desc, 10).r * 2).toBeGreaterThan(20);
    expect(pointOn(tree.segs.ica, 10).r * 2).toBeCloseTo(5, 0);
    expect(pointOn(tree.segs.m3a, 10).r * 2).toBeLessThan(1.6);
  });
  it('tip rotation selects the branch', () => {
    expect(choose(tree, 'arch1', 0)).toBe('lcca');
    expect(choose(tree, 'arch1', 180)).toBe('arch2');
    expect(choose(tree, 'ica', 20)).toBe('m1');
    expect(choose(tree, 'ica', 200)).toBe('a1');
    expect(angDiff(350, 10)).toBe(20);
  });
  it('MCA cortical territories add up to the whole territory', () => {
    const sum = descendants(tree, 'm1').reduce((a, id) => a + tree.segs[id].territory, 0);
    expect(sum).toBeCloseTo(1, 6);
  });
});

describe('angiography and eTICI', () => {
  const L = tree.segs.m1.length;
  const m1clot: Occlusion = { seg: 'm1', u: L * 0.3, kind: 'clot', len: 10 };
  it('an M1 occlusion leaves the MCA territory unperfused (eTICI 0) but the ACA fills', () => {
    expect(perfusedFraction(tree, [m1clot])).toBe(0);
    const reach = contrastReach(tree, { seg: 'ica', u: 40 }, [m1clot]);
    expect(reach.a2).toBeDefined();
    expect(reach.m2s).toBeUndefined();
    expect(reach.m1.to).toBeCloseTo(L * 0.3, 6);
  });
  it('grades follow the perfused fraction', () => {
    expect(perfusedFraction(tree, [])).toBeCloseTo(1, 6);
    expect(eTici(1)).toBe('3');
    expect(eTici(0.95)).toBe('2c');
    expect(eTici(0.7)).toBe('2b67');
    expect(eTici(0.55)).toBe('2b50');
    expect(eTici(0.3)).toBe('2a');
    expect(eTici(0)).toBe('0');
    expect(isSuccess('2b50')).toBe(true);
    expect(isSuccess('2a')).toBe(false);
  });
  it('a residual clot in one M2 trunk gives partial reperfusion; a distal embolus gives 2c', () => {
    const inf: Occlusion = { seg: 'm2i', u: 5, kind: 'residual', len: 5 };
    expect(eTici(perfusedFraction(tree, [inf]))).toBe('2b50');
    const sup: Occlusion = { seg: 'm2s', u: 5, kind: 'residual', len: 5 };
    expect(eTici(perfusedFraction(tree, [sup]))).toBe('2a');
    const emb: Occlusion = { seg: 'm3c', u: tree.segs.m3c.length * 0.72, kind: 'embolus', len: 2 };
    expect(eTici(perfusedFraction(tree, [emb]))).toBe('2c');
  });
});

describe('physiology', () => {
  const c = CASES[0];
  it('the core grows with time, faster with poor collaterals, and stops when reperfused', () => {
    expect(coreVolume(c, 120)).toBeGreaterThan(coreVolume(c, 60));
    const poor = { ...c, collaterals: 'poor' as const };
    expect(coreVolume(poor, 120) - coreVolume(poor, 60)).toBeGreaterThan(coreVolume(c, 120) - coreVolume(c, 60));
    const at = coreVolume(c, 80, { at: 80, fraction: 1 });
    expect(coreVolume(c, 300, { at: 80, fraction: 1 })).toBeCloseTo(at, 6);
    expect(coreVolume(c, 5000)).toBe(c.hypoperfused);
  });
  it('earlier and fuller reperfusion means a smaller infarct and better outcomes', () => {
    const early = finalInfarct(c, 200, 1, 70);
    const late = finalInfarct(c, 400, 1, 300);
    const none = finalInfarct(c, 400, 0, null);
    expect(early).toBeLessThan(late);
    expect(late).toBeLessThan(none);
    expect(none).toBeCloseTo(untreatedInfarct(c), -1);
    expect(pIndependent(c, early, false)).toBeGreaterThan(pIndependent(c, none, false));
    expect(pIndependent(c, early, true)).toBeLessThan(pIndependent(c, early, false));
  });
});

describe('thrombectomy passes', () => {
  const base: PassInput = { technique: 'combined', clot: 'red', clotLength: 10, flowArrest: true, embedMinutes: 3, coverage: 1, atFace: true, pass: 1, icaT: false };
  it('technique matters by clot type: aspiration is poor for white clots', () => {
    expect(passOdds({ ...base, technique: 'aspiration', clot: 'white' }).complete).toBeLessThan(passOdds({ ...base, technique: 'stent', clot: 'white' }).complete);
    expect(passOdds({ ...base, technique: 'aspiration', clot: 'red' }).complete).toBeGreaterThan(passOdds({ ...base, technique: 'aspiration', clot: 'white' }).complete);
  });
  it('flow arrest, embedding, full coverage and being at the face all help', () => {
    const p = passOdds(base).complete;
    expect(passOdds({ ...base, flowArrest: false }).complete).toBeLessThan(p);
    expect(passOdds({ ...base, embedMinutes: 0.5 }).complete).toBeLessThan(p);
    expect(passOdds({ ...base, coverage: 0.5 }).complete).toBeLessThan(p);
    expect(passOdds({ ...base, atFace: false }).complete).toBeLessThan(p);
    expect(passOdds({ ...base, pass: 3 }).complete).toBeLessThan(p);
    expect(passOdds({ ...base, flowArrest: false }).distalEmboli).toBeGreaterThan(passOdds(base).distalEmboli);
  });
  it('resolves draws into outcomes', () => {
    expect(resolvePass(base, [0.01, 0.99, 0.99]).result).toBe('complete');
    expect(resolvePass(base, [0.999, 0, 0]).result).toBe('none');
    expect(resolvePass(base, [0.999, 0, 0]).distalEmboli).toBe(false);
  });
});

describe('the procedure', () => {
  it('triage decisions are graded against the case', () => {
    const s = new Sim('late', 1);
    s.beginTriage();
    s.decide('perfusion', 'skip');
    s.decide('lysis', 'give');
    s.decide('evt', 'proceed');
    s.decide('anaesthesia', 'sedation');
    expect(s.decisions.map((d) => d.correct)).toEqual([false, false, true, null]);
    expect(s.phase).toBe('procedure');
    expect(s.groinAt).toBeGreaterThan(40);
  });
  it('wrong-branch navigation is detected and the guide is stopped below the skull base', () => {
    const s = new Sim('m1', 1);
    s.beginTriage();
    for (const q of s.triageQuestions()) s.decide(q.id, q.options[0].id);
    s.setAngle('guide', 0);
    s.move('guide', 200);
    expect(s.route).toContain('lsa');
    expect(s.log.some((l) => l.kind === 'warn' && l.text.includes('subclavian'))).toBe(true);
    s.move('guide', -200);
    s.setAngle('guide', 180);
    s.move('guide', s.tree.segs.desc.length + 3 - s.dev.guide.s);
    expect(s.route).toEqual(['desc', 'arch1']);
    s.setAngle('guide', 0);
    s.move('guide', 400);
    expect(s.locate(s.dev.guide.s).seg).toBe('ica');
    expect(s.dev.guide.s).toBeLessThanOrEqual(s.segStart('ica')! + 58.01);
  });
  it('the stent cannot be deployed before the clot is crossed', () => {
    const s = new Sim('m1', 1);
    s.beginTriage();
    for (const q of s.triageQuestions()) s.decide(q.id, q.options[0].id);
    expect(s.deployStent()).toBe(false);
  });
  for (const c of CASES)
    it(`the autopilot completes "${c.title}" with successful reperfusion`, () => {
      let wins = 0;
      for (const seed of [1, 2, 3, 4, 5]) {
        const s = new Sim(c.id, seed);
        new Autopilot(s, 'combined').runAll();
        expect(s.phase).toBe('done');
        const d = debrief(s);
        if (d.success) {
          wins++;
          expect(d.pIndep).toBeGreaterThan(d.pIndepUntreated);
          expect(d.infarct).toBeLessThan(d.untreated);
        }
        expect(s.decisions.every((x) => x.correct !== false)).toBe(true);
      }
      expect(wins).toBeGreaterThanOrEqual(4);
    });
  it('a perfect early case is fast: door-to-groin under an hour and a first-pass effect', () => {
    const s = new Sim('m1', 1);
    new Autopilot(s, 'combined').runAll();
    const m = s.metrics();
    expect(m.doorToGroin!).toBeLessThan(60);
    expect(m.firstPass).toBe(true);
    expect(m.groinToReperfusion!).toBeLessThan(40);
  });
});
