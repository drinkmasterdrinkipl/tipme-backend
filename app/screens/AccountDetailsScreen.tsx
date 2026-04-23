import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
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

      const year = new Date().getFullYear();
      const res = await apiFetch(`${API_URL}/api/payouts-annual/${accountId}?year=${year}`);
      if (!res.ok) throw new Error('Błąd serwera');
      const json = await res.json();
      const payouts: any[] = json.payouts || [];

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
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, Arial, sans-serif; color: #1a1a1a; padding: 40px; }
    .header { text-align: center; margin-bottom: 36px; }
    .logo { font-size: 28px; font-weight: 900; color: #9333ea; letter-spacing: -0.5px; margin-bottom: 4px; }
    .subtitle { font-size: 13px; color: #666; }
    .meta { background: #f8f5ff; border: 1px solid #e9d5ff; border-radius: 12px; padding: 18px 24px; margin-bottom: 28px; }
    .meta-row { display: flex; justify-content: space-between; font-size: 13px; padding: 4px 0; }
    .meta-label { color: #666; }
    .meta-value { font-weight: 700; color: #1a1a1a; }
    h2 { font-size: 11px; font-weight: 800; letter-spacing: 2px; color: #666; margin-bottom: 12px; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; }
    th { font-size: 11px; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: 1px; padding: 10px 14px; border-bottom: 2px solid #e5e7eb; text-align: left; }
    th:last-child { text-align: right; }
    td { padding: 12px 14px; border-bottom: 1px solid #f3f4f6; font-size: 14px; color: #1a1a1a; }
    tr:last-child td { border-bottom: none; }
    .total-row { background: #f8f5ff; border-top: 2px solid #9333ea; }
    .total-row td { font-size: 15px; font-weight: 900; color: #9333ea; padding: 16px 14px; }
    .footer { margin-top: 36px; text-align: center; font-size: 11px; color: #aaa; line-height: 1.8; }
    .note { margin-top: 20px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px; font-size: 12px; color: #555; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">Tip For Me</div>
    <div class="subtitle">Roczne zestawienie wypłat na konto bankowe</div>
  </div>

  <div class="meta">
    <div class="meta-row"><span class="meta-label">Konto</span><span class="meta-value">${email}</span></div>
    <div class="meta-row"><span class="meta-label">Rok rozliczeniowy</span><span class="meta-value">${year}</span></div>
    <div class="meta-row"><span class="meta-label">Wygenerowano</span><span class="meta-value">${generatedAt}</span></div>
    <div class="meta-row"><span class="meta-label">Liczba wypłat</span><span class="meta-value">${paid.length}</span></div>
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
      <tr class="total-row">
        <td colspan="2">ŁĄCZNIE WYPŁACONO W ${year} ROKU</td>
        <td style="text-align:right">${total.toFixed(2)} zł</td>
      </tr>
    </tbody>
  </table>

  <div class="note">
    Zestawienie obejmuje wyłącznie środki faktycznie wysłane na konto bankowe w roku ${year}.
    Kwoty po potrąceniu prowizji platformy. Dokument wygenerowany automatycznie przez aplikację Tip For Me.
  </div>

  <div class="footer">
    Tip For Me · tipforme.app · Obsługiwane przez Stripe Payments Europe Ltd.
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
