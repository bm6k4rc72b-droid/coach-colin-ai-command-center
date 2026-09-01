/**
 * Guardian.
 *
 * Navigation is a three-state machine rather than a router. The app has one
 * primary surface — the camera — and two things you step into and back out of.
 * A router would be more dependency than the shape of this app earns.
 */
import React, { useEffect, useState } from 'react';
import { Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import * as Notifications from 'expo-notifications';

import { LiveScreen } from './screens/LiveScreen.tsx';
import { EventsScreen } from './screens/EventsScreen.tsx';
import { ZonesScreen } from './screens/ZonesScreen.tsx';
import { OnboardingScreen } from './screens/OnboardingScreen.tsx';
import { getConsent } from './store/consent.ts';
import { prune } from './store/events.ts';
import { color } from './theme/tokens.ts';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

type Route = 'live' | 'events' | 'zones';

/** Events age out after a fortnight — retention is a setting, not an accident. */
const RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

export default function App() {
  const [ready, setReady] = useState(false);
  const [consented, setConsented] = useState(false);
  const [route, setRoute] = useState<Route>('live');

  useEffect(() => {
    void (async () => {
      const consent = await getConsent();
      setConsented(consent.current);
      await prune(Date.now() - RETENTION_MS);
      await Notifications.requestPermissionsAsync();
      setReady(true);
    })();
  }, []);

  if (!ready) return <View style={styles.root} />;

  if (!consented) {
    return (
      <View style={styles.root}>
        <StatusBar barStyle="light-content" />
        <OnboardingScreen onDone={() => setConsented(true)} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      {route === 'live' && (
        <LiveScreen
          onOpenEvents={() => setRoute('events')}
          onOpenZones={() => setRoute('zones')}
        />
      )}
      {route === 'events' && <EventsScreen />}
      {route === 'zones' && <ZonesScreen onDone={() => setRoute('live')} />}
      {route === 'events' && (
        <BackBar onPress={() => setRoute('live')} />
      )}
    </View>
  );
}

function BackBar({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.back}>
      <Text style={styles.backText}>← Live</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.ground },
  back: {
    position: 'absolute', left: 16, bottom: 40,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: color.surfaceRaised, borderRadius: 3,
    borderWidth: 1, borderColor: color.hairline,
  },
  backText: { color: color.text, fontSize: 11, fontWeight: '600', letterSpacing: 1.4 },
});
