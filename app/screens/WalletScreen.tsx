import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { API_URL, apiFetch } from '../config';
import { C } from '../theme';
import type { RootStackParamList, PayoutItem, BalanceResponse, PayoutsResponse } from '../types';
import { useRefreshOnNewDay } from '../hooks/useRefreshOnNewDay';


export default function WalletScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [available, setAvailable] = useState<number | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [payouts, setPayouts] = useState<PayoutItem[]>([]);
  const [loadError, setLoadError] = useState('');
  const mountedRef = useRef(true);

  const loadBalance = useCallback(async () => {
    setLoadError('');
    try {
      const accountId = await AsyncStorage.getItem('stripeAccountId');
      if (!accountId) throw new Error('Brak ID konta. Zaloguj się ponownie.');
      const [balResult, payoutsResult] = await Promise.allSettled([
        apiFetch(`${API_URL}/api/balance/${accountId}`),
        apiFetch(`${API_URL}/api/payouts/${accountId}`),
      ]);
      let balFailed = true;
      if (balResult.status === 'fulfilled' && balResult.value.ok) {
        try {
          const balData: BalanceResponse = await balResult.value.json();
          if (!balData.error && mountedRef.current) {
            setAvailable(balData.available);
            setPending(balData.pending);
            balFailed = false;
          }
        } catch { /* JSON parse error — balFailed stays true */ }
      }
      if (payoutsResult.status === 'fulfilled' && payoutsResult.value.ok && mountedRef.current) {
        try {
          const payoutsData: PayoutsResponse = await payoutsResult.value.json();
          setPayouts(payoutsData.payouts || []);
        } catch { /* JSON parse error — payouts stays empty */ }
      }
      if (balFailed && mountedRef.current) setLoadError('Nie udało się pobrać salda. Sprawdź połączenie.');
    } catch (e: any) {
      if (!mountedRef.current) return;
      setLoadError(e.message || 'Nie udało się pobrać danych.');
      setAvailable(0);
      setPending(0);
    } finally {
      if (mountedRef.current) { setLoading(false); setRefreshing(false); }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    loadBalance();
    return () => { mountedRef.current = false; };
  }, [loadBalance]);
  useRefreshOnNewDay(useCallback(() => { loadBalance(); }, [loadBalance]));

  const onRefresh = () => { setRefreshing(true); loadBalance(); };

  const total = (available ?? 0) + (pending ?? 0);
  const nextPayout = payouts.find(p => p.status !== 'paid' && p.status !== 'failed');
  const nextPayoutDate = nextPayout
    ? new Date(((nextPayout.arrivalDate ?? nextPayout.arrival_date) ?? 0) * 1000)
        .toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' })
    : null;

  return (
    <SafeAreaView style={s.root}>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primaryLight} />}
      >
        <View style={s.header}>
          <Text style={s.title}>Portfel</Text>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={C.primary} style={{ marginTop: 60 }} />
        ) : loadError ? (
          <View style={s.errorBox}>
            <Text style={s.errorBoxText}>{loadError}</Text>
            <TouchableOpacity style={s.retryBtn2} onPress={loadBalance}>
              <Text style={s.retryBtn2Text}>Spróbuj ponownie</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Główna karta — prosta informacja o następnej wypłacie */}
            <View style={s.balanceCard}>
              {nextPayout ? (
                <>
                  <Text style={s.balanceLabel}>IDZIE NA TWOJE KONTO</Text>
                  <Text style={s.balanceAmount}>
                    +{(nextPayout.amount ?? 0).toFixed(2)}
                    <Text style={s.balanceCurr}> zł</Text>
                  </Text>
                  <Text style={s.balanceDate}>oczekiwana data: {nextPayoutDate}</Text>
                  {total < 0 && (
                    <View style={s.deficitNote}>
                      <Text style={s.deficitNoteText}>
                        ⚠️ Z tej kwoty zostanie potrącone {Math.abs(total).toFixed(2)} zł za opłaty ze zwróconych transakcji
                      </Text>
                    </View>
                  )}
                </>
              ) : total < 0 ? (
                <>
                  <Text style={s.balanceLabel}>KOREKTA DO ROZLICZENIA</Text>
                  <Text style={[s.balanceAmount, { color: C.error }]}>
                    -{Math.abs(total).toFixed(2)}
                    <Text style={[s.balanceCurr, { color: C.error }]}> zł</Text>
                  </Text>
                  <Text style={s.balanceNote}>zostanie potrącone z kolejnej wypłaty na konto bankowe</Text>
                </>
              ) : (
                <>
                  <Text style={s.balanceLabel}>BRAK OCZEKUJĄCYCH WYPŁAT</Text>
                  <Text style={s.emptyNote}>Napiwki pojawią się tutaj po rozliczeniu (ok. 5–7 dni)</Text>
                </>
              )}
            </View>


            {/* Szczegóły konta */}
            <TouchableOpacity style={s.dashboardBtn} onPress={() => navigation.navigate('AccountDetails')} activeOpacity={0.75}>
              <View style={s.dashboardBtnInner}>
                <View style={s.dashboardBtnLeft}>
                  <Text style={s.dashboardBtnIcon}>🏦</Text>
                  <View>
                    <Text style={s.dashboardBtnText}>Szczegóły konta</Text>
                    <Text style={s.dashboardBtnSub}>Konto bankowe, status weryfikacji</Text>
                  </View>
                </View>
                <Text style={s.dashboardBtnArrow}>→</Text>
              </View>
            </TouchableOpacity>

            {/* Wypłaty na konto */}
            {payouts.length > 0 && (
              <View style={s.payoutsSection}>
                <Text style={s.payoutsTitle}>WYPŁATY NA KONTO</Text>
                {payouts.map(p => {
                  const statusColor = p.status === 'paid' ? C.success ?? '#22c55e' : p.status === 'failed' ? C.error : C.gold;
                  const statusLabel = p.status === 'paid' ? 'Wypłacono' : p.status === 'failed' ? 'Błąd' : 'W toku';
                  const date = new Date((p.arrivalDate ?? p.arrival_date) * 1000).toLocaleDateString('pl-PL');
                  return (
                    <View key={p.id} style={s.payoutRow}>
                      <View>
                        <Text style={s.payoutDate}>{date}</Text>
                        <Text style={[s.payoutStatus, { color: statusColor }]}>{statusLabel}</Text>
                      </View>
                      <Text style={s.payoutAmount}>+{(p.amount ?? 0).toFixed(2)} zł</Text>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Informacja prawna */}
            <View style={s.legalBox}>
              <Text style={s.legalText}>
                Płatności obsługuje Stripe Payments Europe Ltd. (licencja instytucji pieniądza elektronicznego UE). Środki są automatycznie wypłacane na konto bankowe. Tip For Me nie przechowuje Twoich środków.
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: 24, paddingBottom: 40 },
  header: { paddingTop: 16, paddingBottom: 20 },
  title: { fontSize: 28, fontWeight: '900', color: C.text1, letterSpacing: -0.5 },
  balanceCard: {
    backgroundColor: C.card, borderRadius: 24,
    borderWidth: 1, borderColor: C.cardBorder,
    padding: 28, marginBottom: 16, alignItems: 'center',
  },
  balanceLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 2.5, color: C.text3, marginBottom: 10 },
  balanceAmount: { fontSize: 56, fontWeight: '900', color: C.text1, letterSpacing: -2, lineHeight: 60 },
  balanceCurr: { fontSize: 24, fontWeight: '700', color: C.text2 },
  balanceNote: { fontSize: 11, color: C.text4, marginTop: 6, marginBottom: 4, textAlign: 'center' },
  balanceDate: { fontSize: 13, color: C.text3, marginTop: 8 },
  deficitNote: {
    marginTop: 16, backgroundColor: 'rgba(248,113,113,0.08)',
    borderRadius: 12, borderWidth: 1, borderColor: 'rgba(248,113,113,0.25)', padding: 12,
  },
  deficitNoteText: { fontSize: 12, color: C.error, lineHeight: 18 },
  emptyNote: { fontSize: 13, color: C.text4, marginTop: 14 },
  payoutsSection: {
    width: '100%', marginBottom: 14,
    backgroundColor: C.card, borderRadius: 20,
    borderWidth: 1, borderColor: C.cardBorder, padding: 20,
  },
  payoutsTitle: { fontSize: 10, fontWeight: '800', color: C.text3, letterSpacing: 2.5, marginBottom: 14 },
  payoutRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.cardBorder,
  },
  payoutDate: { fontSize: 14, color: C.text1, fontWeight: '600' },
  payoutStatus: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  payoutAmount: { fontSize: 16, fontWeight: '800', color: C.text1 },
  dashboardBtn: {
    borderRadius: 18, borderWidth: 1.5, borderColor: C.cardBorderActive,
    backgroundColor: C.primaryFaint, padding: 18, marginBottom: 16,
  },
  dashboardBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dashboardBtnLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  dashboardBtnIcon: { fontSize: 26 },
  dashboardBtnText: { color: C.primaryLight, fontSize: 16, fontWeight: '800' },
  dashboardBtnSub: { color: C.text3, fontSize: 12, marginTop: 2 },
  dashboardBtnArrow: { fontSize: 20, color: C.primaryLight, fontWeight: '700' },
  errorBox: { alignItems: 'center', marginTop: 80, paddingHorizontal: 24 },
  errorBoxText: { color: C.error, fontSize: 14, textAlign: 'center', marginBottom: 16, lineHeight: 20 },
  retryBtn2: { paddingVertical: 10, paddingHorizontal: 24, borderRadius: 12, borderWidth: 1, borderColor: C.cardBorder },
  retryBtn2Text: { color: C.primaryLight, fontWeight: '700' },
  legalBox: {
    backgroundColor: C.card, borderRadius: 14,
    borderWidth: 1, borderColor: C.cardBorder, padding: 16,
  },
  legalText: { fontSize: 11, color: C.text3, lineHeight: 18, textAlign: 'center' },
});
