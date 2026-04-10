import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { API_URL, apiFetch } from '../config';
import { C } from '../theme';

export default function AccountDetailsScreen() {
  const navigation = useNavigation<any>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const accountId = await AsyncStorage.getItem('stripeAccountId');
      if (!accountId) throw new Error('Brak ID konta. Zaloguj się ponownie.');
      const res = await apiFetch(`${API_URL}/api/account-details/${accountId}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (e: any) {
      setError(e.message || 'Nie udało się pobrać danych konta');
    } finally {
      setLoading(false);
    }
  };

  const Row = ({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) => (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={[s.rowValue, valueColor ? { color: valueColor } : {}]}>{value}</Text>
    </View>
  );

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
                value={data.detailsSubmitted ? '✓ Ukończona' : '✗ Nieukończona'}
                valueColor={data.detailsSubmitted ? '#22c55e' : C.gold}
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

            {!data.detailsSubmitted && (
              <TouchableOpacity
                style={s.completeBtn}
                onPress={async () => {
                  try {
                    const accountId = await AsyncStorage.getItem('stripeAccountId');
                    if (!accountId) throw new Error('Brak ID konta. Zaloguj się ponownie.');
                    const res = await apiFetch(`${API_URL}/api/dashboard-link/${accountId}`);
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
  completeBtn: {
    backgroundColor: C.primary, borderRadius: 18,
    paddingVertical: 18, alignItems: 'center',
    shadowColor: C.primary, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3, shadowRadius: 20,
  },
  completeBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
