import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { COLLECTIONS, inCollection } from '../data/collections';
import { SYSTEM_STYLE } from '../data/systems';
import { titleCase } from '../lib/format';
import { focusPiece } from '../scene/engine';
import { useAtlas } from '../state/store';
import type { ManifestEntry } from '../types';
import { IconSearch } from './icons';

interface Indexed {
  p: ManifestEntry;
  words: string[];
  lower: string;
}

function score(item: Indexed, terms: string[]): number {
  let s = 0;
  for (const t of terms) {
    const wi = item.words.findIndex((w) => w.startsWith(t));
    if (wi >= 0) s += wi === 0 ? 3 : 2;
    else if (item.lower.includes(t)) s += 1;
    else return -1;
  }
  // Prefer shorter, more specific names.
  return s - item.words.length * 0.05;
}

export function selectAndFocus(id: string) {
  const st = useAtlas.getState();
  // A structure outside the current collection takes you back to the full body.
  const p = st.byId.get(id);
  const c = COLLECTIONS.find((x) => x.id === st.collection);
  if (c && p && !inCollection(p, c, st.side)) st.setCollection(null);
  st.select(id);
  // Let the selection (and any re-layout) land before framing.
  requestAnimationFrame(() => focusPiece(id));
}

export function Search() {
  const manifest = useAtlas((s) => s.manifest);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const index = useMemo<Indexed[]>(
    () =>
      (manifest?.pieces ?? []).map((p) => {
        const lower = `${p.name} ${p.id} ${p.category} ${p.region}`.toLowerCase();
        return { p, lower, words: p.name.toLowerCase().split(/[\s,]+/) };
      }),
    [manifest],
  );

  const results = useMemo(() => {
    const terms = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    return index
      .map((it) => ({ it, s: score(it, terms) }))
      .filter((r) => r.s >= 0)
      .sort((a, b) => b.s - a.s || a.it.p.name.length - b.it.p.name.length)
      .slice(0, 8)
      .map((r) => r.it.p);
  }, [q, index]);

  useEffect(() => setCursor(0), [q]);

  // "/" focuses search from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest('input, textarea, [contenteditable]');
      if (e.key === '/' && !typing) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const choose = (p: ManifestEntry) => {
    selectAndFocus(p.id);
    setQ('');
    setOpen(false);
    input.current?.blur();
  };

  return (
    <div className="search" role="search">
      <label className="search-field">
        <IconSearch size={14} className="search-icon" />
        <input
          ref={input}
          value={q}
          placeholder="Find a structure"
          aria-label="Find a structure"
          aria-expanded={open && results.length > 0}
          aria-controls="search-results"
          role="combobox"
          aria-autocomplete="list"
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setCursor((c) => Math.min(results.length - 1, c + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setCursor((c) => Math.max(0, c - 1));
            } else if (e.key === 'Enter' && results[cursor]) {
              choose(results[cursor]);
            } else if (e.key === 'Escape') {
              setQ('');
              input.current?.blur();
            }
          }}
        />
        {!q && <kbd className="kbd">/</kbd>}
      </label>
      <AnimatePresence>
        {open && q.trim() && (
          <motion.ul
            id="search-results"
            role="listbox"
            className="panel search-results"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16 }}
          >
            {results.length === 0 && <li className="empty">No structure matches “{q.trim()}”.</li>}
            {results.map((p, i) => (
              <li key={p.id} role="option" aria-selected={i === cursor}>
                <button
                  type="button"
                  className={`result${i === cursor ? ' is-cursor' : ''}`}
                  onMouseEnter={() => setCursor(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(p)}
                >
                  <span className="bullet" style={{ background: SYSTEM_STYLE[p.system].swatch }} />
                  <span className="result-text">
                    <span className="result-name">{titleCase(p.name)}</span>
                    <span className="result-meta">
                      {p.category} · {p.region}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
