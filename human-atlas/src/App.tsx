import { useEffect, useState } from 'react';
import { ASSET_BASE } from './scene/Anatomy';
import { Viewer } from './scene/Viewer';
import { useAtlas } from './state/store';
import type { Manifest } from './types';
import { Overlay } from './ui/Overlay';

export function App() {
  const setManifest = useAtlas((s) => s.setManifest);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${ASSET_BASE}manifest.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`manifest.json: HTTP ${r.status}`);
        return r.json() as Promise<Manifest>;
      })
      .then(setManifest)
      .catch((e: Error) => setError(e.message));
  }, [setManifest]);

  return (
    <main className="app">
      <Viewer />
      <Overlay />
      {error && (
        <div className="panel load-error" role="alert">
          <strong>Anatomy assets could not be loaded.</strong>
          <span>{error}. Run <code>npm run build:anatomy</code> to generate them (see README).</span>
        </div>
      )}
    </main>
  );
}
