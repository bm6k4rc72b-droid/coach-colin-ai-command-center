import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { color, radius, space, type } from '../theme/tokens.ts';

type Tone = 'armed' | 'alert' | 'idle' | 'caution';

const TONE: Record<Tone, { fg: string; bg: string }> = {
  armed: { fg: color.armed, bg: 'rgba(74, 222, 128, 0.14)' },
  alert: { fg: color.alert, bg: color.alertDim },
  caution: { fg: color.caution, bg: 'rgba(245, 185, 66, 0.14)' },
  idle: { fg: color.textFaint, bg: 'rgba(223, 234, 242, 0.07)' },
};

export function Pill({ tone, children }: { tone: Tone; children: string }) {
  const t = TONE[tone];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg }]}>
      <Text style={[styles.text, { color: t.fg }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: space.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  text: { ...type.label },
});
