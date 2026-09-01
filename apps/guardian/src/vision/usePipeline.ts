/**
 * Wires the frame processor to the tracker and suppressor.
 *
 * Division of labour, and it matters for performance: detection runs on the
 * worklet thread inside the frame processor; tracking and suppression run on
 * the JS thread against a throttled stream of results. The tracker is cheap
 * (greedy IoU over a handful of boxes) but it is stateful, and keeping state on
 * one thread avoids a class of race that is miserable to debug.
 *
 * Inference is duty-cycled rather than run on every frame. A phone pointed at a
 * garden all night will thermally throttle if you run a detector at 30fps, and
 * a person crossing a garden is visible for seconds — 8fps of inference loses
 * nothing and roughly quarters the heat.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrameProcessor } from 'react-native-vision-camera';
import { Worklets, useSharedValue } from 'react-native-worklets-core';

import { Tracker } from '../core/tracker.ts';
import { Suppressor } from '../core/suppression.ts';
import { DEFAULT_SUPPRESSION, type Detection, type Track, type Zone } from '../core/types.ts';
import { detect } from './detector.ts';
import { record } from '../store/events.ts';

export interface PipelineOptions {
  zones: Zone[];
  armed: boolean;
  /** Target inference rate. Lower is cooler; 8 is a good default. */
  inferenceFps?: number;
  onAlert?: (track: Track) => void;
}

export interface PipelineState {
  tracks: Track[];
  /** True once the native plugin has returned at least one real frame. */
  live: boolean;
  fps: number;
}

export function usePipeline({ zones, armed, inferenceFps = 8, onAlert }: PipelineOptions) {
  const tracker = useMemo(() => new Tracker(), []);
  const suppressor = useMemo(() => new Suppressor(), []);
  const zonesRef = useRef(zones);
  const armedRef = useRef(armed);
  const lastTick = useRef(0);
  const frameCount = useRef(0);

  const [state, setState] = useState<PipelineState>({ tracks: [], live: false, fps: 0 });

  useEffect(() => { zonesRef.current = zones; }, [zones]);
  useEffect(() => {
    armedRef.current = armed;
    if (!armed) {
      tracker.reset();
      suppressor.reset();
      setState((s) => ({ ...s, tracks: [] }));
    }
  }, [armed, tracker, suppressor]);

  /** Called from the worklet with one frame's detections. Runs on JS. */
  const ingest = useCallback(
    (detections: Detection[], brightness: number, live: boolean, t: number) => {
      frameCount.current += 1;
      if (!armedRef.current) return;

      const tracks = tracker.update(detections, t);
      const { verdicts, alerts } = suppressor.assess({
        tracks, zones: zonesRef.current, t, brightness,
      });

      // Persist every decision, alert or not. The suppressed log is what lets
      // us tune against real footage instead of guessing.
      for (const v of verdicts) {
        const track = tracks.find((x) => x.id === v.trackId);
        if (!track) continue;
        // Only log a track's first verdict of each kind, or the log fills with
        // one row per frame per subject.
        if (v.alert || track.hits === DEFAULT_SUPPRESSION.minHits) {
          void record({
            at: Date.now(),
            trackId: track.id,
            zoneId: null,
            label: track.label,
            score: track.score,
            alerted: v.alert,
            reason: v.reason ?? null,
            thumbUri: null,
            box: track.box,
          });
        }
      }

      if (alerts.length > 0 && onAlert) {
        for (const id of alerts) {
          const track = tracks.find((x) => x.id === id);
          if (track) onAlert(track);
        }
      }

      const now = Date.now();
      const elapsed = now - lastTick.current;
      if (elapsed >= 1000) {
        const fps = Math.round((frameCount.current * 1000) / elapsed);
        frameCount.current = 0;
        lastTick.current = now;
        setState({ tracks: [...tracks], live, fps });
      } else {
        setState((s) => ({ ...s, tracks: [...tracks], live }));
      }
    },
    [tracker, suppressor, onAlert],
  );

  const ingestOnJS = useMemo(() => Worklets.createRunOnJS(ingest), [ingest]);

  const minGapMs = Math.round(1000 / inferenceFps);
  // A React ref cannot carry state across the worklet boundary — the worklet
  // gets a copy, so the throttle would never advance. A shared value is backed
  // by memory both threads can see.
  const lastRun = useSharedValue(0);

  const frameProcessor = useFrameProcessor(
    (frame) => {
      'worklet';
      const now = Date.now();
      // Duty-cycle: skip frames rather than inferring on all of them.
      if (now - lastRun.value < minGapMs) return;
      lastRun.value = now;

      const out = detect(frame, DEFAULT_SUPPRESSION.scoreFloor);
      ingestOnJS(out.detections, out.brightness, out.live, now);
    },
    [ingestOnJS, minGapMs],
  );

  return { frameProcessor, ...state };
}
