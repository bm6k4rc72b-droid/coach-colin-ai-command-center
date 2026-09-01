/**
 * The screen you look at while setting up, and glance at when an alert wakes
 * you. One state word, one count, and the camera. Everything else is a tap away.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import * as Notifications from 'expo-notifications';
import { useKeepAwake } from 'expo-keep-awake';

import { Overlay } from '../components/Overlay.tsx';
import { Pill } from '../components/Pill.tsx';
import { usePipeline } from '../vision/usePipeline.ts';
import { listZones } from '../store/zones.ts';
import { color, space, type } from '../theme/tokens.ts';
import type { Track, Zone } from '../core/types.ts';

export function LiveScreen({ onOpenEvents, onOpenZones }: {
  onOpenEvents: () => void;
  onOpenZones: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const { hasPermission, requestPermission } = useCameraPermission();
  // The back camera has the better sensor, which matters more here than anywhere.
  const device = useCameraDevice('back');
  const [zones, setZones] = useState<Zone[]>([]);
  const [armed, setArmed] = useState(false);
  const [alertCount, setAlertCount] = useState(0);

  // A phone watching a garden must not sleep. This is also why the app asks to
  // be left on charge — it is the single biggest cause of a missed night.
  useKeepAwake();

  useEffect(() => { void listZones().then(setZones); }, []);
  useEffect(() => { if (!hasPermission) void requestPermission(); }, [hasPermission, requestPermission]);

  const onAlert = useCallback((track: Track) => {
    setAlertCount((n) => n + 1);
    void Notifications.scheduleNotificationAsync({
      content: {
        title: 'Someone is in view',
        body: zones.find((z) => z.armed)?.name ?? 'Armed area',
        sound: true,
        interruptionLevel: 'timeSensitive',
      },
      trigger: null,
    });
  }, [zones]);

  const { frameProcessor, tracks, live, fps } = usePipeline({ zones, armed, onAlert });

  if (!hasPermission) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Camera access needed</Text>
        <Text style={styles.body}>
          Guardian watches through this phone's camera. Nothing is recorded or sent anywhere —
          detection happens on the device.
        </Text>
        <Pressable style={styles.cta} onPress={() => void requestPermission()}>
          <Text style={styles.ctaText}>Allow camera</Text>
        </Pressable>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={color.accent} />
        <Text style={styles.body}>Looking for a camera…</Text>
      </View>
    );
  }

  const confirmed = tracks.filter((t) => t.state === 'confirmed').length;

  return (
    <View style={styles.root}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive
        frameProcessor={frameProcessor}
        // Low light is the whole point: prefer the sensor's night behaviour
        // over frame rate, and never let the torch fire.
        videoHdr={false}
        torch="off"
        photo={false}
        video={false}
      />
      <Overlay tracks={tracks} zones={zones} width={width} height={height} showZones />

      <View style={styles.topBar}>
        <Pill tone={armed ? 'armed' : 'idle'}>{armed ? 'Armed' : 'Standby'}</Pill>
        {!live && <Pill tone="caution">Detector not built</Pill>}
      </View>

      <View style={styles.readout}>
        <Text style={styles.reading}>{confirmed}</Text>
        <Text style={styles.readingLabel}>
          {confirmed === 1 ? 'person in view' : 'people in view'}
        </Text>
      </View>

      <View style={styles.bottomBar}>
        <Pressable style={styles.ghost} onPress={onOpenZones}>
          <Text style={styles.ghostText}>Areas</Text>
        </Pressable>

        <Pressable
          style={[styles.arm, armed && styles.armActive]}
          onPress={() => setArmed((a) => !a)}
        >
          <Text style={[styles.armText, armed && styles.armTextActive]}>
            {armed ? 'Disarm' : 'Arm'}
          </Text>
        </Pressable>

        <Pressable style={styles.ghost} onPress={onOpenEvents}>
          <Text style={styles.ghostText}>
            Events{alertCount > 0 ? ` · ${alertCount}` : ''}
          </Text>
        </Pressable>
      </View>

      <Text style={styles.fps}>{fps} fps</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.ground },
  center: {
    flex: 1, backgroundColor: color.ground, alignItems: 'center',
    justifyContent: 'center', padding: space.xl, gap: space.md,
  },
  title: { ...type.title, color: color.text, textAlign: 'center' },
  body: { ...type.body, color: color.textMuted, textAlign: 'center', maxWidth: 320 },
  cta: {
    marginTop: space.md, paddingHorizontal: space.lg, paddingVertical: space.md,
    borderRadius: 4, backgroundColor: color.accent,
  },
  ctaText: { ...type.label, color: color.ground },
  topBar: {
    position: 'absolute', top: 56, left: space.md, right: space.md,
    flexDirection: 'row', gap: space.sm,
  },
  readout: { position: 'absolute', left: space.lg, bottom: 148 },
  reading: { ...type.reading, color: color.text },
  readingLabel: { ...type.label, color: color.textFaint, marginTop: -space.xs },
  bottomBar: {
    position: 'absolute', left: space.md, right: space.md, bottom: 44,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  ghost: { paddingVertical: space.md, paddingHorizontal: space.md },
  ghostText: { ...type.label, color: color.textMuted },
  arm: {
    paddingHorizontal: space.xl, paddingVertical: space.md,
    borderRadius: 4, borderWidth: 1, borderColor: color.hairlineStrong,
  },
  armActive: { backgroundColor: color.accent, borderColor: color.accent },
  armText: { ...type.label, color: color.text },
  armTextActive: { color: color.ground },
  fps: {
    position: 'absolute', right: space.md, top: 58,
    ...type.mono, color: color.textFaint,
  },
});
