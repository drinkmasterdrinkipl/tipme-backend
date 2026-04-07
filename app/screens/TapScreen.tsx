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
  const opacityAnim = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseAnim, { toValue: 1.18, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(opacityAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(pulseAnim, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(opacityAnim, { toValue: 0.6, duration: 900, useNativeDriver: true }),
        ]),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  const {
    discoverReaders,
    connectReader,
    disconnectReader,
    collectPaymentMethod,
    confirmPaymentIntent,
    retrievePaymentIntent,
  } = useStripeTerminal({
    onUpdateDiscoveredReaders: (readers) => {
      discoveredRef.current = readers;
    },
  });

  useEffect(() => {
    initializeReader();
    return () => { disconnectReader().catch(() => {}); };
  }, []);

  // Auto-start płatności gdy czytnik gotowy
  useEffect(() => {
    if (status === 'ready') {
      processPayment();
    }
  }, [status]);

  const initializeReader = async () => {
    try {
      setStatus('connecting');
      setInitProgress(0);
      discoveredRef.current = [];

      setInitStep('Szukanie czytnika...');
      setInitProgress(35);
      const { error: discoverError } = await discoverReaders({
        discoveryMethod: 'tapToPay',
        simulated: false,
      });
      if (discoverError) throw new Error(discoverError.message);

      setInitStep('Wykrywanie urządzenia...');
      setInitProgress(60);

      let waited = 0;
      while (discoveredRef.current.length === 0 && waited < 15000) {
        await new Promise(resolve => setTimeout(resolve, 300));
        waited += 300;
      }

      const readers = discoveredRef.current;
      if (!readers || readers.length === 0) throw new Error('Nie znaleziono czytnika NFC. Upewnij się że NFC jest włączone.');

      setInitStep('Łączenie z czytnikiem...');
      setInitProgress(80);
      const locationId = await AsyncStorage.getItem('stripeLocationId') ?? '';
      const { error: connectError } = await connectReader({
        discoveryMethod: 'tapToPay',
        reader: readers[0],
        locationId,
      });
      if (connectError) throw new Error(connectError.message);

      setInitStep('Gotowy!');
      setInitProgress(100);
      await new Promise(resolve => setTimeout(resolve, 300));

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

      const idempotencyKey = `tip-${Date.now()}-${Math.random().toString(36).slice(2, 11)}-${Math.random().toString(36).slice(2, 11)}`;

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
        if (error.name === 'AbortError') throw new Error('Przekroczono czas oczekiwania na serwer');
        throw error;
      }

      const { paymentIntent: retrievedPI, error: retrieveError } = await retrievePaymentIntent(clientSecret!);
      if (retrieveError) throw new Error(retrieveError.message);

      // Tu iOS pokazuje natywny ekran "Zbliż tutaj, aby zapłacić"
      const { paymentIntent: collectedPI, error: collectError } = await collectPaymentMethod({
        paymentIntent: retrievedPI!,
      });
      if (collectError) {
        if (collectError.code === ErrorCode.CANCELED) { setStatus('ready'); return; }
        throw new Error(collectError.message);
      }

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
      {/* Górna strefa NFC */}
      <View style={s.nfcZone}>
        <Animated.View style={[s.nfcPulse, { transform: [{ scale: pulseAnim }], opacity: opacityAnim }]} />
        <View style={s.nfcIconWrap}>
          <Text style={s.nfcIcon}>))))</Text>
        </View>
        {status === 'processing' && (
          <Text style={s.nfcHint}>Zbliż tutaj, aby zapłacić</Text>
        )}
      </View>

      {/* Przycisk powrotu */}
      <TouchableOpacity style={s.back} onPress={() => navigation.goBack()}>
        <Text style={s.backIcon}>←</Text>
      </TouchableOpacity>

      {/* Karta z kwotą i statusem */}
      <View style={s.card}>
        <Text style={s.amountLabel}>DO ZAPŁATY</Text>
        <Text style={s.amount}>{amountZl}<Text style={s.amountCurr}> zł</Text></Text>

        <View style={s.divider} />

        {status === 'connecting' && (
          <View style={s.stateWrap}>
            <ActivityIndicator size="small" color={C.primary} style={{ marginBottom: 10 }} />
            <Text style={s.stateTitle}>{initStep}</Text>
            <View style={s.progressBar}>
              <View style={[s.progressFill, { width: `${initProgress}%` as any }]} />
            </View>
          </View>
        )}

        {status === 'processing' && (
          <View style={s.stateWrap}>
            <ActivityIndicator size="small" color={C.primary} style={{ marginBottom: 10 }} />
            <Text style={s.stateTitle}>Proszę trzymać kartę przy telefonie...</Text>
          </View>
        )}

        {status === 'error' && (
          <View style={s.stateWrap}>
            <Text style={[s.stateTitle, { color: C.error, marginBottom: 12 }]}>{errorMsg}</Text>
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
  root: { flex: 1, backgroundColor: '#0c0a13' },

  // Górna strefa NFC
  nfcZone: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  nfcPulse: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(168,85,247,0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(168,85,247,0.25)',
  },
  nfcIconWrap: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: 'rgba(168,85,247,0.15)',
    borderWidth: 1.5,
    borderColor: 'rgba(168,85,247,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  nfcIcon: {
    fontSize: 36,
    color: C.primaryLight,
    fontWeight: '900',
    letterSpacing: -4,
  },
  nfcHint: {
    fontSize: 16,
    fontWeight: '700',
    color: C.text2,
    letterSpacing: 0.2,
  },

  // Przycisk powrotu
  back: {
    position: 'absolute', top: 60, left: 20, zIndex: 10,
    width: 40, height: 40, borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  backIcon: { color: C.text3, fontSize: 18 },

  // Karta dolna
  card: {
    margin: 20,
    marginTop: 0,
    borderRadius: 28,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.cardBorder,
    padding: 28,
    alignItems: 'center',
  },
  amountLabel: {
    fontSize: 10, fontWeight: '700', letterSpacing: 2.5,
    color: C.text3, marginBottom: 8,
  },
  amount: {
    fontSize: 64, fontWeight: '900', color: C.text1, letterSpacing: -3,
  },
  amountCurr: { fontSize: 26, fontWeight: '700', color: C.text2 },
  divider: {
    width: '100%', height: 1,
    backgroundColor: C.cardBorder, marginVertical: 20,
  },
  stateWrap: { alignItems: 'center', width: '100%' },
  stateTitle: {
    fontSize: 14, color: C.text3,
    textAlign: 'center', lineHeight: 22,
  },
  progressBar: {
    width: '100%', height: 4, backgroundColor: C.text4,
    borderRadius: 2, overflow: 'hidden', marginTop: 14,
  },
  progressFill: { height: '100%', backgroundColor: C.primary, borderRadius: 2 },
  retryBtn: {
    paddingVertical: 14, paddingHorizontal: 32, borderRadius: 16,
    borderWidth: 1.5, borderColor: C.cardBorder, backgroundColor: C.card,
  },
  retryText: { color: C.primaryLight, fontSize: 15, fontWeight: '700' },
});
