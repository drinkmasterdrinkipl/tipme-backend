import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  ActivityIndicator, TouchableOpacity, RefreshControl,
} from 'react-native';
import { API_URL, apiFetch } from '../config';
import { C } from '../theme';
import { ADMIN_KEY } from '../adminConfig';

interface Overview {
  totalAccounts: number;
  activeAccounts: number;
  totalFeesEarned: number;
  todayFees: number;
  recentFees: { id: string; amount: number; created: string; account: string }[];
}

export default function AdminScreen({ navigation }: any) {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await apiFetch(`${API_URL}/api/admin/overview`, {
        headers: { 'X-Admin-Key': ADMIN_KEY },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Błąd ${res.status}`);
      setData(json);
    } catch (e: any) {
      setError(e.message || 'Błąd ładowania');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  return (
    <SafeAreaView style={s.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primaryLight} />}
      >
        <View style={s.header}>
          <TouchableOpacity style={s.back} onPress={() => navigation.goBack()}>
            <Text style={s.backIcon}>←</Text>
          </TouchableOpacity>
          <Text style={s.title}>Panel Admina</Text>
          <View style={s.adminBadge}>
            <Text style={s.adminBadgeText}>ADMIN</Text>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color={C.primary} style={{ marginTop: 80 }} />
        ) : error ? (
          <View style={s.errorWrap}>
            <Text style={s.errorText}>{error}</Text>
            <TouchableOpacity style={s.retryBtn} onPress={load}>
              <Text style={s.retryText}>Spróbuj ponownie</Text>
            </TouchableOpacity>
          </View>
        ) : data ? (
          <>
            {/* Konta */}
            <Text style={s.sectionLabel}>KONTA KELNERÓW</Text>
            <View style={s.grid}>
              <View style={s.card}>
                <Text style={s.cardLabel}>WSZYSTKIE</Text>
                <Text style={s.cardValue}>{data.totalAccounts}</Text>
              </View>
              <View style={s.card}>
                <Text style={s.cardLabel}>AKTYWNE</Text>
                <Text style={[s.cardValue, { color: C.success }]}>{data.activeAccounts}</Text>
              </View>
            </View>

            {/* Zarobki */}
            <Text style={s.sectionLabel}>TWOJA PROWIZJA (5%)</Text>
            <View style={s.earningsCard}>
              <View style={s.earningsRow}>
                <Text style={s.earningsLabel}>ZAROBIONO ŁĄCZNIE</Text>
                <Text style={s.earningsTotal}>{data.totalFeesEarned.toFixed(2)} zł</Text>
              </View>
              <View style={s.divider} />
              <View style={s.earningsRow}>
                <Text style={s.earningsLabel}>DZISIAJ</Text>
                <Text style={[s.earningsToday, { color: C.primaryLight }]}>
                  {data.todayFees.toFixed(2)} zł
                </Text>
              </View>
            </View>

            {/* Ostatnie transakcje */}
            {data.recentFees.length > 0 && (
              <>
                <Text style={s.sectionLabel}>OSTATNIE PROWIZJE</Text>
                <View style={s.txList}>
                  {data.recentFees.map((f, i) => {
                    const date = new Date(f.created);
                    const label = date.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' });
                    const time = date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
                    return (
                      <View key={f.id} style={[s.txRow, i === 0 && s.txRowFirst]}>
                        <View>
                          <Text style={s.txAccount}>{f.account}</Text>
                          <Text style={s.txTime}>{label} · {time}</Text>
                        </View>
                        <Text style={s.txAmount}>+{f.amount.toFixed(2)} zł</Text>
                      </View>
                    );
                  })}
                </View>
              </>
            )}

            <View style={{ height: 40 }} />
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 24, paddingTop: 16, paddingBottom: 24,
  },
  back: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  backIcon: { color: C.text3, fontSize: 16 },
  title: { flex: 1, fontSize: 24, fontWeight: '900', color: C.text1, letterSpacing: -0.5 },
  adminBadge: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 8, backgroundColor: 'rgba(168,85,247,0.15)',
    borderWidth: 1, borderColor: 'rgba(168,85,247,0.3)',
  },
  adminBadgeText: { fontSize: 10, fontWeight: '800', color: C.primaryLight, letterSpacing: 1 },
  sectionLabel: {
    fontSize: 10, fontWeight: '700', letterSpacing: 2.5,
    color: C.text3, paddingHorizontal: 24, marginBottom: 10, marginTop: 8,
  },
  grid: { flexDirection: 'row', paddingHorizontal: 20, gap: 10, marginBottom: 8 },
  card: {
    flex: 1, padding: 20, borderRadius: 20,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder,
    alignItems: 'center',
  },
  cardLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 2, color: C.text3, marginBottom: 8 },
  cardValue: { fontSize: 36, fontWeight: '900', color: C.text1, letterSpacing: -1 },
  earningsCard: {
    marginHorizontal: 20, marginBottom: 8, borderRadius: 22,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder,
    overflow: 'hidden',
  },
  earningsRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 18,
  },
  divider: { height: 1, backgroundColor: C.cardBorder, marginHorizontal: 20 },
  earningsLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 2, color: C.text3 },
  earningsTotal: { fontSize: 28, fontWeight: '900', color: C.text1, letterSpacing: -1 },
  earningsToday: { fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  txList: {
    marginHorizontal: 20, borderRadius: 20,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder,
    overflow: 'hidden',
  },
  txRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 18, paddingVertical: 14,
    borderTopWidth: 1, borderTopColor: C.cardBorder,
  },
  txRowFirst: { borderTopWidth: 0 },
  txAccount: { fontSize: 12, fontWeight: '600', color: C.text2 },
  txTime: { fontSize: 11, color: C.text3, marginTop: 2 },
  txAmount: { fontSize: 16, fontWeight: '800', color: C.success },
  errorWrap: { alignItems: 'center', marginTop: 80, paddingHorizontal: 40 },
  errorText: { fontSize: 14, color: C.error, textAlign: 'center', marginBottom: 16 },
  retryBtn: {
    paddingVertical: 12, paddingHorizontal: 28, borderRadius: 14,
    borderWidth: 1, borderColor: C.cardBorder,
  },
  retryText: { color: C.primaryLight, fontWeight: '700' },
});
