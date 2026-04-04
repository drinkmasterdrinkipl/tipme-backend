import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useStripeTerminal, ErrorCode } from '@stripe/stripe-terminal-react-native';
import type { Reader } from '@stripe/stripe-terminal-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../config';
import { C } from '../theme';

export default function TapScreen({ navigation, route }: any) {
  const { amount } = route.params;
  const amountZl = (amount / 100).toFixed(0);
  const [status, setStatus] = useState<'connecting' | 'ready' | 'processing' | 'error'>('connecting');
  const [errorMsg, setErrorMsg] = useState('');
  const discoveredRef = useRef<Reader.Type[]>([]);

  const {
    initialize,
    discoverReaders,
    connectReader,
    collectPaymentMethod,
    confirmPaymentIntent,
    retrievePaymentIntent,
  } = useStripeTerminal({
    onUpdateDiscoveredReaders: (readers) => {
      discoveredRef.current = readers;
    },
  });

  useEffect(() => { initializeReader(); }, []);

  const initializeReader = async () => {
    try {
      setStatus('connecting');
      discoveredRef.current = [];

      await initialize();

      const { error: discoverError } = await discoverReaders({
        discoveryMethod: 'tapToPay',
        simulated: false,
      });
      if (discoverError) throw new Error(discoverError.message);

      // Poczekaj chwilę na wykrycie czytnika
      await new Promise(resolve => setTimeout(resolve, 1500));

      const readers = discoveredRef.current;
      if (!readers || readers.length === 0) throw new Error('Nie znaleziono czytnika NFC');

      const locationId = await AsyncStorage.getItem('stripeLocationId') ?? '';
      const { error: connectError } = await connectReader({
        discoveryMethod: 'tapToPay',
        reader: readers[0],
        locationId,
      });
      if (connectError) throw new Error(connectError.message);

      setStatus('ready');
    } catch (error: any) {
      setStatus('error');
      setErrorMsg(error.message || 'Błąd połączenia');
    }
  };

  const processPayment = async () => {
    try {
      setStatus('processing');
      const accountId = await AsyncStorage.getItem('stripeAccountId');

      // Utwórz PaymentIntent na serwerze
      const res = await fetch(`${API_URL}/api/create-payment-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, stripeAccountId: accountId }),
      });
      const { clientSecret, error: serverError } = await res.json();
      if (serverError) throw new Error(serverError);

      // Pobierz PaymentIntent po client secret
      const { paymentIntent: retrievedPI, error: retrieveError } = await retrievePaymentIntent(clientSecret);
      if (retrieveError) throw new Error(retrieveError.message);

      // Zbierz metodę płatności
      const { paymentIntent: collectedPI, error: collectError } = await collectPaymentMethod({
        paymentIntent: retrievedPI!,
      });
      if (collectError) {
        if (collectError.code === ErrorCode.CANCELED) { setStatus('ready'); return; }
        throw new Error(collectError.message);
      }

      // Potwierdź płatność
      const { paymentIntent: confirmedPI, error: confirmError } = await confirmPaymentIntent({
        paymentIntent: collectedPI!,
      });
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
      setErrorMsg(error.message || 'Błąd płatności');
    }
  };

  return (
    <SafeAreaView style={s.root}>
      <TouchableOpacity style={s.back} onPress={() => navigation.goBack()}>
        <Text style={s.backIcon}>←</Text>
      </TouchableOpacity>

      <View style={s.content}>
        <View style={s.amountCard}>
          <Text style={s.amountLabel}>DO ZAPŁATY</Text>
          <Text style={s.amount}>{amountZl}<Text style={s.amountCurr}> zł</Text></Text>
        </View>

        {status === 'connecting' && (
          <View style={s.stateWrap}>
            <ActivityIndicator size="large" color={C.primary} />
            <Text style={s.stateTitle}>Inicjalizacja</Text>
            <Text style={s.stateDesc}>Przygotowywanie terminala...</Text>
          </View>
        )}

        {status === 'ready' && (
          <View style={s.stateWrap}>
            <View style={s.nfcRing}>
              <View style={s.nfcRingInner}>
                <Text style={s.nfcSymbol}>⬡</Text>
              </View>
            </View>
            <Text style={s.stateTitle}>Gotowy do płatności</Text>
            <Text style={s.stateDesc}>Przyłóż kartę lub iPhone do tylnej części telefonu</Text>
            <TouchableOpacity style={s.tapBtn} onPress={processPayment} activeOpacity={0.85}>
              <Text style={s.tapBtnText}>Rozpocznij płatność</Text>
            </TouchableOpacity>
          </View>
        )}

        {status === 'processing' && (
          <View style={s.stateWrap}>
            <View style={s.processingRing}>
              <ActivityIndicator size="large" color={C.primary} />
            </View>
            <Text style={s.stateTitle}>Przetwarzanie</Text>
            <Text style={s.stateDesc}>Proszę trzymać kartę przy telefonie...</Text>
          </View>
        )}

        {status === 'error' && (
          <View style={s.stateWrap}>
            <View style={s.errorRing}>
              <Text style={s.errorSymbol}>!</Text>
            </View>
            <Text style={s.stateTitle}>Błąd</Text>
            <Text style={[s.stateDesc, { color: C.error }]}>{errorMsg}</Text>
            <TouchableOpacity style={s.retryBtn} onPress={initializeReader}>
              <Text style={s.retryText}>Spróbuj ponownie</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  back: {
    position: 'absolute', top: 60, left: 20, zIndex: 10,
    width: 40, height: 40, borderRadius: 13,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  backIcon: { color: C.text3, fontSize: 18 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  amountCard: {
    width: '100%', alignItems: 'center', paddingVertical: 28,
    borderRadius: 24, backgroundColor: C.card,
    borderWidth: 1, borderColor: C.cardBorder, marginBottom: 48,
  },
  amountLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 2.5, color: C.text3, marginBottom: 8 },
  amount: { fontSize: 56, fontWeight: '900', color: C.text1, letterSpacing: -3 },
  amountCurr: { fontSize: 24, fontWeight: '700', color: C.text2 },
  stateWrap: { alignItems: 'center', width: '100%' },
  nfcRing: {
    width: 160, height: 160, borderRadius: 80,
    borderWidth: 1.5, borderColor: C.cardBorderActive,
    alignItems: 'center', justifyContent: 'center', marginBottom: 32,
  },
  nfcRingInner: {
    width: 120, height: 120, borderRadius: 60,
    borderWidth: 1, borderColor: C.cardBorder,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.primaryFaint,
  },
  nfcSymbol: { fontSize: 48, color: C.primaryLight },
  processingRing: {
    width: 120, height: 120, borderRadius: 60,
    borderWidth: 1.5, borderColor: C.cardBorderActive,
    alignItems: 'center', justifyContent: 'center', marginBottom: 32,
    backgroundColor: C.primaryFaint,
  },
  errorRing: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(239,68,68,0.1)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  errorSymbol: { fontSize: 32, fontWeight: '900', color: C.error },
  stateTitle: { fontSize: 22, fontWeight: '800', color: C.text1, marginBottom: 8, letterSpacing: -0.5 },
  stateDesc: { fontSize: 14, color: C.text3, textAlign: 'center', lineHeight: 22 },
  tapBtn: {
    marginTop: 32, paddingVertical: 18, paddingHorizontal: 48, borderRadius: 20,
    backgroundColor: C.primary, shadowColor: C.primary,
    shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.4, shadowRadius: 28,
  },
  tapBtnText: { color: C.white, fontSize: 16, fontWeight: '800' },
  retryBtn: {
    marginTop: 20, paddingVertical: 14, paddingHorizontal: 32, borderRadius: 16,
    borderWidth: 1.5, borderColor: C.cardBorder, backgroundColor: C.card,
  },
  retryText: { color: C.primaryLight, fontSize: 15, fontWeight: '700' },
});
