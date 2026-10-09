import { AnimatePresence, motion } from 'framer-motion';
import { creationName, EVIDENCE_STYLE, GENE_BY_ID, GENES } from '../data/genes';
import type { Gene } from '../data/genes';
import { useLab, viewFor } from '../state/store';
import { Toggle } from './controls';
import { IconClose } from './icons';

const fade = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 6 },
  transition: { duration: 0.22, ease: [0.4, 0, 0.2, 1] as const },
};

export function GeneLibrary() {
  const active = useLab((s) => s.active);
  const selected = useLab((s) => s.selectedGene);
  const { toggleGene, selectGene, setActive } = useLab.getState();
  return (
    <section className="panel library" aria-label="Gene library">
      <header className="panel-head">
        <h2>Gene library</h2>
        <span className="badge">
          {active.length}/{GENES.length}
        </span>
      </header>
      <p className="sub">Real variants found in people.</p>
      <ul>
        {GENES.map((g) => (
          <li key={g.id} className={`gene-row${active.includes(g.id) ? ' is-on' : ''}${selected === g.id ? ' is-selected' : ''}`}>
            <button type="button" className="gene-info" onClick={() => selectGene(g.id)}>
              <span className="gene-dot" style={{ background: g.color }} />
              <span className="gene-text">
                <span className="gene-power">{g.power}</span>
                <span className="gene-symbol">{g.symbol}</span>
              </span>
            </button>
            <Toggle on={active.includes(g.id)} onChange={() => toggleGene(g.id)} label={`Add ${g.power}`} />
          </li>
        ))}
      </ul>
      <footer className="panel-foot">
        <button
          type="button"
          className="text-btn"
          onClick={() => {
            const picks = [...GENES].sort(() => Math.random() - 0.5).slice(0, 3).map((g) => g.id);
            setActive(picks);
          }}
        >
          Random build
        </button>
        <button type="button" className="text-btn" onClick={() => setActive([])} disabled={active.length === 0}>
          Clear all
        </button>
      </footer>
    </section>
  );
}

function EvidenceBadge({ g }: { g: Gene }) {
  const s = EVIDENCE_STYLE[g.evidence];
  return (
    <span className="rating" style={{ color: s.color, background: `${s.color}14` }}>
      {s.label}
    </span>
  );
}

function GeneCard({ g }: { g: Gene }) {
  const active = useLab((s) => s.active.includes(g.id));
  const fiction = useLab((s) => s.fiction);
  const { toggleGene, selectGene, setView } = useLab.getState();
  return (
    <motion.div key={g.id} {...fade} className="card-body">
      <div className="eyebrow" style={{ color: g.color }}>
        <span className="bullet" style={{ background: g.color }} />
        {g.category}
      </div>
      <h3 className="card-title">{g.power}</h3>
      <p className="gene-id">
        <strong>{g.symbol}</strong> · {g.name} · {g.variant}
      </p>
      <p className="card-lead">{g.summary}</p>
      <h4>What it really does</h4>
      <p className="card-text">{g.effect}</p>
      <dl className="meta">
        <div>
          <dt>Effect size</dt>
          <dd>{g.effectSize}</dd>
        </div>
        <div>
          <dt>Who has it</dt>
          <dd>{g.whoHasIt}</dd>
        </div>
      </dl>
      <h4 className="cost-title">The cost</h4>
      <ul className="costs">
        {g.tradeoffs.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      {fiction > 0.01 && <p className="fiction-note">{g.fiction}</p>}
      <div className="ref">
        <EvidenceBadge g={g} />
        {g.refs.map((r) => (
          <p key={r} className="ref-cite">
            {r}
          </p>
        ))}
      </div>
      <div className="card-actions">
        <button
          type="button"
          className={`primary-btn${active ? ' is-on' : ''}`}
          onClick={() => {
            toggleGene(g.id);
            if (!active) setView(viewFor(g.id));
          }}
        >
          {active ? 'Remove from build' : 'Add to build'}
        </button>
        <button type="button" className="text-btn" onClick={() => selectGene(null)}>
          ← Back to your build
        </button>
      </div>
    </motion.div>
  );
}

function BuildCard() {
  const active = useLab((s) => s.active);
  const fiction = useLab((s) => s.fiction);
  const genes = GENES.filter((g) => active.includes(g.id));
  const name = creationName(active, fiction);
  return (
    <motion.div key="build" {...fade} className="card-body">
      <div className="eyebrow">{fiction >= 0.5 ? 'Speculative creation' : 'Your build'}</div>
      <h3 className="card-title species">{name}</h3>
      {genes.length === 0 ? (
        <p className="card-text">
          Switch on genes in the library to change the body. Each one is a real variant carried by real people (or, for
          myostatin, a handful of people and many cattle), with a real cost.
        </p>
      ) : (
        <>
          <div className="powers">
            {genes.map((g) => (
              <button key={g.id} type="button" className="chip" onClick={() => useLab.getState().selectGene(g.id)}>
                <span className="bullet" style={{ background: g.color }} />
                {g.power}
              </button>
            ))}
          </div>
          <h4>Real effects</h4>
          <ul className="effects">
            {genes.map((g) => (
              <li key={g.id}>
                <span className="eff-size">{g.effectSize}</span>
                <span>
                  <strong>{g.symbol}</strong>: {g.effect.split('. ')[0]}.
                </span>
              </li>
            ))}
          </ul>
          <h4 className="cost-title">What it would cost</h4>
          <ul className="costs">
            {genes.map((g) => (
              <li key={g.id}>
                <strong>{g.symbol}</strong>: {g.tradeoffs[0]}
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="reality">
        <strong>Reality check.</strong> Nobody carries all of these; most are rare. Editing genes in human embryos is
        banned or restricted in most countries, and the 2018 CCR5 embryo edits were widely condemned.
        {fiction >= 0.01 && ' Anything past “Real variants” on the dial is science fiction.'}
      </div>
    </motion.div>
  );
}

export function RightPanel() {
  const selected = useLab((s) => s.selectedGene);
  return (
    <aside className="panel right-card" aria-live="polite">
      {selected && (
        <button type="button" className="icon-btn close" aria-label="Close" onClick={() => useLab.getState().selectGene(null)}>
          <IconClose size={14} />
        </button>
      )}
      <AnimatePresence mode="wait" initial={false}>
        {selected ? <GeneCard key={selected} g={GENE_BY_ID[selected]} /> : <BuildCard key="build" />}
      </AnimatePresence>
    </aside>
  );
}

export function FictionDial() {
  const fiction = useLab((s) => s.fiction);
  const alien = useLab((s) => s.alien);
  const { setFiction, toggle } = useLab.getState();
  const pct = Math.round(fiction * 100);
  return (
    <div className="dial-wrap">
      <div className={`caption${fiction > 0.01 ? ' is-fiction' : ''}`}>
        {fiction <= 0.01 ? 'Real effect sizes' : fiction < 0.5 ? 'Exaggerated · not real' : 'Science fiction · not real'}
      </div>
      <section className="panel dial" aria-label="Reality to fiction">
        <div className="dial-main">
          <div className="dial-head">
            <span className="dial-title">Reality ↔ Fiction</span>
            <span className="pct">{pct}%</span>
          </div>
          <input
            className="slider"
            type="range"
            min={0}
            max={100}
            value={pct}
            aria-label="Reality to fiction"
            style={{ ['--fill' as string]: `${pct}%` }}
            onChange={(e) => setFiction(Number(e.target.value) / 100)}
          />
          <div className="explode-ends">
            <button type="button" onClick={() => setFiction(0)}>
              Real variants
            </button>
            <button type="button" onClick={() => setFiction(1)}>
              Science fiction
            </button>
          </div>
        </div>
        <span className="vdivider" />
        <label className={`alien-toggle${fiction < 0.5 ? ' is-disabled' : ''}`} title={fiction < 0.5 ? 'Push the dial past 50% to unlock' : ''}>
          <span>Alien palette</span>
          <Toggle on={alien} onChange={() => fiction >= 0.5 && toggle('alien')} label="Alien palette" />
        </label>
      </section>
    </div>
  );
}
