import { useEffect, useState } from 'react';
import { ATLAS } from './scene/Brain';
import { Viewer } from './scene/Viewer';
import type { AtlasManifest } from './types';
import { Overlay } from './ui/Overlay';

export function App() {
  const [manifest, setManifest] = useState<AtlasManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch(`${ATLAS}manifest.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<AtlasManifest>;
      })
      .then(setManifest)
      .catch((e: Error) => setError(e.message));
  }, []);
  return (
    <main className="app">
      <Viewer manifest={manifest} />
      <Overlay />
      {error && (
        <div className="panel load-error" role="alert">
          Brain model could not be loaded ({error}).
        </div>
      )}
    </main>
  );
}
