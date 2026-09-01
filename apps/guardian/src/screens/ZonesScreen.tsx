/**
 * Draw the area that matters.
 *
 * Zone masking is the highest-leverage control the user has: most false alerts
 * in a real garden come from the pavement, the neighbour's path, or a road, all
 * of which are simply outside the area they care about. Tap to place points,
 * tap the first point to close the shape.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions,
} from 'react-native';
import { Canvas, Circle, Path, Skia } from '@shopify/react-native-skia';
import { Camera, useCameraDevice } from 'react-native-vision-camera';

import { listZones, saveZone, deleteZone } from '../store/zones.ts';
import { color, space, type } from '../theme/tokens.ts';
import type { Point, Zone } from '../core/types.ts';

const CLOSE_RADIUS = 0.045;

export function ZonesScreen({ onDone }: { onDone: () => void }) {
  const { width, height } = useWindowDimensions();
  const device = useCameraDevice('back');
  const [zones, setZones] = useState<Zone[]>([]);
  const [draft, setDraft] = useState<Point[]>([]);
  const [name, setName] = useState('');

  useEffect(() => { void listZones().then(setZones); }, []);

  const tap = useCallback((e: { nativeEvent: { locationX: number; locationY: number } }) => {
    const p = { x: e.nativeEvent.locationX / width, y: e.nativeEvent.locationY / height };
    setDraft((prev) => {
      if (prev.length >= 3) {
        const first = prev[0];
        const near = Math.hypot(p.x - first.x, p.y - first.y) < CLOSE_RADIUS;
        if (near) return prev; // closing is handled by the Save button
      }
      return [...prev, p];
    });
  }, [width, height]);

  const commit = useCallback(async () => {
    if (draft.length < 3) return;
    const zone: Zone = {
      id: `zone-${Date.now()}`,
      name: name.trim() || `Area ${zones.length + 1}`,
      armed: true,
      points: draft,
    };
    await saveZone(zone);
    setZones(await listZones());
    setDraft([]);
    setName('');
  }, [draft, name, zones.length]);

  const toggle = useCallback(async (z: Zone) => {
    await saveZone({ ...z, armed: !z.armed });
    setZones(await listZones());
  }, []);

  const remove = useCallback(async (z: Zone) => {
    await deleteZone(z.id);
    setZones(await listZones());
  }, []);

  const poly = (pts: Point[], close: boolean) => {
    const p = Skia.Path.Make();
    pts.forEach((pt, i) => {
      const x = pt.x * width;
      const y = pt.y * height;
      if (i === 0) p.moveTo(x, y); else p.lineTo(x, y);
    });
    if (close) p.close();
    return p;
  };

  return (
    <View style={styles.root}>
      {device && (
        <Camera style={StyleSheet.absoluteFill} device={device} isActive photo={false} video={false} />
      )}

      <Pressable style={StyleSheet.absoluteFill} onPress={tap}>
        <Canvas style={StyleSheet.absoluteFill}>
          {zones.filter((z) => z.armed).map((z) => (
            <Path key={z.id} path={poly(z.points, true)} color={color.accentDim} style="fill" />
          ))}
          {zones.filter((z) => z.armed).map((z) => (
            <Path key={`${z.id}-s`} path={poly(z.points, true)} color={color.accentGlow} style="stroke" strokeWidth={1} />
          ))}
          {draft.length > 0 && (
            <Path path={poly(draft, draft.length >= 3)} color={color.accent} style="stroke" strokeWidth={2} />
          )}
          {draft.map((p, i) => (
            <Circle key={i} cx={p.x * width} cy={p.y * height} r={5} color={color.accent} />
          ))}
        </Canvas>
      </Pressable>

      <View style={styles.panel}>
        <Text style={styles.hint}>
          {draft.length === 0
            ? 'Tap to outline the area you want watched.'
            : draft.length < 3
              ? 'Keep tapping — three points minimum.'
              : 'Name it and save, or keep adding points.'}
        </Text>

        {draft.length >= 3 && (
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Back garden"
            placeholderTextColor={color.textFaint}
            style={styles.input}
          />
        )}

        <View style={styles.actions}>
          {draft.length > 0 && (
            <Pressable style={styles.ghost} onPress={() => setDraft([])}>
              <Text style={styles.ghostText}>Clear</Text>
            </Pressable>
          )}
          {draft.length >= 3 && (
            <Pressable style={styles.primary} onPress={() => void commit()}>
              <Text style={styles.primaryText}>Save area</Text>
            </Pressable>
          )}
          <Pressable style={styles.ghost} onPress={onDone}>
            <Text style={styles.ghostText}>Done</Text>
          </Pressable>
        </View>

        {zones.map((z) => (
          <View key={z.id} style={styles.zoneRow}>
            <Pressable onPress={() => void toggle(z)} style={styles.zoneToggle}>
              <View style={[styles.zoneDot, z.armed && styles.zoneDotOn]} />
              <Text style={styles.zoneName}>{z.name}</Text>
            </Pressable>
            <Pressable onPress={() => void remove(z)}>
              <Text style={styles.remove}>Remove</Text>
            </Pressable>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.ground },
  panel: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: color.surface, borderTopWidth: 1, borderTopColor: color.hairline,
    padding: space.md, paddingBottom: 40, gap: space.sm,
  },
  hint: { ...type.body, color: color.textMuted },
  input: {
    ...type.body, color: color.text, backgroundColor: color.surfaceRaised,
    borderWidth: 1, borderColor: color.hairline, borderRadius: 3,
    paddingHorizontal: space.md, paddingVertical: space.sm,
  },
  actions: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  primary: { backgroundColor: color.accent, paddingHorizontal: space.lg, paddingVertical: space.sm + 2, borderRadius: 3 },
  primaryText: { ...type.label, color: color.ground },
  ghost: { paddingHorizontal: space.md, paddingVertical: space.sm + 2 },
  ghostText: { ...type.label, color: color.textMuted },
  zoneRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: space.sm, borderTopWidth: 1, borderTopColor: color.hairline,
  },
  zoneToggle: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  zoneDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.suppressed },
  zoneDotOn: { backgroundColor: color.armed },
  zoneName: { ...type.body, color: color.text },
  remove: { ...type.label, color: color.textFaint },
});
