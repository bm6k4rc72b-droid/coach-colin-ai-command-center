import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { rig } from '../scene/cameraRig';
import { homePose } from '../scene/engine';
import { useAtlas } from '../state/store';
import { IconCollapse, IconExpand, IconFront, IconMinus, IconOrbit, IconPan, IconPlus, IconReset } from './icons';

function ToolButton({
  label,
  shortcut,
  active,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`tool${active ? ' is-active' : ''}`}
      aria-label={label}
      aria-pressed={active}
      data-tip={shortcut ? `${label} · ${shortcut}` : label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function resetCamera() {
  rig.flyTo(homePose(), 950);
}

export function Toolbar() {
  const tool = useAtlas((s) => s.tool);
  const setTool = useAtlas((s) => s.setTool);
  const [fs, setFs] = useState(false);

  useEffect(() => {
    const onFs = () => setFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'f') rig.frontView();
      else if (k === 'r') resetCamera();
      else if (k === '=' || k === '+') rig.zoom(0.7);
      else if (k === '-') rig.zoom(1.4);
      else if (k === 'o') setTool('orbit');
      else if (k === 'p') setTool('pan');
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('fullscreenchange', onFs);
      window.removeEventListener('keydown', onKey);
    };
  }, [setTool]);

  const toggleFs = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };

  return (
    <nav className="toolbar" aria-label="Camera">
      <ToolButton label="Zoom in" shortcut="+" onClick={() => rig.zoom(0.7)}>
        <IconPlus />
      </ToolButton>
      <ToolButton label="Front view" shortcut="F" onClick={() => rig.frontView()}>
        <IconFront />
      </ToolButton>
      <ToolButton label="Zoom out" shortcut="−" onClick={() => rig.zoom(1.4)}>
        <IconMinus />
      </ToolButton>
      <span className="tool-sep" />
      <ToolButton label="Orbit" shortcut="O" active={tool === 'orbit'} onClick={() => setTool('orbit')}>
        <IconOrbit />
      </ToolButton>
      <ToolButton label="Pan" shortcut="P" active={tool === 'pan'} onClick={() => setTool('pan')}>
        <IconPan />
      </ToolButton>
      <span className="tool-sep" />
      <ToolButton label="Reset camera" shortcut="R" onClick={resetCamera}>
        <IconReset />
      </ToolButton>
      <ToolButton label={fs ? 'Exit full screen' : 'Full screen'} onClick={toggleFs}>
        {fs ? <IconCollapse /> : <IconExpand />}
      </ToolButton>
    </nav>
  );
}
