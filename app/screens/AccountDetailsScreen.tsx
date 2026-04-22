import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, ScrollView, Alert, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { API_URL, apiFetch } from '../config';
import { C } from '../theme';

// Poza komponentem — zapobiega re-tworzeniu przy każdym renderze
const Row = ({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) => (
  <View style={s.row}>
    <Text style={s.rowLabel}>{label}</Text>
    <Text style={[s.rowValue, valueColor ? { color: valueColor } : {}]}>{value}</Text>
  </View>
);

export default function AccountDetailsScreen() {
  const navigation = useNavigation<any>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const mountedRef = useRef(true);

  const exportStatement = useCallback(async () => {
    setExporting(true);
    try {
      const accountId = await AsyncStorage.getItem('stripeAccountId');
      const email = await AsyncStorage.getItem('userEmail') ?? '';
      if (!accountId) throw new Error('Brak ID konta');

      const res = await apiFetch(`${API_URL}/api/payouts/${accountId}`);
      if (!res.ok) throw new Error('Błąd serwera');
      const json = await res.json();
      const payouts: any[] = json.payouts || [];

      if (payouts.length === 0) {
        Alert.alert('Brak danych', 'Nie masz jeszcze żadnych wypłat do wyeksportowania.');
        return;
      }

      const now = new Date().toLocaleDateString('pl-PL');
      const paid = payouts.filter(p => p.status === 'paid');
      const total = paid.reduce((sum, p) => sum + (p.amount ?? 0), 0);
      const separator = '─────────────────────────────';

      const rows = payouts.map(p => {
        const date = new Date((p.arrivalDate ?? p.arrival_date) * 1000).toLocaleDateString('pl-PL');
        const statusLabel = p.status === 'paid' ? '✓ Wysłano na konto' : p.status === 'failed' ? '✗ Błąd' : '⏳ W toku';
        const amount = (p.amount ?? 0).toFixed(2);
        return `${date}   ${statusLabel}\n  Kwota: ${amount} zł`;
      }).join('\n\n');

      const text = [
        '💜 TIP FOR ME — ZESTAWIENIE WYPŁAT',
        separator,
        `Konto: ${email}`,
        `Wygenerowano: ${now}`,
        separator,
        '',
        rows,
        '',
        separator,
        `ŁĄCZNIE WYSŁANO NA KONTO: ${total.toFixed(2)} zł`,
        separator,
        '',
        'Kwoty faktycznie wysłane na konto bankowe.',
        '',
        'Tip For Me · tipforme.app',
      ].join('\n');

      await Share.share({ message: text, title: 'Zestawienie wypłat — Tip For Me' });
    } catch (e: any) {
      Alert.alert('Błąd', 'Nie udało się wygenerować zestawienia.');
    } finally {
      if (mountedRef.current) setExporting(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => { mountedRef.current = false; };
  }, []);

  const load = async () => {
    if (mountedRef.current) { setLoading(true); setError(''); }
    try {
      const accountId = await AsyncStorage.getItem('stripeAccountId');
      if (!accountId) throw new Error('Brak ID konta. Zaloguj się ponownie.');
      const res = await apiFetch(`${API_URL}/api/account-details/${accountId}`);
      if (!res.ok) throw new Error(`Błąd serwera (${res.status})`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      if (mountedRef.current) setData(json);
    } catch (e: any) {
      if (mountedRef.current) setError(e.message || 'Nie udało się pobrać danych konta');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  return (
    <SafeAreaView style={s.root}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Text style={s.backTxt}>←</Text>
        </TouchableOpacity>
        <Text style={s.title}>Szczegóły konta</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator size="large" color={C.primary} style={{ marginTop: 60 }} />
        ) : error ? (
          <View style={s.errorWrap}>
            <Text style={s.errorTxt}>{error}</Text>
            <TouchableOpacity style={s.retryBtn} onPress={load}>
              <Text style={s.retryTxt}>Spróbuj ponownie</Text>
            </TouchableOpacity>
          </View>
        ) : data ? (
          <>
            {/* Status konta */}
            <View style={s.card}>
              <Text style={s.cardTitle}>STATUS KONTA</Text>
              <Row
                label="Płatności"
                value={data.chargesEnabled ? '✓ Aktywne' : '✗ Nieaktywne'}
                valueColor={data.chargesEnabled ? '#22c55e' : C.error}
              />
              <Row
                label="Wypłaty"
                value={data.payoutsEnabled ? '✓ Aktywne' : '✗ Nieaktywne'}
                valueColor={data.payoutsEnabled ? '#22c55e' : C.error}
              />
              <Row
                label="Weryfikacja"
                value={
                  data.chargesEnabled ? '✓ Zweryfikowane' :
                  data.detailsSubmitted ? '⏳ W trakcie weryfikacji' :
                  '✗ Nieukończona'
                }
                valueColor={
                  data.chargesEnabled ? '#22c55e' :
                  data.detailsSubmitted ? '#f59e0b' :
                  C.error
                }
              />
            </View>

            {/* Dane kontaktowe */}
            <View style={s.card}>
              <Text style={s.cardTitle}>DANE KONTAKTOWE</Text>
              <Row label="Email" value={data.email || '—'} />
            </View>

            {/* Konto bankowe */}
            <View style={s.card}>
              <Text style={s.cardTitle}>KONTO BANKOWE</Text>
              {data.bankAccount ? (
                <>
                  <Row label="Bank" value={data.bankAccount.bankName} />
                  <Row label="Numer konta" value={`•••• •••• •••• ${data.bankAccount.last4}`} />
                  <Row label="Waluta" value={data.bankAccount.currency} />
                </>
              ) : (
                <Text style={s.noBankTxt}>Brak podpiętego konta bankowego</Text>
              )}
            </View>

            <TouchableOpacity style={s.exportBtn} onPress={exportStatement} disabled={exporting}>
              {exporting
                ? <ActivityIndicator color="#22c55e" />
                : <Text style={s.exportBtnText}>📄 Pobierz zestawienie wypłat</Text>}
            </TouchableOpacity>

            {!data.detailsSubmitted && (
              <TouchableOpacity
                style={s.completeBtn}
                onPress={async () => {
                  try {
                    const accountId = await AsyncStorage.getItem('stripeAccountId');
                    if (!accountId) throw new Error('Brak ID konta. Zaloguj się ponownie.');
                    const res = await apiFetch(`${API_URL}/api/dashboard-link/${accountId}`);
                    if (!res.ok) throw new Error(`Błąd serwera (${res.status})`);
                    const json = await res.json();
                    if (json.url) navigation.navigate('StripeWebView', { url: json.url });
                  } catch {
                    Alert.alert('Błąd', 'Nie udało się otworzyć formularza');
                  }
                }}
              >
                <Text style={s.completeBtnTxt}>Dokończ konfigurację konta →</Text>
              </TouchableOpacity>
            )}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: C.cardBorder,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  backTxt: { color: C.text3, fontSize: 18 },
  title: { fontSize: 16, fontWeight: '800', color: C.text1 },
  scroll: { padding: 20, paddingBottom: 40 },
  card: {
    backgroundColor: C.card, borderRadius: 20,
    borderWidth: 1, borderColor: C.cardBorder,
    padding: 20, marginBottom: 16,
  },
  cardTitle: { fontSize: 10, fontWeight: '800', letterSpacing: 2, color: C.text3, marginBottom: 16 },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.cardBorder,
  },
  rowLabel: { fontSize: 14, color: C.text3, fontWeight: '500' },
  rowValue: { fontSize: 14, color: C.text1, fontWeight: '700' },
  noBankTxt: { fontSize: 14, color: C.text3, textAlign: 'center', paddingVertical: 8 },
  errorWrap: { alignItems: 'center', marginTop: 60 },
  errorTxt: { color: C.error, fontSize: 14, textAlign: 'center', marginBottom: 16 },
  retryBtn: {
    paddingVertical: 10, paddingHorizontal: 24,
    borderRadius: 12, borderWidth: 1, borderColor: C.cardBorder,
  },
  retryTxt: { color: C.primaryLight, fontWeight: '700' },
  exportBtn: {
    borderRadius: 18, borderWidth: 1.5, borderColor: 'rgba(34,197,94,0.3)',
    backgroundColor: 'rgba(34,197,94,0.07)', padding: 18,
    alignItems: 'center', marginBottom: 12,
  },
  exportBtnText: { color: '#22c55e', fontSize: 15, fontWeight: '800' },
  completeBtn: {
    backgroundColor: C.primary, borderRadius: 18,
    paddingVertical: 18, alignItems: 'center',
    shadowColor: C.primary, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3, shadowRadius: 20,
  },
  completeBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
