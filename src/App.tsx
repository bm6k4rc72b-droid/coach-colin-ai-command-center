/**
 * Coach Colin — QB Vision.
 *
 * A single-screen capture tool: point the phone at a rep, tap the quarterback,
 * tap snap and release, and the app measures the pocket around him.
 *
 * The detection loop deliberately keeps per-frame data in refs and draws to a
 * canvas directly, pushing React state only a few times a second for the HUD.
 * Re-rendering the tree at camera frame rate would drop frames on a phone, and
 * dropped frames are lost timing precision on exactly the events being measured.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { PlayerDetector, type TrackedPlayer } from './vision/detector.ts';
import { TeamClassifier } from './vision/teams.ts';
import {
  computeHomography,
  referenceRectangle,
  type Matrix3,
  type Point,
} from './vision/homography.ts';
import { PlayEngine, type CompletedPlay, type PlaySnapshot } from './metrics/playEngine.ts';
import { completionModel, expectedFirstDown } from './metrics/models.ts';
import { loadPlays, savePlays, toCsv } from './store/plays.ts';
import { Hud } from './ui/Hud.tsx';
import { drawOverlay } from './ui/overlay.ts';
import { useCamera } from './ui/useCamera.ts';
import { clientToVideo } from './ui/videoGeometry.ts';

type TapMode = 'select' | 'calibrate' | 'target';

const EMPTY_SNAPSHOT: PlaySnapshot = {
  phase: 'idle',
  pressureOnset: null,
  pressureResponse: null,
  totalMovement: 0,
  timeToThrow: null,
  throwDistance: null,
  separationAtRelease: null,
  elapsed: 0,
};

export default function App() {
  const { videoRef, state: cameraState, error: cameraError, start, useFile } = useCamera();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const detectorRef = useRef(new PlayerDetector());
  const teamsRef = useRef(new TeamClassifier());
  const engineRef = useRef(new PlayEngine());
  const playersRef = useRef<TrackedPlayer[]>([]);
  const quarterbackRef = useRef<number | null>(null);
  const calibrationRef = useRef<Point[]>([]);
  const targetRef = useRef<Point | null>(null);
  const rafRef = useRef<number | null>(null);

  const [modelReady, setModelReady] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [tapMode, setTapMode] = useState<TapMode>('select');
  const [calibrationCount, setCalibrationCount] = useState(0);
  const [calibrated, setCalibrated] = useState(false);
  const [boxWidth, setBoxWidth] = useState(10);
  const [boxDepth, setBoxDepth] = useState(15);
  const [yardsToGo, setYardsToGo] = useState(10);
  const [jersey, setJersey] = useState('#14');
  const [quarterbackId, setQuarterbackId] = useState<number | null>(null);
  const [snapshot, setSnapshot] = useState<PlaySnapshot>(EMPTY_SNAPSHOT);
  const [plays, setPlays] = useState<CompletedPlay[]>(() => loadPlays());
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    detectorRef.current
      .load()
      .then(() => !cancelled && setModelReady(true))
      .catch((err: unknown) =>
        setModelError(err instanceof Error ? err.message : 'Failed to load the pose model.'),
      );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => savePlays(plays), [plays]);

  // The render loop. It owns the frame budget: detect, classify, feed the
  // engine, draw. HUD state is sampled on a slower cadence inside the loop.
  //
  // Note it starts as soon as the camera is live, without waiting for the model.
  // MoveNet is several megabytes and can take a while over cell service, and a
  // coach should be able to frame the shot and calibrate the field during that
  // download rather than staring at a frozen preview. Detection simply joins in
  // once the weights land.
  useEffect(() => {
    if (cameraState !== 'live') return;

    let running = true;
    let lastHudPush = 0;
    let busy = false;

    const tick = async () => {
      if (!running) return;
      rafRef.current = requestAnimationFrame(() => void tick());

      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2 || busy) return;

      busy = true;
      try {
        const now = performance.now();

        if (detectorRef.current.ready) {
          const players = await detectorRef.current.detect(video, now);
          teamsRef.current.classify(players, video);
          playersRef.current = players;
          engineRef.current.update(players, now);
        }

        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }

        const ctx = canvas.getContext('2d');
        if (ctx) {
          drawOverlay(ctx, canvas.width, canvas.height, {
            players: playersRef.current,
            quarterbackId: quarterbackRef.current,
            calibrationPoints: calibrationRef.current,
            targetPoint: targetRef.current,
          });
        }

        if (now - lastHudPush > 150) {
          lastHudPush = now;
          setSnapshot(engineRef.current.snapshot());
        }
      } catch {
        /* A single bad frame is not worth tearing the loop down for. */
      } finally {
        busy = false;
      }
    };

    void tick();

    return () => {
      running = false;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [cameraState, videoRef]);

  const applyCalibration = useCallback(
    (points: Point[]) => {
      const H: Matrix3 | null = computeHomography(
        points,
        referenceRectangle(boxWidth, boxDepth),
      );
      if (!H) {
        setNotice('Those four points are too close to a straight line. Tap a wider box.');
        return;
      }
      engineRef.current.setHomography(H);
      setCalibrated(true);
      setTapMode('select');
      setNotice(`Calibrated to a ${boxWidth} x ${boxDepth} yard box.`);
    },
    [boxWidth, boxDepth],
  );

  const handleTap = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const video = videoRef.current;
      if (!video) return;

      const point = clientToVideo(video, event.clientX, event.clientY);
      if (!point) return;

      if (tapMode === 'calibrate') {
        const next = [...calibrationRef.current, point].slice(0, 4);
        calibrationRef.current = next;
        setCalibrationCount(next.length);
        if (next.length === 4) applyCalibration(next);
        return;
      }

      if (tapMode === 'target') {
        targetRef.current = point;
        engineRef.current.markTarget(point);
        setSnapshot(engineRef.current.snapshot());
        setTapMode('select');
        return;
      }

      const hit = playersRef.current.find(
        (p) =>
          point.x >= p.box.x &&
          point.x <= p.box.x + p.box.width &&
          point.y >= p.box.y &&
          point.y <= p.box.y + p.box.height,
      );
      if (hit) {
        quarterbackRef.current = hit.id;
        setQuarterbackId(hit.id);
        setNotice(`Tracking PID ${hit.id} as the quarterback.`);
      }
    },
    [tapMode, applyCalibration, videoRef],
  );

  const beginCalibration = useCallback(() => {
    calibrationRef.current = [];
    setCalibrationCount(0);
    setCalibrated(false);
    setTapMode('calibrate');
    setNotice(
      `Tap the four corners of a known ${boxWidth} x ${boxDepth} yard box, clockwise from the near-left corner.`,
    );
  }, [boxWidth, boxDepth]);

  const handleSnap = useCallback(() => {
    if (quarterbackRef.current === null) {
      setNotice('Tap the quarterback first.');
      return;
    }
    targetRef.current = null;
    const ok = engineRef.current.snap(quarterbackRef.current, performance.now());
    setNotice(ok ? 'Live.' : 'Calibrate the field before recording a rep.');
    setSnapshot(engineRef.current.snapshot());
  }, []);

  const handleThrow = useCallback(() => {
    engineRef.current.markThrow(playersRef.current, performance.now());
    setSnapshot(engineRef.current.snapshot());
    setTapMode('target');
    setNotice('Now tap where the ball came down.');
  }, []);

  const handleSave = useCallback(() => {
    const play = engineRef.current.finish(`Rep ${plays.length + 1}`);
    if (!play) {
      setNotice('Nothing to save yet.');
      return;
    }

    const scored = withEstimates(play, yardsToGo);
    setPlays((current) => [scored, ...current]);
    engineRef.current.reset();
    targetRef.current = null;
    setSnapshot(EMPTY_SNAPSHOT);
    setNotice(`Saved ${scored.label}.`);
  }, [plays.length, yardsToGo]);

  const handleExport = useCallback(() => {
    const blob = new Blob([toCsv(plays)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `qb-vision-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [plays]);

  const live = snapshot.phase === 'live' || snapshot.phase === 'thrown';
  const liveEstimates = estimatesFor(snapshot, yardsToGo);

  return (
    <div className="app">
      <header className="app__header">
        <h1>QB Vision</h1>
        <span className={`app__status app__status--${cameraState}`}>
          {statusLabel(cameraState, modelReady)}
        </span>
      </header>

      <div className="stage" onPointerDown={handleTap}>
        <video ref={videoRef} className="stage__video" muted playsInline />
        <canvas ref={canvasRef} className="stage__canvas" />

        {quarterbackId !== null && (
          <Hud
            snapshot={snapshot}
            expectedCompletion={liveEstimates.completion}
            expectedFirstDown={liveEstimates.firstDown}
            jerseyLabel={jersey}
            trackId={quarterbackId}
          />
        )}

        {cameraState !== 'live' && (
          <div className="stage__placeholder">
            <p>{cameraError ?? modelError ?? 'Start the camera or load a clip to begin.'}</p>
          </div>
        )}

        {tapMode === 'calibrate' && (
          <div className="stage__prompt">Calibration point {calibrationCount + 1} of 4</div>
        )}
        {tapMode === 'target' && <div className="stage__prompt">Tap where the ball landed</div>}
      </div>

      {modelError && (
        <p className="notice notice--error">
          Player detection is unavailable: {modelError} The camera and field
          calibration still work; reps cannot be measured until the model loads.
        </p>
      )}

      {notice && <p className="notice notice--status">{notice}</p>}

      <div className="controls">
        <button onClick={() => void start()} disabled={cameraState === 'live'}>
          Start camera
        </button>

        <label className="controls__file">
          Load clip
          <input
            type="file"
            accept="video/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void useFile(file);
            }}
          />
        </label>

        <button onClick={beginCalibration} disabled={cameraState !== 'live'}>
          {calibrated ? 'Recalibrate' : 'Calibrate field'}
        </button>

        <button onClick={() => teamsRef.current.reset()}>Reset teams</button>
      </div>

      <div className="controls controls--primary">
        <button onClick={handleSnap} disabled={!calibrated || live}>
          Snap
        </button>
        <button onClick={handleThrow} disabled={snapshot.phase !== 'live'}>
          Release
        </button>
        <button onClick={handleSave} disabled={snapshot.phase !== 'thrown'}>
          Save rep
        </button>
      </div>

      <details className="panel">
        <summary>Setup</summary>
        <div className="panel__grid">
          <label>
            Jersey
            <input value={jersey} onChange={(e) => setJersey(e.target.value)} />
          </label>
          <label>
            Box width (yd)
            <input
              type="number"
              value={boxWidth}
              min={3}
              onChange={(e) => setBoxWidth(Number(e.target.value))}
            />
          </label>
          <label>
            Box depth (yd)
            <input
              type="number"
              value={boxDepth}
              min={3}
              onChange={(e) => setBoxDepth(Number(e.target.value))}
            />
          </label>
          <label>
            Yards to go
            <input
              type="number"
              value={yardsToGo}
              min={1}
              onChange={(e) => setYardsToGo(Number(e.target.value))}
            />
          </label>
        </div>
      </details>

      <details className="panel" open={plays.length > 0}>
        <summary>Reps ({plays.length})</summary>
        {plays.length > 0 && (
          <button className="panel__export" onClick={handleExport}>
            Export CSV
          </button>
        )}
        <ul className="reps">
          {plays.map((play) => (
            <li key={play.id}>
              <strong>{play.label}</strong>
              <span>{play.timeToThrow === null ? '—' : `${play.timeToThrow.toFixed(1)}s`} to throw</span>
              <span>{play.totalMovement.toFixed(1)} yd moved</span>
              <span>
                {play.pressureOnset === null
                  ? 'clean pocket'
                  : `pressure at ${play.pressureOnset.toFixed(1)}s`}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

/**
 * Estimates are only produced once a throw distance exists, since three of the
 * four model inputs are undefined before the release. Showing a probability
 * mid-dropback would be inventing a number.
 */
function estimatesFor(
  snapshot: PlaySnapshot,
  yardsToGo: number,
): { completion: number | null; firstDown: number | null } {
  if (snapshot.throwDistance === null || snapshot.timeToThrow === null) {
    return { completion: null, firstDown: null };
  }

  const completion = completionModel.predict({
    throwDistance: snapshot.throwDistance,
    timeToThrow: snapshot.timeToThrow,
    separationAtRelease: snapshot.separationAtRelease ?? 8,
    pressured: snapshot.pressureOnset === null ? 0 : 1,
  });

  return {
    completion,
    firstDown: expectedFirstDown(completion, snapshot.throwDistance, yardsToGo),
  };
}

function withEstimates(play: CompletedPlay, yardsToGo: number): CompletedPlay {
  const { completion, firstDown } = estimatesFor(play, yardsToGo);
  return { ...play, expectedCompletion: completion, expectedFirstDown: firstDown };
}

function statusLabel(cameraState: string, modelReady: boolean): string {
  if (!modelReady) return 'Loading model…';
  return cameraState === 'live' ? 'Tracking' : 'Ready';
}
