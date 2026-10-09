import { AnimatePresence, motion } from 'framer-motion';
import { GROUP_STYLE, REGION_BY_ID } from '../data/regions';
import type { RegionId } from '../data/regions';
import { REFS } from '../data/evidence';
import { SCENARIOS } from '../data/scenarios';
import { CLAIMS } from '../data/myths';
import { TRAINER_STEPS, TRAINER_TRIGGERS } from '../data/trainer';
import { MOD_INFO } from '../sim/activity';
import type { StateMods } from '../sim/activity';
import { clock } from '../sim/clock';
import { useBrain } from '../state/store';
import { Toggle } from './controls';
import { RatingBadge, RefNote } from './Evidence';
import { IconClose } from './icons';

const fade = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 6 },
  transition: { duration: 0.22, ease: [0.4, 0, 0.2, 1] as const },
};

export function RegionChip({ id }: { id: RegionId }) {
  const r = REGION_BY_ID[id];
  const g = GROUP_STYLE[r.group];
  return (
    <button type="button" className="chip" onClick={() => useBrain.getState().selectRegion(id)}>
      <span className="bullet" style={{ background: g.color }} />
      {r.label}
    </button>
  );
}

// --- Left column ------------------------------------------------------------

export function ScenarioPanel() {
  const current = useBrain((s) => s.scenarioId);
  const mode = useBrain((s) => s.mode);
  const setScenario = useBrain((s) => s.setScenario);
  return (
    <section className="panel scenarios" aria-label="Scenarios">
      <header className="panel-head">
        <h2>Scenarios</h2>
        <span className="badge">{SCENARIOS.length}</span>
      </header>
      <ul>
        {SCENARIOS.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              className={`scenario-btn${s.id === current && mode === 'simulate' ? ' is-active' : ''}`}
              onClick={() => setScenario(s.id)}
            >
              <span className="scenario-tag">{s.tag}</span>
              <span className="scenario-title">{s.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function StatePanel() {
  const mods = useBrain((s) => s.mods);
  const toggleMod = useBrain((s) => s.toggleMod);
  return (
    <section className="panel state" aria-label="Your state">
      <header className="panel-head">
        <h2>Your state</h2>
      </header>
      <p className="sub">Change the person, replay the moment.</p>
      <ul className="mods">
        {(Object.keys(MOD_INFO) as Array<keyof StateMods>).map((k) => (
          <li key={k} className={`mod-row${mods[k] ? '' : ' is-off'}`}>
            <div className="mod-text">
              <span className="mod-label">{MOD_INFO[k].label}</span>
              <span className="mod-detail">{MOD_INFO[k].detail}</span>
            </div>
            <Toggle on={mods[k]} onChange={() => toggleMod(k)} label={MOD_INFO[k].label} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Legend() {
  return (
    <div className="legend" aria-label="Legend">
      {(['fast', 'body', 'slow', 'habit', 'sense'] as const).map((g) => (
        <span key={g}>
          <span className="bullet" style={{ background: GROUP_STYLE[g].color }} />
          {GROUP_STYLE[g].label}
        </span>
      ))}
    </div>
  );
}

// --- Right column -----------------------------------------------------------

function RegionCard({ id }: { id: RegionId }) {
  const r = REGION_BY_ID[id];
  const g = GROUP_STYLE[r.group];
  return (
    <motion.div key={`region-${id}`} {...fade} className="card-body">
      <div className="eyebrow" style={{ color: g.color }}>
        <span className="bullet" style={{ background: g.color }} />
        {g.label}
      </div>
      <h3 className="card-title">{r.label}</h3>
      <p className="card-lead">{r.role}</p>
      <p className="card-text">{r.detail}</p>
      {r.approx && <p className="approx">Model note: {r.approx}</p>}
      <button type="button" className="text-btn back" onClick={() => useBrain.getState().selectRegion(null)}>
        ← Back
      </button>
    </motion.div>
  );
}

function PhaseCard() {
  const scenarioId = useBrain((s) => s.scenarioId);
  const phaseIndex = useBrain((s) => s.phaseIndex);
  const sc = SCENARIOS.find((s) => s.id === scenarioId)!;
  const ph = sc.phases[phaseIndex];
  const g = GROUP_STYLE[ph.system];
  return (
    <div className="card-body">
      <div className="eyebrow">
        {sc.tag} · step {phaseIndex + 1} of {sc.phases.length}
      </div>
      <h3 className="card-title">{sc.title}</h3>
      <p className="trigger">{sc.trigger}</p>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={`${sc.id}-${phaseIndex}`} {...fade} className="phase">
          <div className="phase-head">
            <span className="system-pill" style={{ color: g.color, background: g.soft }}>
              {g.label}
            </span>
            <span className="phase-time">{ph.at} ms</span>
          </div>
          <h4>{ph.title}</h4>
          <p className="card-text">{ph.text}</p>
          <div className="chips">
            {ph.regions.map((r) => (
              <RegionChip key={r} id={r} />
            ))}
          </div>
          {ph.ref && <RefNote refKey={ph.ref} rating={ph.rating} />}
        </motion.div>
      </AnimatePresence>
      <div className="phase-nav">
        {sc.phases.map((p, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Jump to ${p.title}`}
            className={`dot${i === phaseIndex ? ' is-active' : ''}`}
            onClick={() => {
              useBrain.getState().pause();
              clock.set(p.at + 1);
            }}
          />
        ))}
      </div>
      <p className="takeaway">{sc.takeaway}</p>
    </div>
  );
}

function TrainerCard() {
  const step = useBrain((s) => s.trainerStep);
  const trigger = useBrain((s) => s.trainerTrigger);
  const choice = useBrain((s) => s.trainerChoice);
  const { setTrainerStep, setTrainerTrigger, setTrainerChoice } = useBrain.getState();
  const s = TRAINER_STEPS[step];
  const needsChoice = !!s.choices && (choice === null || !s.choices[choice].good);
  return (
    <div className="card-body">
      <div className="eyebrow">Pause trainer · {step + 1} of {TRAINER_STEPS.length}</div>
      <h3 className="card-title">Give the slow system time</h3>
      <label className="trigger-select">
        <span>Your trigger</span>
        <select value={trigger} onChange={(e) => setTrainerTrigger(Number(e.target.value))}>
          {TRAINER_TRIGGERS.map((t, i) => (
            <option key={i} value={i}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <div className="steps">
        {TRAINER_STEPS.map((t, i) => (
          <span key={t.id} className={`step${i === step ? ' is-active' : ''}${i < step ? ' is-done' : ''}`}>
            {t.title}
          </span>
        ))}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={s.id} {...fade} className="phase">
          <h4>{s.title}</h4>
          <p className="card-lead">{s.prompt}</p>
          {s.choices && (
            <div className="choices">
              {s.choices.map((c, i) => (
                <button
                  key={i}
                  type="button"
                  className={`choice${choice === i ? (c.good ? ' is-good' : ' is-bad') : ''}`}
                  onClick={() => setTrainerChoice(i)}
                >
                  {c.label}
                </button>
              ))}
              {choice !== null && <p className={`feedback ${s.choices[choice].good ? 'good' : 'bad'}`}>{s.choices[choice].feedback}</p>}
            </div>
          )}
          <p className="card-text">{s.how}</p>
          {s.ref && <RefNote refKey={s.ref} rating={s.ref === 'lieberman2007' ? 'moderate' : 'strong'} />}
        </motion.div>
      </AnimatePresence>
      <div className="trainer-actions">
        <button type="button" className="text-btn" disabled={step === 0} onClick={() => setTrainerStep(step - 1)}>
          Back
        </button>
        {step < TRAINER_STEPS.length - 1 ? (
          <button type="button" className="primary-btn small" disabled={needsChoice} onClick={() => setTrainerStep(step + 1)}>
            {needsChoice ? 'Choose a reframe' : 'Next'}
          </button>
        ) : (
          <button type="button" className="primary-btn small" onClick={() => setTrainerStep(0)}>
            Start again
          </button>
        )}
      </div>
    </div>
  );
}

function EvidenceList() {
  return (
    <div className="card-body">
      <div className="eyebrow">Myths &amp; evidence</div>
      <h3 className="card-title">What holds up?</h3>
      <p className="card-text">Popular claims about emotion and the brain, rated against the research.</p>
      <ul className="claims">
        {CLAIMS.map((c) => (
          <li key={c.claim}>
            <RatingBadge rating={c.rating} />
            <p className="claim">{c.claim}</p>
            <p className="verdict">{c.verdict}</p>
            <RefCite refKey={c.ref} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function RefCite({ refKey }: { refKey: string }) {
  return <p className="ref-cite">{REFS[refKey]?.cite ?? ''}</p>;
}

export function RightPanel() {
  const mode = useBrain((s) => s.mode);
  const region = useBrain((s) => s.selectedRegion);
  return (
    <aside className={`panel right-card mode-${mode}`} aria-live="polite">
      {region && (
        <button type="button" className="icon-btn close" aria-label="Close" onClick={() => useBrain.getState().selectRegion(null)}>
          <IconClose size={14} />
        </button>
      )}
      <AnimatePresence mode="wait" initial={false}>
        {region ? (
          <RegionCard key={`r-${region}`} id={region} />
        ) : mode === 'simulate' ? (
          <motion.div key="sim" {...fade}>
            <PhaseCard />
          </motion.div>
        ) : mode === 'trainer' ? (
          <motion.div key="trainer" {...fade}>
            <TrainerCard />
          </motion.div>
        ) : (
          <motion.div key="evidence" {...fade}>
            <EvidenceList />
          </motion.div>
        )}
      </AnimatePresence>
    </aside>
  );
}
