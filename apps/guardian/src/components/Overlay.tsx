/**
 * The detection overlay.
 *
 * Drawn in Skia rather than with React Native views: a view hierarchy that
 * re-lays-out on every model output drops frames badly once there is more than
 * one subject, and the whole point is that the box stays welded to the person.
 *
 * Design discipline from hud-kit: confirmed subjects get a bracket and a label,
 * tentative ones get a faint outline and no text. Confidence scores are not on
 * screen — they are in the log. The person looking at this at 3am needs to know
 * "someone is at the back gate", not "0.87".
 */
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Canvas, Group, Path, Rect, Skia } from '@shopify/react-native-skia';
import type { Track, Zone } from '../core/types.ts';
import { color, type as typeScale } from '../theme/tokens.ts';

interface Props {
  tracks: Track[];
  zones: Zone[];
  width: number;
  height: number;
  showZones: boolean;
}

/** Corner brackets rather than a full rectangle — less visual weight, reads as instrument. */
function bracketPath(x: number, y: number, w: number, h: number, arm: number) {
  const p = Skia.Path.Make();
  // top-left
  p.moveTo(x, y + arm); p.lineTo(x, y); p.lineTo(x + arm, y);
  // top-right
  p.moveTo(x + w - arm, y); p.lineTo(x + w, y); p.lineTo(x + w, y + arm);
  // bottom-right
  p.moveTo(x + w, y + h - arm); p.lineTo(x + w, y + h); p.lineTo(x + w - arm, y + h);
  // bottom-left
  p.moveTo(x + arm, y + h); p.lineTo(x, y + h); p.lineTo(x, y + h - arm);
  return p;
}

function zonePath(zone: Zone, width: number, height: number) {
  const p = Skia.Path.Make();
  zone.points.forEach((pt, i) => {
    const x = pt.x * width;
    const y = pt.y * height;
    if (i === 0) p.moveTo(x, y); else p.lineTo(x, y);
  });
  p.close();
  return p;
}

export function Overlay({ tracks, zones, width, height, showZones }: Props) {
  const zonePaths = useMemo(
    () => (showZones ? zones.filter((z) => z.armed).map((z) => zonePath(z, width, height)) : []),
    [zones, width, height, showZones],
  );

  return (
    <>
      <Canvas style={{ position: 'absolute', left: 0, top: 0, width, height }} pointerEvents="none">
      {zonePaths.map((p, i) => (
        <Group key={`zone-${i}`}>
          <Path path={p} color={color.accentDim} style="fill" />
          <Path path={p} color={color.accentGlow} style="stroke" strokeWidth={1} />
        </Group>
      ))}

      {tracks.map((t) => {
        const x = t.box.x * width;
        const y = t.box.y * height;
        const w = t.box.w * width;
        const h = t.box.h * height;
        const confirmed = t.state === 'confirmed';
        const arm = Math.max(10, Math.min(w, h) * 0.22);

        if (!confirmed) {
          return (
            <Rect
              key={t.id}
              x={x} y={y} width={w} height={h}
              color={color.suppressed}
              style="stroke"
              strokeWidth={1}
            />
          );
        }

        return (
          <Group key={t.id}>
            <Path path={bracketPath(x, y, w, h, arm)} color={color.accent} style="stroke" strokeWidth={2} />
          </Group>
        );
      })}
      </Canvas>

      {/*
        Labels are React Native text rather than Skia text. Skia needs a font
        file loaded at runtime; for the handful of labels on screen the layout
        cost of real text nodes is irrelevant, and it removes a binary asset and
        a class of "font didn't load so nothing renders" bug.
      */}
      {tracks.filter((t) => t.state === 'confirmed').map((t) => (
        <View
          key={`label-${t.id}`}
          pointerEvents="none"
          style={[
            styles.label,
            { left: t.box.x * width, top: Math.max(2, t.box.y * height - 20) },
          ]}
        >
          <Text style={styles.labelText}>
            {t.label === 'person' ? 'PERSON' : t.label.toUpperCase()}
          </Text>
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  label: {
    position: 'absolute',
    paddingHorizontal: 5,
    paddingVertical: 2,
    backgroundColor: 'rgba(3, 6, 11, 0.72)',
    borderRadius: 2,
  },
  labelText: { ...typeScale.label, color: color.accent, fontSize: 10 },
});
