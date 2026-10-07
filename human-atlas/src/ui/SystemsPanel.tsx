import { useMemo } from 'react';
import { PRESETS, SYSTEM_STYLE } from '../data/systems';
import { countShown } from '../scene/engine';
import { useAtlas } from '../state/store';
import { SYSTEM_IDS } from '../types';
import type { SystemId } from '../types';
import { Segmented, Toggle } from './controls';

type Preset = keyof typeof PRESETS;

export function SystemsPanel() {
  const manifest = useAtlas((s) => s.manifest);
  const visible = useAtlas((s) => s.visible);
  const loaded = useAtlas((s) => s.loaded);
  const shown = useAtlas(countShown);
  const setVisible = useAtlas((s) => s.setVisible);
  const setVisibleSet = useAtlas((s) => s.setVisibleSet);

  const counts = useMemo(() => {
    const c = {} as Record<SystemId, number>;
    for (const s of manifest?.systems ?? []) c[s.id] = s.count;
    return c;
  }, [manifest]);

  const onCount = SYSTEM_IDS.filter((s) => visible[s]).length;
  const preset = (Object.keys(PRESETS) as Preset[]).find(
    (k) => SYSTEM_IDS.every((s) => visible[s] === PRESETS[k].includes(s)),
  );

  return (
    <section className="panel systems" aria-label="Systems">
      <header className="panel-head">
        <h2>Systems</h2>
        <span className="badge">
          {onCount}/{SYSTEM_IDS.length}
        </span>
      </header>
      <Segmented<Preset>
        id="preset"
        label="System presets"
        value={preset ?? null}
        onChange={(p) => setVisibleSet(PRESETS[p])}
        options={[
          { value: 'all', label: 'All' },
          { value: 'skeleton', label: 'Skeleton' },
          { value: 'organs', label: 'Organs' },
        ]}
      />
      <ul className="system-list">
        {SYSTEM_IDS.map((s) => (
          <li key={s} className={`system-row${visible[s] ? '' : ' is-off'}`}>
            <button type="button" className="system-name" onClick={() => setVisible(s, !visible[s])}>
              <span className={`bullet${loaded[s] ? '' : ' is-loading'}`} style={{ background: SYSTEM_STYLE[s].swatch }} />
              <span className="label">{SYSTEM_STYLE[s].label}</span>
              <span className="count">{counts[s] ?? '–'}</span>
            </button>
            <Toggle on={visible[s]} onChange={(v) => setVisible(s, v)} label={`Show ${SYSTEM_STYLE[s].label}`} />
          </li>
        ))}
      </ul>
      <footer className="panel-foot">
        <span>
          <strong>{shown}</strong> pieces visible
        </span>
        {onCount > 0 ? (
          <button type="button" className="text-btn" onClick={() => setVisibleSet([])}>
            Hide all
          </button>
        ) : (
          <button type="button" className="text-btn" onClick={() => setVisibleSet(PRESETS.all)}>
            Show all
          </button>
        )}
      </footer>
    </section>
  );
}
