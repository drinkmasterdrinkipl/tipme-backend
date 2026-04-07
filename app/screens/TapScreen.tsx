import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Animated, Easing,
} from 'react-native';
import { useStripeTerminal, ErrorCode } from '@stripe/stripe-terminal-react-native';
import type { Reader } from '@stripe/stripe-terminal-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL, apiFetch } from '../config';
import { C } from '../theme';

// Statyczne cząsteczki w tle
const PARTICLES = [
  { top: 8, left: 30, size: 2, op: 0.6 },
  { top: 20, left: 80, size: 1.5, op: 0.4 },
  { top: 15, left: 140, size: 2.5, op: 0.7 },
  { top: 35, left: 200, size: 1.5, op: 0.5 },
  { top: 10, left: 260, size: 2, op: 0.6 },
  { top: 50, left: 50, size: 1.5, op: 0.3 },
  { top: 60, left: 110, size: 2, op: 0.5 },
  { top: 45, left: 170, size: 1, op: 0.4 },
  { top: 70, left: 230, size: 2.5, op: 0.6 },
  { top: 80, left: 20, size: 2, op: 0.5 },
  { top: 90, left: 90, size: 1.5, op: 0.3 },
  { top: 100, left: 150, size: 2, op: 0.7 },
  { top: 75, left: 290, size: 1.5, op: 0.4 },
  { top: 120, left: 60, size: 2, op: 0.5 },
  { top: 110, left: 200, size: 1, op: 0.6 },
  { top: 130, left: 330, size: 2, op: 0.3 },
  { top: 25, left: 310, size: 1.5, op: 0.5 },
  { top: 55, left: 350, size: 2, op: 0.4 },
  { top: 95, left: 120, size: 1, op: 0.6 },
  { top: 140, left: 250, size: 1.5, op: 0.4 },
];

export default function TapScreen({ navigation, route }: any) {
  const amount: number = route.params?.amount ?? 0;
  if (!amount || amount <= 0) {
    navigation.goBack();
    return null;
  }
  const amountZl = (amount / 100 % 1 === 0)
    ? (amount / 100).toFixed(0)
    : (amount / 100).toFixed(2);

  const [status, setStatus] = useState<'connecting' | 'ready' | 'processing' | 'error'>('connecting');
  const [errorMsg, setErrorMsg] = useState('');
  const [initProgress, setInitProgress] = useState(0);
  const [initStep, setInitStep] = useState('Inicjalizacja SDK...');
  const discoveredRef = useRef<Reader.Type[]>([]);

  // Animacja pulsu NFC
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseAnim, { toValue: 1.22, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(opacityAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(pulseAnim, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(opacityAnim, { toValue: 0.5, duration: 1000, useNativeDriver: true }),
        ]),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  const {
    discoverReaders, connectReader, disconnectReader,
    collectPaymentMethod, confirmPaymentIntent, retrievePaymentIntent,
  } = useStripeTerminal({
    onUpdateDiscoveredReaders: (readers) => { discoveredRef.current = readers; },
  });

  useEffect(() => {
    initializeReader();
    return () => { disconnectReader().catch(() => {}); };
  }, []);

  useEffect(() => {
    if (status === 'ready') processPayment();
  }, [status]);

  const initializeReader = async () => {
    try {
      setStatus('connecting');
      setInitProgress(0);
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
      const locationId = await AsyncStorage.getItem('stripeLocationId') ?? '';
      const { error: connectError } = await connectReader({ discoveryMethod: 'tapToPay', reader: readers[0], locationId });
      if (connectError) throw new Error(connectError.message);

      setInitProgress(100);
      await new Promise(r => setTimeout(r, 300));
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
      if (!accountId) throw new Error('Brak ID konta. Zaloguj się ponownie.');

      const idempotencyKey = `tip-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
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
        if (collectError.code === ErrorCode.CANCELED) { setStatus('ready'); return; }
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
      setErrorMsg(error.message || 'Błąd płatności');
    }
  };

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>

      {/* Przycisk powrotu */}
      <TouchableOpacity style={s.back} onPress={() => navigation.goBack()}>
        <Text style={s.backIcon}>←</Text>
      </TouchableOpacity>

      {/* Górna strefa — ciemna z cząsteczkami */}
      <View style={s.nfcZone}>
        {/* Cząsteczki w tle */}
        {PARTICLES.map((p, i) => (
          <View key={i} style={[s.particle, {
            top: p.top, left: p.left,
            width: p.size, height: p.size,
            borderRadius: p.size / 2,
            opacity: p.op,
          }]} />
        ))}

        {/* Zewnętrzny pierścień pulsujący */}
        <Animated.View style={[s.ringOuter, { transform: [{ scale: pulseAnim }], opacity: opacityAnim }]} />

        {/* Wewnętrzny okrąg */}
        <View style={s.ringInner}>
          {/* Ikona NFC — symbol zbliżeniowy */}
          <Text style={s.nfcWaves}>)</Text>
          <Text style={[s.nfcWaves, s.nfcWaves2]}>)</Text>
          <Text style={[s.nfcWaves, s.nfcWaves3]}>)</Text>
        </View>

        {/* Napis */}
        <Text style={s.hint}>Zbliż tutaj, aby zapłacić</Text>

        {status === 'connecting' && (
          <View style={s.connectRow}>
            <ActivityIndicator size="small" color={'rgba(255,255,255,0.4)'} />
            <Text style={s.connectText}>{initStep}</Text>
          </View>
        )}
      </View>

      {/* Karta dolna */}
      <View style={s.card}>
        <View style={s.cardTop}>
          <View style={s.cardIcon}>
            <Text style={s.cardIconEmoji}>💜</Text>
          </View>
          <View>
            <Text style={s.cardName}>Tip For Me</Text>
            <Text style={s.cardAmount}>{amountZl}<Text style={s.cardCurr}> zł</Text></Text>
          </View>
        </View>

        {status === 'connecting' && (
          <View style={s.progressBar}>
            <View style={[s.progressFill, { width: `${initProgress}%` as any }]} />
          </View>
        )}

        {status === 'processing' && (
          <Text style={s.processingText}>Proszę trzymać kartę przy telefonie...</Text>
        )}

        {status === 'error' && (
          <>
            <Text style={s.errorText}>{errorMsg}</Text>
            <TouchableOpacity style={s.retryBtn} onPress={initializeReader}>
              <Text style={s.retryText}>Spróbuj ponownie</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080810' },

  back: {
    position: 'absolute', top: 60, left: 16, zIndex: 10,
    width: 42, height: 42, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  backIcon: { color: 'rgba(255,255,255,0.7)', fontSize: 18 },

  // Górna strefa
  nfcZone: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 10,
    overflow: 'hidden',
  },
  particle: {
    position: 'absolute',
    backgroundColor: '#5b7cff',
  },
  ringOuter: {
    position: 'absolute',
    width: 220, height: 220, borderRadius: 110,
    borderWidth: 1, borderColor: 'rgba(168,85,247,0.2)',
    backgroundColor: 'rgba(168,85,247,0.05)',
  },
  ringInner: {
    width: 130, height: 130, borderRadius: 65,
    backgroundColor: '#2d1f5e',
    borderWidth: 2, borderColor: '#7c3aed',
    alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row',
    marginBottom: 24,
    alignSelf: 'center',
  },
  nfcWaves: {
    fontSize: 48, color: '#fff',
    fontWeight: '900', lineHeight: 56,
    marginHorizontal: -4,
  },
  nfcWaves2: { opacity: 0.7, fontSize: 36 },
  nfcWaves3: { opacity: 0.4, fontSize: 24 },
  hint: {
    fontSize: 18, fontWeight: '700',
    color: '#ffffff', marginBottom: 12,
  },
  connectRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  connectText: { fontSize: 12, color: 'rgba(255,255,255,0.35)' },

  // Karta dolna
  card: {
    margin: 16, marginTop: 0,
    borderRadius: 24,
    backgroundColor: '#13112a',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    padding: 20,
  },
  cardTop: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
  },
  cardIcon: {
    width: 52, height: 52, borderRadius: 14,
    backgroundColor: '#2d1f5e',
    alignItems: 'center', justifyContent: 'center',
  },
  cardIconEmoji: { fontSize: 26 },
  cardName: { fontSize: 13, color: 'rgba(255,255,255,0.45)', fontWeight: '600', marginBottom: 2 },
  cardAmount: { fontSize: 42, fontWeight: '900', color: '#ffffff', letterSpacing: -1 },
  cardCurr: { fontSize: 20, fontWeight: '700', color: 'rgba(255,255,255,0.5)' },
  progressBar: {
    width: '100%', height: 3, backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 2, overflow: 'hidden', marginTop: 16,
  },
  progressFill: { height: '100%', backgroundColor: '#7c3aed', borderRadius: 2 },
  processingText: {
    fontSize: 13, color: 'rgba(255,255,255,0.4)',
    textAlign: 'center', marginTop: 14,
  },
  errorText: {
    fontSize: 13, color: '#f87171',
    textAlign: 'center', marginTop: 14, marginBottom: 12,
  },
  retryBtn: {
    paddingVertical: 14, borderRadius: 14,
    backgroundColor: 'rgba(124,58,237,0.2)',
    borderWidth: 1, borderColor: 'rgba(124,58,237,0.4)',
    alignItems: 'center', marginTop: 4,
  },
  retryText: { color: '#a78bfa', fontSize: 15, fontWeight: '700' },
});
