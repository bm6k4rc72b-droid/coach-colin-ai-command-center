/**
 * Rear-camera capture.
 *
 * Football happens fast, so the constraints ask for the highest frame rate the
 * device will grant: pressure onset and release timing are only as precise as
 * the frame interval, and 60fps halves the timing error of 30.
 *
 * iOS requires a secure context (https, or localhost) for camera access and
 * will only start playback from a user gesture, which is why the hook exposes
 * an explicit `start` rather than grabbing the camera on mount.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export type CameraState = 'idle' | 'starting' | 'live' | 'error';

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CameraState>('idle');
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    setState('starting');
    setError(null);

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          'Camera API unavailable. On iPhone this needs Safari over https (or localhost).',
        );
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 60 },
        },
        audio: false,
      });

      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error('Video element not mounted.');

      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      await video.play();
      setState('live');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the camera.');
      setState('error');
    }
  }, []);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setState('idle');
  }, []);

  /** Attach a recorded clip instead of the live camera, for film review. */
  const useFile = useCallback(async (file: File) => {
    stop();
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = null;
    video.src = URL.createObjectURL(file);
    video.loop = false;
    await video.play();
    setState('live');
  }, [stop]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  return { videoRef, state, error, start, stop, useFile };
}
