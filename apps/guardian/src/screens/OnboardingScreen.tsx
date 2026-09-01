/**
 * Consent and the recording notice.
 *
 * Guardian detects people without identifying them, which keeps it out of the
 * heaviest biometric regimes — but pointing a camera at a space others may
 * enter still carries a notice obligation in most jurisdictions. Rather than
 * bury that in a EULA nobody reads, it is the first screen, in plain words, and
 * the acceptance is written to a timestamped local ledger.
 */
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { grantConsent } from '../store/consent.ts';
import { color, space, type } from '../theme/tokens.ts';

export function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const [notice, setNotice] = useState(false);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.kicker}>Before you start</Text>
      <Text style={styles.title}>What this app does, and what it doesn't</Text>

      <View style={styles.block}>
        <Text style={styles.h}>Everything stays on this phone</Text>
        <Text style={styles.p}>
          Detection runs on the device. No video, no images and no faces are uploaded — there is no
          server for them to go to.
        </Text>
      </View>

      <View style={styles.block}>
        <Text style={styles.h}>It detects people, it does not recognise them</Text>
        <Text style={styles.p}>
          Guardian can tell that someone is there. It cannot tell who, and it does not build or store
          a record of anyone's face.
        </Text>
      </View>

      <View style={styles.block}>
        <Text style={styles.h}>It cannot see in complete darkness</Text>
        <Text style={styles.p}>
          Phone cameras block infrared, so Guardian needs some light — a porch lamp, a streetlight,
          moonlight. In a pitch-black space it will see nothing, and no app can change that without
          an infrared camera.
        </Text>
      </View>

      <View style={styles.block}>
        <Text style={styles.h}>Telling people they are being recorded</Text>
        <Text style={styles.p}>
          If your camera can see anywhere other people might walk, most places require you to say so
          with a visible sign. This is your responsibility, not the app's.
        </Text>
      </View>

      <View style={styles.consentRow}>
        <Switch
          value={notice}
          onValueChange={setNotice}
          trackColor={{ false: color.hairline, true: color.accentDim }}
          thumbColor={notice ? color.accent : color.textFaint}
        />
        <Text style={styles.consentText}>
          I understand I may need to display a recording notice.
        </Text>
      </View>

      <Pressable
        style={[styles.cta, !notice && styles.ctaDisabled]}
        disabled={!notice}
        onPress={() => { void grantConsent(notice).then(onDone); }}
      >
        <Text style={[styles.ctaText, !notice && styles.ctaTextDisabled]}>Continue</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.ground },
  content: { padding: space.lg, paddingTop: 72, paddingBottom: 64, gap: space.md },
  kicker: { ...type.label, color: color.accent },
  title: { ...type.title, color: color.text, marginBottom: space.md },
  block: { gap: space.xs },
  h: { ...type.body, color: color.text, fontWeight: '600' },
  p: { ...type.body, color: color.textMuted },
  consentRow: {
    flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.lg,
    paddingTop: space.md, borderTopWidth: 1, borderTopColor: color.hairline,
  },
  consentText: { ...type.body, color: color.textMuted, flex: 1 },
  cta: {
    marginTop: space.md, backgroundColor: color.accent,
    paddingVertical: space.md, borderRadius: 3, alignItems: 'center',
  },
  ctaDisabled: { backgroundColor: color.surfaceRaised },
  ctaText: { ...type.label, color: color.ground },
  ctaTextDisabled: { color: color.textFaint },
});
