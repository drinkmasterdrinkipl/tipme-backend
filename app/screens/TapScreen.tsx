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
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      {/* Przycisk powrotu */}
      <TouchableOpacity style={s.back} onPress={() => navigation.goBack()}>
        <Text style={s.backIcon}>←</Text>
      </TouchableOpacity>

      {/* Górna strefa NFC */}
      <View style={s.nfcZone}>
        {/* Zewnętrzny puls */}
        <Animated.View style={[s.nfcPulseOuter, { transform: [{ scale: pulseAnim }], opacity: opacityAnim }]} />
        {/* Środkowy puls */}
        <Animated.View style={[s.nfcPulseInner, { transform: [{ scale: pulseAnim }], opacity: opacityAnim }]} />
        {/* Ikona NFC */}
        <View style={s.nfcIconWrap}>
          <Text style={s.nfcIcon}>))</Text>
          <Text style={[s.nfcIcon, { fontSize: 28, marginTop: -8 }]}>))</Text>
        </View>

        {/* Napis zawsze widoczny */}
        <Text style={s.nfcHint}>Zbliż tutaj, aby zapłacić</Text>

        {status === 'connecting' && (
          <View style={s.connectingRow}>
            <ActivityIndicator size="small" color={C.text3} />
            <Text style={s.connectingText}>{initStep}</Text>
          </View>
        )}
      </View>

      {/* Karta z kwotą na dole */}
      <View style={s.card}>
        <View style={s.cardInner}>
          <View style={s.cardIcon}>
            <Text style={s.cardIconText}>💜</Text>
          </View>
          <View>
            <Text style={s.cardName}>Tip For Me</Text>
            <Text style={s.amount}>{amountZl}<Text style={s.amountCurr}> zł</Text></Text>
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
          <View style={s.errorWrap}>
            <Text style={s.errorText}>{errorMsg}</Text>
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

  back: {
    position: 'absolute', top: 60, left: 20, zIndex: 10,
    width: 40, height: 40, borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  backIcon: { color: C.text3, fontSize: 18 },

  // Górna strefa NFC
  nfcZone: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nfcPulseOuter: {
    position: 'absolute',
    width: 220, height: 220, borderRadius: 110,
    borderWidth: 1, borderColor: 'rgba(168,85,247,0.15)',
    backgroundColor: 'rgba(168,85,247,0.04)',
  },
  nfcPulseInner: {
    position: 'absolute',
    width: 160, height: 160, borderRadius: 80,
    borderWidth: 1.5, borderColor: 'rgba(168,85,247,0.25)',
    backgroundColor: 'rgba(168,85,247,0.08)',
  },
  nfcIconWrap: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: 'rgba(168,85,247,0.18)',
    borderWidth: 2, borderColor: 'rgba(168,85,247,0.5)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 28,
  },
  nfcIcon: {
    fontSize: 38, color: '#fff',
    fontWeight: '900', letterSpacing: -6,
  },
  nfcHint: {
    fontSize: 18, fontWeight: '700',
    color: '#ffffff', letterSpacing: 0.2,
    marginBottom: 16,
  },
  connectingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4,
  },
  connectingText: { fontSize: 13, color: C.text3 },

  // Karta dolna — jak na zdjęciu
  card: {
    margin: 20, marginTop: 0,
    borderRadius: 28,
    backgroundColor: '#1a1730',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    padding: 24,
  },
  cardInner: {
    flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 4,
  },
  cardIcon: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: 'rgba(168,85,247,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  cardIconText: { fontSize: 26 },
  cardName: { fontSize: 13, color: C.text3, fontWeight: '600', marginBottom: 2 },
  amount: { fontSize: 44, fontWeight: '900', color: '#ffffff', letterSpacing: -2 },
  amountCurr: { fontSize: 22, fontWeight: '700', color: C.text2 },
  progressBar: {
    width: '100%', height: 3, backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 2, overflow: 'hidden', marginTop: 16,
  },
  progressFill: { height: '100%', backgroundColor: C.primary, borderRadius: 2 },
  processingText: {
    fontSize: 13, color: C.text3, textAlign: 'center', marginTop: 14,
  },
  errorWrap: { alignItems: 'center', marginTop: 14 },
  errorText: { fontSize: 13, color: C.error, textAlign: 'center', marginBottom: 14 },
  retryBtn: {
    paddingVertical: 12, paddingHorizontal: 28, borderRadius: 14,
    borderWidth: 1.5, borderColor: C.cardBorder,
  },
  retryText: { color: C.primaryLight, fontSize: 14, fontWeight: '700' },
});
