import { AnimatePresence, motion } from 'framer-motion';
import { SYSTEM_STYLE } from '../data/systems';
import { describe, sideLabel, systemLabel, titleCase } from '../lib/format';
import { focusPiece } from '../scene/engine';
import { useAtlas } from '../state/store';
import type { ManifestEntry, RelationRole } from '../types';
import { selectAndFocus } from './Search';
import { IconClose, IconIsolate } from './icons';

function Chip({ p, tag }: { p: ManifestEntry; tag?: string }) {
  return (
    <button type="button" className="chip" onClick={() => selectAndFocus(p.id)}>
      <span className="bullet" style={{ background: SYSTEM_STYLE[p.system].swatch }} />
      <span className="chip-name">{titleCase(p.name)}</span>
      {tag && <span className="chip-tag">{tag}</span>}
    </button>
  );
}

const ROLE_LABEL: Record<RelationRole, string> = {
  origin: 'Origin',
  insertion: 'Insertion',
  'attached-muscle': 'Attached muscles',
};

function Relations({ p, byId }: { p: ManifestEntry; byId: Map<string, ManifestEntry> }) {
  const groups = (['origin', 'insertion', 'attached-muscle'] as RelationRole[])
    .map((role) => ({ role, items: p.relations.filter((r) => r.role === role).map((r) => byId.get(r.id)!).filter(Boolean) }))
    .filter((g) => g.items.length);
  const nearby = p.nearby.map((id) => byId.get(id)!).filter(Boolean);

  return (
    <div className="relations">
      {groups.map((g) => (
        <div key={g.role} className="rel-group">
          <h4>
            {ROLE_LABEL[g.role]}
            <span className="verified" title="Bone-level attachment from standard anatomical references">
              verified
            </span>
          </h4>
          <div className="chips">
            {g.items.map((it) => (
              <Chip key={it.id} p={it} />
            ))}
          </div>
        </div>
      ))}
      {groups.length === 0 && p.system === 'muscles' && (
        <p className="rel-note">No verified attachment data for this structure.</p>
      )}
      {nearby.length > 0 && (
        <div className="rel-group">
          <h4>
            Nearby
            <span className="hint" title="Surfaces within 4 mm in the model. Proximity only, not a verified connection.">
              proximity only
            </span>
          </h4>
          <div className="chips">
            {nearby.map((it) => (
              <Chip key={it.id} p={it} tag="nearby" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function InfoPanel() {
  const id = useAtlas((s) => s.selectedId);
  const byId = useAtlas((s) => s.byId);
  const isolated = useAtlas((s) => s.isolated);
  const setIsolated = useAtlas((s) => s.setIsolated);
  const select = useAtlas((s) => s.select);
  const p = id ? byId.get(id) : undefined;

  return (
    <AnimatePresence>
      {p && (
        <motion.aside
          key="info"
          className="panel info"
          aria-label="Structure information"
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 12 }}
          transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
        >
          <button type="button" className="icon-btn close" aria-label="Close" onClick={() => select(null)}>
            <IconClose size={14} />
          </button>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={p.id}
              className="info-body"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
            >
              <div className="eyebrow">
                <span className="bullet" style={{ background: SYSTEM_STYLE[p.system].swatch }} />
                {p.category}
              </div>
              <h3 className="info-title">{titleCase(p.name)}</h3>
              <p className="info-desc">{describe(p, byId)}</p>
              <dl className="meta">
                <div>
                  <dt>ID</dt>
                  <dd className="mono">{p.id}</dd>
                </div>
                <div>
                  <dt>System</dt>
                  <dd>{systemLabel(p)}</dd>
                </div>
                <div>
                  <dt>Region</dt>
                  <dd>{p.region}</dd>
                </div>
                <div>
                  <dt>Side</dt>
                  <dd>{sideLabel(p)}</dd>
                </div>
              </dl>
              <Relations p={p} byId={byId} />
            </motion.div>
          </AnimatePresence>
          <div className="info-actions">
            <button
              type="button"
              className={`primary-btn${isolated ? ' is-on' : ''}`}
              onClick={() => {
                setIsolated(!isolated);
                focusPiece(p.id);
              }}
            >
              <IconIsolate size={15} />
              {isolated ? 'Show everything' : 'Isolate structure'}
            </button>
            <button type="button" className="text-btn" onClick={() => select(null)}>
              Clear selection
            </button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
