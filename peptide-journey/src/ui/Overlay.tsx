import { AnimatePresence, motion } from 'framer-motion';
import { PEPTIDE_BY_ID, PEPTIDES } from '../data/peptides';
import type { Peptide, Stop, System } from '../data/peptides';
import { focusStop, roleFor } from '../scene/Journey';
import { rig } from '../scene/rig';
import { useJourney } from '../state/store';
import { IconBone, IconClose, IconLayers, IconMinus, IconOrbit, IconPlus, IconReset } from './icons';
import { Timeline } from './Timeline';
import { tooltip } from './tooltipBus';

const fade = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 6 },
  transition: { duration: 0.22, ease: [0.4, 0, 0.2, 1] as const },
};

const titleCase = (n: string) =>
  n
    .replace(/, nsn$/, '')
    .split(' ')
    .map((w, i) => (i > 0 && ['of', 'and', 'the'].includes(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');

function PeptideList() {
  const current = useJourney((s) => s.peptideId);
  const choose = useJourney((s) => s.choose);
  const groups: Array<[string, Peptide[]]> = [
    ['Natural hormones', PEPTIDES.filter((p) => p.kind === 'Natural hormone')],
    ['Medicines', PEPTIDES.filter((p) => p.kind !== 'Natural hormone')],
  ];
  return (
    <section className="panel library" aria-label="Peptides">
      <header className="panel-head">
        <h2>Peptides</h2>
        <span className="badge">{PEPTIDES.length}</span>
      </header>
      {groups.map(([label, list]) => (
        <div key={label} className="pep-group">
          <div className="group-label">{label}</div>
          <ul>
            {list.map((p) => (
              <li key={p.id}>
                <button type="button" className={`pep-btn${p.id === current ? ' is-active' : ''}`} onClick={() => choose(p.id)}>
                  <span className="gene-dot" style={{ background: p.color }} />
                  <span className="pep-name">{p.name}</span>
                  <span className="pep-half">{p.halfLifeLabel.replace(/^About /, '~').replace(/ \(active form\)/, '')}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function StopRow({ kind, title, text, stop }: { kind: string; title: string; text: string; stop?: { meshes?: string[]; systems?: System[] } }) {
  return (
    <li className={`stop stop-${kind}`}>
      <span className="stop-dot" />
      <div>
        <div className="stop-kind">{kind}</div>
        {stop ? (
          <button type="button" className="stop-title" onClick={() => focusStop(stop)}>
            {title}
          </button>
        ) : (
          <div className="stop-title static">{title}</div>
        )}
        <p className="stop-text">{text}</p>
      </div>
    </li>
  );
}

function PeptideCard() {
  const p = PEPTIDE_BY_ID[useJourney((s) => s.peptideId)];
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={p.id} {...fade} className="card-body">
        <div className="eyebrow" style={{ color: p.color }}>
          <span className="bullet" style={{ background: p.color }} />
          {p.kind}
        </div>
        <h3 className="card-title">{p.name}</h3>
        <p className="gene-id">
          {p.aminoAcids} amino acids · half-life {p.halfLifeLabel.toLowerCase()}
        </p>
        <p className="card-lead">{p.summary}</p>

        <h4>The journey</h4>
        <ol className="stops">
          <StopRow kind="Starts" title={p.source.label} text={p.source.text} stop={p.source.meshes ? p.source : undefined} />
          <StopRow kind="Travels" title="Bloodstream" text={`${p.route}. Carried through the heart to every organ.`} stop={{ systems: ['arteries'] }} />
          {p.targets.map((t: Stop) => (
            <StopRow key={t.id} kind="Acts on" title={t.label} text={t.effect} stop={t} />
          ))}
          {p.clearance.map((c: Stop) => (
            <StopRow key={c.id} kind="Cleared by" title={c.label} text={c.effect} stop={c} />
          ))}
        </ol>

        {p.trick && (
          <div className="trick">
            <strong>How it was engineered.</strong> {p.trick}
          </div>
        )}
        <p className="fact">{p.fact}</p>
        <dl className="meta">
          <div>
            <dt>Status</dt>
            <dd>{p.status}</dd>
          </div>
        </dl>
        <div className="ref">
          {p.refs.map((r) => (
            <p key={r} className="ref-cite">
              {r}
            </p>
          ))}
        </div>
        <p className="fine-print">Educational only. No dosing information, and not medical advice.</p>
      </motion.div>
    </AnimatePresence>
  );
}

function Tooltip() {
  const h = useJourney((s) => s.hovered);
  const p = PEPTIDE_BY_ID[useJourney((s) => s.peptideId)];
  const role = h ? roleFor(p, h.name, h.system as System) : null;
  return (
    <div className="tooltip-anchor" ref={tooltip.bind} aria-hidden>
      <AnimatePresence>
        {h && (
          <motion.div key="tip" className="tooltip" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
            <div className="tooltip-name">{titleCase(h.name)}</div>
            {role && <div className="tooltip-cat">{role}</div>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Toolbar() {
  const skeleton = useJourney((s) => s.skeleton);
  const autoRotate = useJourney((s) => s.autoRotate);
  const toggle = useJourney((s) => s.toggle);
  return (
    <nav className="toolbar" aria-label="View">
      <button type="button" className="tool" aria-label="Zoom in" data-tip="Zoom in" onClick={() => rig.zoom(0.72)}>
        <IconPlus />
      </button>
      <button type="button" className="tool" aria-label="Zoom out" data-tip="Zoom out" onClick={() => rig.zoom(1.38)}>
        <IconMinus />
      </button>
      <button type="button" className="tool" aria-label="Reset view" data-tip="Reset view" onClick={() => rig.home()}>
        <IconReset />
      </button>
      <span className="tool-sep" />
      <button type="button" className={`tool${skeleton ? ' is-active' : ''}`} aria-pressed={skeleton} aria-label="Show skeleton" data-tip="Show skeleton" onClick={() => toggle('skeleton')}>
        <IconBone />
      </button>
      <button type="button" className={`tool${autoRotate ? ' is-active' : ''}`} aria-pressed={autoRotate} aria-label="Turntable" data-tip="Turntable" onClick={() => toggle('autoRotate')}>
        <IconOrbit />
      </button>
    </nav>
  );
}

function Credits() {
  const open = useJourney((s) => s.creditsOpen);
  return (
    <AnimatePresence>
      {open && (
        <motion.aside className="panel credits" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.22 }}>
          <button type="button" className="icon-btn close" aria-label="Close" onClick={() => useJourney.getState().toggle('creditsOpen')}>
            <IconClose size={14} />
          </button>
          <div className="eyebrow-caps">Sources &amp; credits</div>
          <h3>About Peptide Journey</h3>
          <p>
            Body meshes: <strong>BodyParts3D, Copyright© 2008 ライフサイエンス統合データベースセンター licensed by CC表示-継承2.1 日本</strong>{' '}
            (Database Center for Life Science, CC BY-SA 2.1 JP), via Human Atlas.{' '}
            <a href="https://creativecommons.org/licenses/by-sa/2.1/jp/deed.en" target="_blank" rel="noreferrer">
              License
            </a>
            .
          </p>
          <h4>How the timeline works</h4>
          <p>
            Blood levels use a one-compartment model built from each peptide’s published half-life and time to peak. Injected
            medicines are absorbed from the depot under the skin. Natural hormones are secreted for a typical window after their
            trigger (a meal, dehydration, a stretched heart), then fall at their own half-life. Curves are normalised to their
            own peak: they show timing, not amounts.
          </p>
          <p>Organ glows show where each peptide acts and which organs clear it, scaled by the current blood level.</p>
          <p className="fine">Educational only. No dosing information, and not medical advice.</p>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

export function Overlay() {
  const ready = useJourney((s) => s.ready);
  const sheetOpen = useJourney((s) => s.sheetOpen);
  const toggle = useJourney((s) => s.toggle);
  return (
    <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: ready ? 1 : 0.5 }} transition={{ duration: 0.6 }}>
      <header className="brand">
        <div className="eyebrow-caps">Where peptides go in the body</div>
        <h1>Peptide Journey</h1>
        <div className="brand-meta">{PEPTIDES.length} peptides · real anatomy · real half-lives</div>
      </header>
      <div className={`left-column${sheetOpen ? ' is-open' : ''}`}>
        <button type="button" className="icon-btn sheet-close" aria-label="Close" onClick={() => toggle('sheetOpen')}>
          <IconClose size={14} />
        </button>
        <PeptideList />
      </div>
      <button type="button" className="layers-btn" onClick={() => toggle('sheetOpen')}>
        <IconLayers size={15} />
        Peptides
      </button>
      <aside className="panel right-card" aria-live="polite">
        <PeptideCard />
      </aside>
      <Toolbar />
      <Timeline />
      <Tooltip />
      <Credits />
      {!ready && <div className="loading">Loading body…</div>}
      <div className="hint">Drag to orbit · Click a stop to fly there</div>
      <button type="button" className="credits-link" onClick={() => toggle('creditsOpen')}>
        Sources &amp; credits
      </button>
    </motion.div>
  );
}
