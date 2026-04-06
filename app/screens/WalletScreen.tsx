import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, RefreshControl, ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { API_URL, apiFetch } from '../config';
import { C } from '../theme';

export default function WalletScreen() {
  const navigation = useNavigation<any>();
  const [available, setAvailable] = useState<number | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [payouts, setPayouts] = useState<any[]>([]);

  const loadBalance = useCallback(async () => {
    try {
      const accountId = await AsyncStorage.getItem('stripeAccountId');
      if (!accountId) throw new Error('Brak ID konta. Zaloguj się ponownie.');
      const [balRes, payoutsRes] = await Promise.all([
        apiFetch(`${API_URL}/api/balance/${accountId}`),
        apiFetch(`${API_URL}/api/payouts/${accountId}`),
      ]);
      const balData = await balRes.json();
      const payoutsData = await payoutsRes.json();
      if (balData.error) throw new Error(balData.error);
      setAvailable(balData.available);
      setPending(balData.pending);
      setPayouts(payoutsData.payouts || []);
    } catch {
      setAvailable(0);
      setPending(0);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadBalance(); }, [loadBalance]);

  const onRefresh = () => { setRefreshing(true); loadBalance(); };

  const handlePayout = async () => {
    if (!available || available < 2) {
      Alert.alert('Brak środków', 'Minimalna kwota wypłaty to 2 zł.');
      return;
    }
    Alert.alert(
      'Wypłata',
      `Wypłacić ${available.toFixed(2)} zł na konto bankowe?\n\nŚrodki pojawią się w ciągu 1-2 dni roboczych.`,
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Wypłać',
          onPress: async () => {
            setPayoutLoading(true);
            try {
              const accountId = await AsyncStorage.getItem('stripeAccountId');
              if (!accountId) throw new Error('Brak ID konta. Zaloguj się ponownie.');
              const res = await apiFetch(`${API_URL}/api/payout/${accountId}`, {
                method: 'POST',
                body: JSON.stringify({ amount: null }),
              });
              const data = await res.json();
              if (data.error) throw new Error(data.error);
              const arrival = new Date(data.arrivalDate).toLocaleDateString('pl-PL');
              Alert.alert('Zlecono wypłatę', `${data.amount.toFixed(2)} zł trafi na konto do ${arrival}.`);
              loadBalance();
            } catch (err: any) {
              Alert.alert('Błąd', err.message || 'Nie udało się zlecić wypłaty');
            } finally {
              setPayoutLoading(false);
            }
          },
        },
      ]
    );
  };

  const openDashboard = async () => {
    try {
      const accountId = await AsyncStorage.getItem('stripeAccountId');
      if (!accountId) throw new Error('Brak ID konta. Zaloguj się ponownie.');

      const res = await apiFetch(`${API_URL}/api/dashboard-link/${accountId}`);
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `Błąd serwera (${res.status})`);
      if (!data.url) throw new Error('Serwer nie zwrócił linku');

      // Otwórz w WebView wewnątrz aplikacji
      navigation.navigate('StripeWebView', { url: data.url });
    } catch (err: any) {
      Alert.alert('Błąd', err.message || 'Nie udało się otworzyć panelu Stripe');
    }
  };

  return (
    <SafeAreaView style={s.root}>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primaryLight} />}
      >
        <View style={s.header}>
          <Text style={s.title}>Portfel</Text>
          <Text style={s.sub}>Twoje napiwki Stripe</Text>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={C.primary} style={{ marginTop: 60 }} />
        ) : (
          <>
            {/* Saldo dostępne */}
            <View style={s.balanceCard}>
              <Text style={s.balanceLabel}>DOSTĘPNE DO WYPŁATY</Text>
              <Text style={s.balanceAmount}>
                {available?.toFixed(2)}
                <Text style={s.balanceCurr}> zł</Text>
              </Text>
              {(pending ?? 0) > 0 && (
                <>
                  <View style={s.divider} />
                  <View style={s.pendingRow}>
                    <Text style={s.pendingLabel}>Oczekujące</Text>
                    <Text style={s.pendingValue}>{pending?.toFixed(2)} zł</Text>
                  </View>
                </>
              )}
            </View>

            {/* Info o oczekujących */}
            {(pending ?? 0) > 0 && (
              <View style={s.infoBox}>
                <Text style={s.infoText}>
                  Oczekujące środki ({pending?.toFixed(2)} zł) pojawią się jako dostępne po rozliczeniu przez Stripe (zwykle 2 dni robocze).
                </Text>
              </View>
            )}

            {/* Przycisk wypłaty */}
            <TouchableOpacity
              style={[s.payoutBtn, ((available ?? 0) < 2 || payoutLoading) && s.payoutBtnDisabled]}
              onPress={handlePayout}
              disabled={(available ?? 0) < 2 || payoutLoading}
              activeOpacity={0.85}
            >
              {payoutLoading ? (
                <ActivityIndicator color={C.white} />
              ) : (
                <>
                  <Text style={s.payoutBtnText}>Wypłać na konto bankowe</Text>
                  <Text style={s.payoutBtnSub}>
                    {(available ?? 0) < 2 ? 'Brak środków do wypłaty' : '1–2 dni robocze'}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            {/* Historia wypłat */}
            {payouts.length > 0 && (
              <View style={s.payoutsSection}>
                <Text style={s.payoutsTitle}>Historia wypłat</Text>
                {payouts.map(p => {
                  const statusColor = p.status === 'paid' ? C.success ?? '#22c55e' : p.status === 'failed' ? C.error : C.gold;
                  const statusLabel = p.status === 'paid' ? 'Wypłacono' : p.status === 'failed' ? 'Błąd' : 'W toku';
                  const date = new Date(p.arrivalDate).toLocaleDateString('pl-PL');
                  return (
                    <View key={p.id} style={s.payoutRow}>
                      <View>
                        <Text style={s.payoutDate}>{date}</Text>
                        <Text style={[s.payoutStatus, { color: statusColor }]}>{statusLabel}</Text>
                      </View>
                      <Text style={s.payoutAmount}>+{p.amount.toFixed(2)} zł</Text>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Szczegóły konta */}
            <TouchableOpacity style={s.dashboardBtn} onPress={() => navigation.navigate('AccountDetails')} activeOpacity={0.8}>
              <View style={s.dashboardBtnInner}>
                <Text style={s.dashboardBtnText}>Szczegóły konta</Text>
                <Text style={s.dashboardBtnSub}>Konto bankowe, status weryfikacji →</Text>
              </View>
            </TouchableOpacity>

            {/* Informacja prawna */}
            <View style={s.legalBox}>
              <Text style={s.legalText}>
                Płatności obsługuje Stripe Payments Europe Ltd. (licencja instytucji pieniądza elektronicznego UE). Napiwki trafiają bezpośrednio na Twoje konto — Tip For Me nie przechowuje Twoich środków.
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
  header: { paddingTop: 16, paddingBottom: 28 },
  title: { fontSize: 28, fontWeight: '900', color: C.text1, letterSpacing: -0.5 },
  sub: { fontSize: 13, color: C.text3, marginTop: 4, fontWeight: '500' },
  balanceCard: {
    backgroundColor: C.card, borderRadius: 24,
    borderWidth: 1, borderColor: C.cardBorder,
    padding: 28, marginBottom: 16,
    alignItems: 'center',
  },
  balanceLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 2.5, color: C.text3, marginBottom: 10 },
  balanceAmount: { fontSize: 56, fontWeight: '900', color: C.text1, letterSpacing: -2, lineHeight: 60 },
  balanceCurr: { fontSize: 24, fontWeight: '700', color: C.text2 },
  divider: { width: '100%', height: 1, backgroundColor: C.cardBorder, marginVertical: 18 },
  pendingRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
  pendingLabel: { fontSize: 13, color: C.text3, fontWeight: '500' },
  pendingValue: { fontSize: 13, color: C.text2, fontWeight: '700' },
  infoBox: {
    backgroundColor: 'rgba(245,158,11,0.07)', borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.15)',
    padding: 14, marginBottom: 16,
  },
  infoText: { fontSize: 12, color: C.gold, lineHeight: 18 },
  payoutBtn: {
    paddingVertical: 20, borderRadius: 22,
    backgroundColor: C.primary, alignItems: 'center',
    shadowColor: C.primary, shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4, shadowRadius: 28, marginBottom: 14,
  },
  payoutBtnDisabled: { backgroundColor: C.text4, shadowOpacity: 0 },
  payoutBtnText: { color: C.white, fontSize: 16, fontWeight: '800' },
  payoutBtnSub: { color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 3 },
  payoutsSection: {
    width: '100%', marginBottom: 14,
    backgroundColor: C.card, borderRadius: 20,
    borderWidth: 1, borderColor: C.cardBorder, padding: 20,
  },
  payoutsTitle: { fontSize: 13, fontWeight: '800', color: C.text2, letterSpacing: 1.5, marginBottom: 14 },
  payoutRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.cardBorder,
  },
  payoutDate: { fontSize: 14, color: C.text1, fontWeight: '600' },
  payoutStatus: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  payoutAmount: { fontSize: 16, fontWeight: '800', color: C.text1 },
  dashboardBtn: {
    borderRadius: 18, borderWidth: 1, borderColor: C.cardBorder,
    backgroundColor: C.card, padding: 18, marginBottom: 24,
  },
  dashboardBtnInner: { alignItems: 'center' },
  dashboardBtnText: { color: C.primaryLight, fontSize: 15, fontWeight: '700' },
  dashboardBtnSub: { color: C.text3, fontSize: 12, marginTop: 4 },
  legalBox: {
    backgroundColor: C.card, borderRadius: 14,
    borderWidth: 1, borderColor: C.cardBorder, padding: 16,
  },
  legalText: { fontSize: 11, color: C.text3, lineHeight: 18, textAlign: 'center' },
});
