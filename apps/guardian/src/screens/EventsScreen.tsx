/**
 * Two lists: what woke you, and what didn't.
 *
 * The second list is the one that builds trust. "Twelve things moved in your
 * garden last night and I decided none of them were worth waking you for" is a
 * far better product statement than silence, and it is the screen that tells us
 * what to tune.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { recentAlerts, recentSuppressed, suppressionBreakdown, type GuardEvent } from '../store/events.ts';
import { REASON_TEXT } from '../core/suppression.ts';
import { color, space, type } from '../theme/tokens.ts';

type Tab = 'alerts' | 'suppressed';

const clock = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const day = (ms: number) =>
  new Date(ms).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });

export function EventsScreen() {
  const [tab, setTab] = useState<Tab>('alerts');
  const [rows, setRows] = useState<GuardEvent[]>([]);
  const [breakdown, setBreakdown] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    const [list, counts] = await Promise.all([
      tab === 'alerts' ? recentAlerts() : recentSuppressed(),
      suppressionBreakdown(Date.now() - 24 * 60 * 60 * 1000),
    ]);
    setRows(list);
    setBreakdown(counts);
    setBusy(false);
  }, [tab]);

  useEffect(() => { void load(); }, [load]);

  const suppressedToday = Object.values(breakdown).reduce((a, b) => a + b, 0);

  return (
    <View style={styles.root}>
      <View style={styles.tabs}>
        {(['alerts', 'suppressed'] as Tab[]).map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} style={[styles.tab, tab === t && styles.tabActive]}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'alerts' ? 'Alerts' : 'Filtered out'}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === 'suppressed' && suppressedToday > 0 && (
        <View style={styles.summary}>
          <Text style={styles.summaryNumber}>{suppressedToday}</Text>
          <Text style={styles.summaryLabel}>things ignored in the last 24 hours</Text>
        </View>
      )}

      <FlatList
        data={rows}
        keyExtractor={(e) => String(e.id)}
        refreshControl={<RefreshControl refreshing={busy} onRefresh={load} tintColor={color.accent} />}
        ItemSeparatorComponent={() => <View style={styles.rule} />}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {tab === 'alerts'
              ? 'Nothing has triggered an alert yet.'
              : 'Nothing has been filtered out yet.'}
          </Text>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowTime}>{clock(item.at)}</Text>
              <Text style={styles.rowDay}>{day(item.at)}</Text>
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>
                {item.label === 'person' ? 'Person' : item.label}
              </Text>
              <Text style={styles.rowReason}>
                {item.alerted
                  ? 'Alerted'
                  : item.reason
                    ? REASON_TEXT[item.reason]
                    : 'Filtered'}
              </Text>
            </View>
            <View
              style={[styles.dot, { backgroundColor: item.alerted ? color.alert : color.suppressed }]}
            />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.ground, paddingTop: space.md },
  tabs: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.md, marginBottom: space.md },
  tab: { paddingVertical: space.sm, paddingHorizontal: space.md, borderRadius: 3 },
  tabActive: { backgroundColor: color.accentDim },
  tabText: { ...type.label, color: color.textFaint },
  tabTextActive: { color: color.accent },
  summary: {
    paddingHorizontal: space.md, paddingBottom: space.md,
    borderBottomWidth: 1, borderBottomColor: color.hairline, marginBottom: space.sm,
  },
  summaryNumber: { ...type.reading, fontSize: 40, color: color.text },
  summaryLabel: { ...type.label, color: color.textFaint },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, paddingVertical: space.md, gap: space.md },
  rowLeft: { width: 64 },
  rowTime: { ...type.mono, color: color.text, fontSize: 14 },
  rowDay: { ...type.mono, color: color.textFaint, fontSize: 10 },
  rowBody: { flex: 1 },
  rowTitle: { ...type.body, color: color.text, textTransform: 'capitalize' },
  rowReason: { ...type.mono, color: color.textMuted },
  dot: { width: 6, height: 6, borderRadius: 3 },
  rule: { height: 1, backgroundColor: color.hairline, marginLeft: space.md + 64 + space.md },
  empty: { ...type.body, color: color.textFaint, textAlign: 'center', padding: space.xl },
});
