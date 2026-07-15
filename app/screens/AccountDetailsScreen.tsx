import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { API_URL, apiFetch } from '../config';
import { C } from '../theme';
import type { RootStackParamList, AccountDetailsResponse, PayoutItem } from '../types';

// Poza komponentem — zapobiega re-tworzeniu przy każdym renderze
const Row = ({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) => (
  <View style={s.row}>
    <Text style={s.rowLabel}>{label}</Text>
    <Text style={[s.rowValue, valueColor ? { color: valueColor } : {}]}>{value}</Text>
  </View>
);

export default function AccountDetailsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [data, setData] = useState<AccountDetailsResponse | null>(null);
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

      const year = new Date().getFullYear();
      const res = await apiFetch(`${API_URL}/api/payouts-annual/${accountId}?year=${year}`);
      if (!res.ok) throw new Error('Błąd serwera');
      const json: { payouts: PayoutItem[] } = await res.json();
      const payouts: PayoutItem[] = json.payouts || [];

      if (payouts.length === 0) {
        Alert.alert('Brak danych', `Nie masz jeszcze żadnych wypłat w ${year} roku.`);
        return;
      }

      const generatedAt = new Date().toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const paid = payouts.filter(p => p.status === 'paid');
      const total = paid.reduce((sum, p) => sum + (p.amount ?? 0), 0);

      const rows = payouts.map(p => {
        const date = new Date((p.arrivalDate ?? p.arrival_date) * 1000).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const statusLabel = p.status === 'paid' ? '✓ Wypłacono' : p.status === 'failed' ? '✗ Błąd' : '⏳ W toku';
        const statusColor = p.status === 'paid' ? '#16a34a' : p.status === 'failed' ? '#dc2626' : '#d97706';
        const amount = (p.amount ?? 0).toFixed(2);
        return `
          <tr>
            <td>${date}</td>
            <td style="color:${statusColor};font-weight:700">${statusLabel}</td>
            <td style="text-align:right;font-weight:700">+${amount} zł</td>
          </tr>`;
      }).join('');

      const html = `
<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: -apple-system, Arial, sans-serif; color: #1a1424; background: #fff; }
    .band { background: linear-gradient(120deg, #7c3aed, #a855f7); padding: 32px 44px 38px; color: #fff; }
    .brandrow { display: flex; align-items: center; gap: 14px; }
    .brandlogo { width: 54px; height: 54px; display: block; flex: 0 0 auto; }
    .band .logo { font-size: 27px; font-weight: 900; letter-spacing: -0.5px; }
    .band .subtitle { font-size: 13px; opacity: 0.92; margin-top: 4px; }
    .wrap { padding: 0 44px 44px; }
    .hero { background: #f6f2ff; border: 1px solid #e6ddff; border-radius: 16px; padding: 24px 28px; margin: -22px 0 28px; }
    .hero .lbl { font-size: 11px; color: #7c6f97; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 700; }
    .hero .big { font-size: 42px; font-weight: 900; color: #7c3aed; letter-spacing: -1px; margin-top: 8px; line-height: 1; }
    .hero .cnt { font-size: 13px; color: #8a85a4; margin-top: 8px; }
    .meta { display: flex; flex-wrap: wrap; gap: 6px 40px; margin-bottom: 28px; font-size: 12.5px; }
    .meta .row { display: flex; gap: 8px; }
    .meta .l { color: #8a8598; }
    .meta .v { font-weight: 700; color: #1a1424; }
    h2 { font-size: 11px; font-weight: 800; letter-spacing: 2px; color: #8a8598; margin-bottom: 12px; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; }
    th { font-size: 10px; font-weight: 700; color: #a09ab5; text-transform: uppercase; letter-spacing: 1px; padding: 10px 14px; border-bottom: 2px solid #ece8f4; text-align: left; }
    th:last-child { text-align: right; }
    td { padding: 13px 14px; border-bottom: 1px solid #f4f2f9; font-size: 14px; color: #1a1424; }
    tr:last-child td { border-bottom: none; }
    .note { margin-top: 26px; background: #faf9fc; border: 1px solid #eeecf4; border-radius: 10px; padding: 14px 16px; font-size: 11.5px; color: #6b6678; line-height: 1.6; }
    .footer { margin-top: 22px; text-align: center; font-size: 10.5px; color: #b0abc0; line-height: 1.8; }
  </style>
</head>
<body>
  <div class="band">
    <div class="brandrow">
      <img class="brandlogo" src="https://tipforme.app/logo.png" alt="">
      <div>
        <div class="logo">Tip For Me</div>
        <div class="subtitle">Roczne zestawienie wypłat na konto bankowe</div>
      </div>
    </div>
  </div>
  <div class="wrap">
    <div class="hero">
      <div class="lbl">Łącznie wypłacono w ${year} roku</div>
      <div class="big">${total.toFixed(2)} zł</div>
      <div class="cnt">${paid.length} wypłat na konto bankowe</div>
    </div>

    <div class="meta">
      <div class="row"><span class="l">Konto:</span><span class="v">${email}</span></div>
      <div class="row"><span class="l">Rok:</span><span class="v">${year}</span></div>
      <div class="row"><span class="l">Wygenerowano:</span><span class="v">${generatedAt}</span></div>
    </div>

    <h2>Wypłaty na konto bankowe</h2>
    <table>
      <thead>
        <tr>
          <th>Data wpływu</th>
          <th>Status</th>
          <th style="text-align:right">Kwota</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>

    <div class="note">
      Zestawienie obejmuje wyłącznie środki faktycznie wysłane na konto bankowe w roku ${year}.
      Kwoty po potrąceniu prowizji platformy. Dokument wygenerowany automatycznie przez aplikację Tip For Me.
    </div>

    <div class="footer">
      Tip For Me · tipforme.app · Obsługiwane przez Stripe Payments Europe Ltd.
    </div>
  </div>
</body>
</html>`;

      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const filename = `Zestawienie-wyplat-${year}-TipForMe.pdf`;
      const dest = FileSystem.documentDirectory + filename;
      await FileSystem.moveAsync({ from: uri, to: dest });
      await Sharing.shareAsync(dest, {
        mimeType: 'application/pdf',
        dialogTitle: `Zestawienie wypłat ${year} — Tip For Me`,
        UTI: 'com.adobe.pdf',
      });
    } catch (e: any) {
      Alert.alert('Błąd', e?.message || 'Nie udało się wygenerować zestawienia.');
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
                : <Text style={s.exportBtnText}>📄 Pobierz roczne zestawienie wypłat ({new Date().getFullYear()})</Text>}
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
