import * as THREE from 'three';
import { buildBrain } from './brain.js';
import { buildVessels, buildNerves } from './vessels.js';
import { buildAneurysm } from './aneurysm.js';
import { buildArachnoid } from './arachnoid.js';
import { buildSpatulas } from './spatulas.js';
import { buildAdhesions } from './adhesions.js';

// Assembles the whole surgical field and returns a registry of named parts.
// Tools, stage goals and physics look structures up by their part id.
export function buildAnatomy() {
  const root = new THREE.Group();
  root.name = 'anatomy';

  const brain = buildBrain();
  const vessels = buildVessels();
  const nerves = buildNerves();
  const aneurysm = buildAneurysm(vessels.ICA.userData.curve);
  const arachnoid = buildArachnoid();
  const spatulas = buildSpatulas();
  const adhesions = buildAdhesions(aneurysm, vessels);

  root.add(brain.frontal, brain.temporal, brain.floor);
  Object.values(vessels).forEach((m) => root.add(m));
  Object.values(nerves).forEach((m) => root.add(m));
  root.add(aneurysm.group, adhesions.group);
  arachnoid.forEach((m) => root.add(m));
  spatulas.forEach((m) => root.add(m));

  const parts = { ...brain, ...vessels, ...nerves, aneurysm: aneurysm.dome, bleb: aneurysm.bleb };

  // Every mesh that can be hovered or picked, tagged with a part id (children inherit it).
  const pickables = [];
  root.traverse((o) => {
    if (!o.isMesh || o.userData.pickProxy) return;
    let p = o;
    while (p && !p.userData.part) p = p.parent;
    if (p) { o.userData.pickPart = p.userData.part; pickables.push(o); }
  });

  return { root, parts, pickables, arachnoid, spatulas, aneurysm, adhesions };
}
