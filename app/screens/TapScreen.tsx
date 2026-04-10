import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useStripeTerminal, ErrorCode } from '@stripe/stripe-terminal-react-native';
import type { Reader } from '@stripe/stripe-terminal-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL, apiFetch } from '../config';
import { C } from '../theme';

// Statyczne cząsteczki w tle
const PARTICLES = [
  { top: 28, left: 30, size: 2, op: 0.6 },
  { top: 40, left: 80, size: 1.5, op: 0.4 },
  { top: 35, left: 140, size: 2.5, op: 0.7 },
  { top: 55, left: 200, size: 1.5, op: 0.5 },
  { top: 30, left: 260, size: 2, op: 0.6 },
  { top: 70, left: 50, size: 1.5, op: 0.3 },
  { top: 80, left: 110, size: 2, op: 0.5 },
  { top: 65, left: 170, size: 1, op: 0.4 },
  { top: 90, left: 230, size: 2.5, op: 0.6 },
  { top: 100, left: 20, size: 2, op: 0.5 },
  { top: 110, left: 90, size: 1.5, op: 0.3 },
  { top: 120, left: 150, size: 2, op: 0.7 },
  { top: 95, left: 290, size: 1.5, op: 0.4 },
  { top: 140, left: 60, size: 2, op: 0.5 },
  { top: 130, left: 200, size: 1, op: 0.6 },
  { top: 150, left: 330, size: 2, op: 0.3 },
  { top: 45, left: 310, size: 1.5, op: 0.5 },
  { top: 75, left: 350, size: 2, op: 0.4 },
  { top: 115, left: 120, size: 1, op: 0.6 },
  { top: 160, left: 250, size: 1.5, op: 0.4 },
];

const SIMULATED = false;

export default function TapScreen({ navigation, route }: any) {
  const amount: number = route.params?.amount ?? 0;
  const amountZl = (amount / 100 % 1 === 0)
    ? (amount / 100).toFixed(0)
    : (amount / 100).toFixed(2);

  const [status, setStatus] = useState<'connecting' | 'ready' | 'processing' | 'error'>('connecting');
  const [errorMsg, setErrorMsg] = useState('');
  const [initProgress, setInitProgress] = useState(0);
  const [initStep, setInitStep] = useState('Inicjalizacja SDK...');
  const discoveredRef = useRef<Reader.Type[]>([]);


  const {
    discoverReaders, connectReader, disconnectReader,
    collectPaymentMethod, confirmPaymentIntent, retrievePaymentIntent,
  } = useStripeTerminal({
    onUpdateDiscoveredReaders: (readers) => { discoveredRef.current = readers; },
  });

  const statusRef = useRef(status);
  useEffect(() => { statusRef.current = status; }, [status]);

  useEffect(() => {
    if (!amount || amount <= 0) { navigation.goBack(); return; }
    initializeReader();
    return () => {
      // Nie rozłączaj podczas aktywnej transakcji — przerwałoby płatność
      if (statusRef.current !== 'processing') {
        disconnectReader().catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    if (status === 'ready') processPayment();
  }, [status]);

  const translateError = (msg: string): string => {
    if (!msg) return 'Nieznany błąd';
    if (msg.includes('Already connected')) return 'Czytnik już połączony. Trwa rozłączanie, spróbuj ponownie.';
    if (msg.includes('Network request failed') || msg.includes('network')) return 'Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie.';
    if (msg.includes('timed out') || msg.includes('timeout') || msg.includes('Przekroczono czas')) return 'Przekroczono czas oczekiwania. Spróbuj ponownie.';
    if (msg.includes('canceled') || msg.includes('Canceled')) return 'Płatność anulowana.';
    if (msg.includes('declined')) return 'Karta odrzucona. Spróbuj inną kartą.';
    if (msg.includes('insufficient_funds')) return 'Niewystarczające środki na karcie.';
    if (msg.includes('No reader')) return 'Nie znaleziono czytnika.';
    if (msg.includes('location')) return 'Brak lokalizacji Stripe. Wyloguj się i zaloguj ponownie.';
    if (msg.includes('server') || msg.includes('Server') || msg.includes('500') || msg.includes('503')) return 'Błąd serwera. Spróbuj za chwilę.';
    return msg;
  };

  const initializeReader = async () => {
    try {
      setStatus('connecting');
      setInitProgress(0);

      if (SIMULATED) {
        setInitStep('Szukanie czytnika...');
        setInitProgress(35);
        await new Promise(r => setTimeout(r, 800));
        setInitStep('Wykrywanie urządzenia...');
        setInitProgress(60);
        await new Promise(r => setTimeout(r, 600));
        setInitStep('Łączenie...');
        setInitProgress(80);
        await new Promise(r => setTimeout(r, 600));
        setInitProgress(100);
        await new Promise(r => setTimeout(r, 300));
        setStatus('ready');
        return;
      }

      // Rozłącz poprzednią sesję, jeśli istnieje
      await disconnectReader().catch(() => {});

      discoveredRef.current = [];
      setInitStep('Szukanie czytnika...');
      setInitProgress(35);
      const { error: discoverError } = await discoverReaders({ discoveryMethod: 'tapToPay', simulated: false });
      if (discoverError) throw new Error(discoverError.message);

      setInitStep('Wykrywanie urządzenia...');
      setInitProgress(60);

      let waited = 0;
      while (discoveredRef.current.length === 0 && waited < 15000) {
        await new Promise(r => setTimeout(r, 300));
        waited += 300;
      }

      const readers = discoveredRef.current;
      if (!readers || readers.length === 0) throw new Error('Nie znaleziono czytnika NFC.');

      setInitStep('Łączenie...');
      setInitProgress(80);
      const locationId = await AsyncStorage.getItem('stripeLocationId');
      if (!locationId) throw new Error('Brak lokalizacji Stripe. Wyloguj się i zaloguj ponownie.');
      const { error: connectError } = await connectReader({ discoveryMethod: 'tapToPay', reader: readers[0], locationId });
      if (connectError) throw new Error(connectError.message);

      setInitProgress(100);
      await new Promise(r => setTimeout(r, 300));
      setStatus('ready');
    } catch (error: any) {
      setStatus('error');
      setErrorMsg(translateError(error.message || ''));
    }
  };

  const processPayment = async () => {
    try {
      setStatus('processing');

      if (SIMULATED) {
        await new Promise(r => setTimeout(r, 2500));
        navigation.replace('Success', {
          amount: amountZl,
          paymentMethod: 'Visa',
          last4: '4242',
        });
        return;
      }

      const accountId = await AsyncStorage.getItem('stripeAccountId');
      if (!accountId) throw new Error('Brak ID konta. Zaloguj się ponownie.');

      const idempotencyKey = `tip-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
      const controller = new AbortController();
      const fetchTimeout = setTimeout(() => controller.abort(), 10000);

      let clientSecret: string;
      try {
        const res = await apiFetch(`${API_URL}/api/create-payment-intent`, {
          method: 'POST',
          body: JSON.stringify({ amount, stripeAccountId: accountId }),
          headers: { 'Idempotency-Key': idempotencyKey },
          signal: controller.signal,
        });
        clearTimeout(fetchTimeout);
        if (!res.ok) throw new Error(`Błąd serwera (${res.status})`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        clientSecret = data.clientSecret;
      } catch (error: any) {
        clearTimeout(fetchTimeout);
        if (error.name === 'AbortError') throw new Error('Przekroczono czas oczekiwania');
        throw error;
      }

      const { paymentIntent: retrievedPI, error: retrieveError } = await retrievePaymentIntent(clientSecret!);
      if (retrieveError) throw new Error(retrieveError.message);

      const { paymentIntent: collectedPI, error: collectError } = await collectPaymentMethod({ paymentIntent: retrievedPI! });
      if (collectError) {
        if (collectError.code === ErrorCode.CANCELED) { navigation.goBack(); return; }
        throw new Error(collectError.message);
      }

      const { paymentIntent: confirmedPI, error: confirmError } = await confirmPaymentIntent({ paymentIntent: collectedPI! });
      if (confirmError) throw new Error(confirmError.message);

      const charge = confirmedPI?.charges?.[0];
      const details = charge?.paymentMethodDetails?.cardPresentDetails;

      navigation.replace('Success', {
        amount: amountZl,
        paymentMethod: details?.brand ?? 'Karta',
        last4: details?.last4 ?? '****',
      });
    } catch (error: any) {
      setStatus('error');
      setErrorMsg(translateError(error.message || ''));
    }
  };

  return (
    <SafeAreaView style={s.root}>

      {/* Góra — przycisk powrotu + merchant */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.back} onPress={() => navigation.goBack()}>
          <Text style={s.backIcon}>←</Text>
        </TouchableOpacity>
        <View style={s.merchantHeader}>
          <Text style={s.merchantName}>Tip For Me</Text>
          <View style={s.verifiedBadge}>
            <View style={s.verifiedDot} />
            <Text style={s.verifiedText}>Zweryfikowany odbiorca</Text>
          </View>
        </View>
      </View>

      {/* Środek — kwota + status */}
      <View style={s.center}>
        <View style={s.amountBlock}>
          <Text style={s.amountLabel}>DO ZAPŁATY</Text>
          <Text style={s.amountValue}>{amountZl}<Text style={s.amountCurr}> zł</Text></Text>
        </View>

        {status === 'connecting' && (
          <>
            <View style={s.progressBar}>
              <View style={[s.progressFill, { width: `${initProgress}%` as any }]} />
            </View>
            <View style={s.connectRow}>
              <ActivityIndicator size="small" color={C.text3} />
              <Text style={s.connectText}>{initStep}</Text>
            </View>
          </>
        )}
        {status === 'processing' && (
          <View style={s.statusPill}>
            <ActivityIndicator size="small" color={C.primaryLight} style={{ marginRight: 8 }} />
            <Text style={s.statusPillText}>Oczekiwanie na płatność...</Text>
          </View>
        )}
        {status === 'error' && (
          <>
            <View style={s.errorPill}>
              <Text style={s.errorPillText}>{errorMsg}</Text>
            </View>
            <TouchableOpacity style={s.retryBtn} onPress={initializeReader}>
              <Text style={s.retryText}>Spróbuj ponownie</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Dół — metody płatności */}
      <View style={s.infoSection}>
        <View style={s.infoSectionDivider} />
        <Text style={s.infoSectionLabel}>Akceptowane metody płatności</Text>
        <View style={s.methodsRow}>
          {['VISA', 'Mastercard', 'AMEX', 'Apple Pay'].map(m => (
            <View key={m} style={s.methodChip}>
              <Text style={s.methodChipText}>{m}</Text>
            </View>
          ))}
        </View>
        <View style={s.infoGrid}>
          {[
            'Brak dodatkowego\nsprzętu',
            'Wypłata na konto\n1-2 dni robocze',
            'Szyfrowanie\nend-to-end',
            'Zgodność z\nnormą PCI DSS',
          ].map((txt, i) => (
            <View key={i} style={s.infoGridItem}>
              <View style={s.infoGridIcon}><Text style={s.infoGridIconText}>✓</Text></View>
              <Text style={s.infoGridText}>{txt}</Text>
            </View>
          ))}
        </View>
      </View>

    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  topBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16, gap: 14,
  },
  back: {
    width: 42, height: 42, borderRadius: 14,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  backIcon: { color: C.text2, fontSize: 18 },
  merchantHeader: { flex: 1 },
  merchantName: { fontSize: 18, fontWeight: '800', color: C.text1, marginBottom: 4 },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  verifiedDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.success },
  verifiedText: { fontSize: 12, color: C.success, fontWeight: '600' },

  // Centrum
  center: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 24,
  },

  // Kwota
  amountBlock: { alignItems: 'center', marginBottom: 24 },
  amountLabel: {
    fontSize: 10, color: C.text3, fontWeight: '700',
    letterSpacing: 3, marginBottom: 8,
  },
  amountValue: {
    fontSize: 72, fontWeight: '900', color: C.text1, letterSpacing: -3, lineHeight: 76,
  },
  amountCurr: { fontSize: 32, fontWeight: '700', color: C.text2 },

  // Status
  connectRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  connectText: { fontSize: 12, color: C.text3 },
  progressBar: {
    width: '100%', height: 3, backgroundColor: C.cardBorder,
    borderRadius: 2, overflow: 'hidden', marginBottom: 8,
  },
  progressFill: { height: '100%', backgroundColor: C.primary, borderRadius: 2 },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, paddingHorizontal: 20, borderRadius: 16,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder,
    width: '100%',
  },
  statusPillText: { fontSize: 14, color: C.text2, fontWeight: '600' },
  errorPill: {
    paddingVertical: 12, paddingHorizontal: 16, borderRadius: 14,
    backgroundColor: 'rgba(248,113,113,0.08)',
    borderWidth: 1, borderColor: 'rgba(248,113,113,0.2)',
    marginBottom: 12, width: '100%',
  },
  errorPillText: { fontSize: 13, color: C.error, textAlign: 'center', fontWeight: '500' },
  retryBtn: {
    paddingVertical: 14, borderRadius: 14,
    backgroundColor: C.primaryFaint,
    borderWidth: 1, borderColor: C.cardBorderActive,
    alignItems: 'center', width: '100%',
  },
  retryText: { color: C.primaryLight, fontSize: 15, fontWeight: '700' },

  // Info section
  infoSection: { paddingHorizontal: 24, paddingBottom: 24 },
  infoSectionDivider: { height: 1, backgroundColor: C.cardBorder, marginBottom: 16 },
  infoSectionLabel: {
    fontSize: 10, color: C.text3, fontWeight: '700',
    letterSpacing: 2, marginBottom: 10,
  },
  methodsRow: { flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  methodChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder,
  },
  methodChipText: { fontSize: 11, color: C.text3, fontWeight: '700', letterSpacing: 0.5 },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  infoGridItem: {
    width: '47%', flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    paddingVertical: 10, paddingHorizontal: 12,
    backgroundColor: C.card, borderRadius: 12,
    borderWidth: 1, borderColor: C.cardBorder,
  },
  infoGridIcon: {
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: C.successFaint,
    alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  infoGridIconText: { fontSize: 10, color: C.success, fontWeight: '800' },
  infoGridText: { fontSize: 11, color: C.text3, fontWeight: '500', lineHeight: 16, flex: 1 },

});
