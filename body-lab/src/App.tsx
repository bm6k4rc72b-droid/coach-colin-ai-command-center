import { Viewer } from './scene/Viewer';
import { Shell } from './ui/Shell';

export function App() {
  return (
    <div className="app">
      <Viewer />
      <Shell />
    </div>
  );
}
