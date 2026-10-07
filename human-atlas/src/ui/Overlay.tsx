import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';
import { titleCase } from '../lib/format';
import { useAtlas } from '../state/store';
import { CollectionsPanel } from './CollectionsPanel';
import { ExplodeControl } from './ExplodeControl';
import { IconClose, IconLayers } from './icons';
import { InfoPanel } from './InfoPanel';
import { Search } from './Search';
import { SystemsPanel } from './SystemsPanel';
import { Toolbar } from './Toolbar';
import { tooltip } from './tooltipBus';

function Branding() {
  const count = useAtlas((s) => s.manifest?.pieceCount);
  return (
    <header className="brand">
      <div className="eyebrow-caps">Interactive anatomy</div>
      <h1>
        Human Atlas<sup>3D</sup>
      </h1>
      <div className="brand-meta">{count ? `${count} modeled pieces · BodyParts3D` : 'Loading specimens…'}</div>
    </header>
  );
}

function Tooltip() {
  const id = useAtlas((s) => s.hoveredId);
  const p = useAtlas((s) => (s.hoveredId ? s.byId.get(s.hoveredId) : undefined));
  return (
    <div className="tooltip-anchor" ref={tooltip.bind} aria-hidden>
      <AnimatePresence>
        {id && p && (
          <motion.div
            key="tip"
            className="tooltip"
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
          >
            <div className="tooltip-name">{titleCase(p.name)}</div>
            <div className="tooltip-cat">{p.category}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Credits() {
  const open = useAtlas((s) => s.creditsOpen);
  const setOpen = useAtlas((s) => s.setCreditsOpen);
  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          className="panel credits"
          role="dialog"
          aria-label="Sources and credits"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.22 }}
        >
          <button type="button" className="icon-btn close" aria-label="Close" onClick={() => setOpen(false)}>
            <IconClose size={14} />
          </button>
          <div className="eyebrow-caps">Sources &amp; credits</div>
          <h3>BodyParts3D</h3>
          <blockquote className="attribution">
            BodyParts3D, Copyright© 2008 ライフサイエンス統合データベースセンター licensed by CC表示-継承2.1 日本
          </blockquote>
          <p className="credit-en">
            BodyParts3D, Copyright © 2008 Life Science Integrated Database Center (now the Database Center for Life
            Science, DBCLS), licensed under Creative Commons Attribution-ShareAlike 2.1 Japan.
          </p>
          <ul className="links">
            <li>
              <a href="http://lifesciencedb.jp/bp3d/info_en/license/index.html" target="_blank" rel="noreferrer">
                BodyParts3D license and credit terms
              </a>
            </li>
            <li>
              <a href="https://creativecommons.org/licenses/by-sa/2.1/jp/deed.en" target="_blank" rel="noreferrer">
                CC BY-SA 2.1 JP license deed
              </a>
            </li>
            <li>
              <a href="https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html" target="_blank" rel="noreferrer">
                BodyParts3D archive (DBCLS)
              </a>
            </li>
          </ul>
          <h4>Changes made</h4>
          <p>
            Meshes were re-oriented to metres (Y up), decimated from 24.1 M to 1.1 M triangles and compressed to glTF.
            The derived meshes are shared under the same CC BY-SA 2.1 JP license. Names and part-of groups come from the
            BodyParts3D tables; 44 pieces outside the eight atlas systems are not shown.
          </p>
          <h4>Relationships</h4>
          <p>
            Muscle attachments are curated at bone level from standard references (Gray’s Anatomy; Moore, Clinically
            Oriented Anatomy). Structures marked “nearby” only touch in the model and are not claimed as connections.
          </p>
          <p className="fine">Educational use only. Not for diagnosis or clinical decisions.</p>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

export function Overlay() {
  const ready = useAtlas((s) => !!s.manifest);
  const mobileOpen = useAtlas((s) => s.mobileLayersOpen);
  const setMobileOpen = useAtlas((s) => s.setMobileLayersOpen);
  const setCreditsOpen = useAtlas((s) => s.setCreditsOpen);
  const creditsOpen = useAtlas((s) => s.creditsOpen);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || (e.target as HTMLElement)?.closest('input')) return;
      const st = useAtlas.getState();
      if (st.creditsOpen) st.setCreditsOpen(false);
      else if (st.isolated) st.setIsolated(false);
      else if (st.selectedId) st.select(null);
      else if (st.collection) st.setCollection(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <motion.div
      className="overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: ready ? 1 : 0.6 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
    >
      <Branding />
      <div className={`left-column${mobileOpen ? ' is-open' : ''}`}>
        <button type="button" className="icon-btn sheet-close" aria-label="Close" onClick={() => setMobileOpen(false)}>
          <IconClose size={14} />
        </button>
        <SystemsPanel />
        <CollectionsPanel />
      </div>
      <button type="button" className="layers-btn" onClick={() => setMobileOpen(!mobileOpen)}>
        <IconLayers size={15} />
        Systems
      </button>
      <Search />
      <Toolbar />
      <ExplodeControl />
      <InfoPanel />
      <Tooltip />
      <Credits />
      <div className="hint">Drag to orbit · Scroll to zoom · Tap to inspect</div>
      <button type="button" className="credits-link" aria-expanded={creditsOpen} onClick={() => setCreditsOpen(!creditsOpen)}>
        Sources &amp; credits
      </button>
    </motion.div>
  );
}
