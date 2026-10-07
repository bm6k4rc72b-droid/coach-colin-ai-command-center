import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { COLLECTIONS, inCollection } from '../data/collections';
import type { SideFilter } from '../data/collections';
import { useAtlas } from '../state/store';
import { Segmented } from './controls';
import { IconChevron } from './icons';

export function CollectionsPanel() {
  const manifest = useAtlas((s) => s.manifest);
  const active = useAtlas((s) => s.collection);
  const side = useAtlas((s) => s.side);
  const setCollection = useAtlas((s) => s.setCollection);
  const setSide = useAtlas((s) => s.setSide);
  const [open, setOpen] = useState(() => window.innerHeight > 780);

  useEffect(() => {
    if (active) setOpen(true);
  }, [active]);

  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const c of COLLECTIONS) out[c.id] = manifest?.pieces.filter((p) => inCollection(p, c, side)).length ?? 0;
    return out;
  }, [manifest, side]);

  return (
    <section className="panel collections" aria-label="Specimen collections">
      <button type="button" className="panel-head collapsible" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>
          <h2>Specimen collections</h2>
          <p className="sub">Study the body, region by region.</p>
        </span>
        <motion.span className="chevron" animate={{ rotate: open ? 0 : -90 }} transition={{ duration: 0.2 }}>
          <IconChevron size={14} />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="collapse"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
          >
            <div className="region-grid">
              {COLLECTIONS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`region-btn${active === c.id ? ' is-active' : ''}`}
                  aria-pressed={active === c.id}
                  onClick={() => setCollection(active === c.id ? null : c.id)}
                >
                  <span>{c.label}</span>
                  <span className="count">{counts[c.id]}</span>
                </button>
              ))}
            </div>
            <Segmented<SideFilter>
              id="side"
              label="Side"
              value={side}
              onChange={setSide}
              options={[
                { value: 'both', label: 'Both' },
                { value: 'left', label: 'Left' },
                { value: 'right', label: 'Right' },
              ]}
            />
            <AnimatePresence>
              {active && (
                <motion.button
                  type="button"
                  className="text-btn exit-collection"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setCollection(null)}
                >
                  ← Back to full body
                </motion.button>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
