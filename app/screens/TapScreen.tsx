import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Animated, Easing, Image,
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

const SIMULATED = false;

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
      setErrorMsg(error.message || 'Błąd połączenia');
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
    <SafeAreaView style={s.root} edges={['bottom']}>

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

        {/* Kontener kółek z napisem na dole */}
        <View style={s.ringContainer}>
          <Animated.View style={[s.ringOuter, { transform: [{ scale: pulseAnim }], opacity: opacityAnim }]} />
          <View style={s.ringInner}>
            <Image
              source={require('../assets/contactless.webp')}
              style={s.contactlessIcon}
              resizeMode="contain"
            />
          </View>
          {/* Napis na dole kółka */}
          <Text style={s.hint}>Zbliż tutaj, aby zapłacić</Text>
        </View>


        {status === 'connecting' && (
          <View style={s.connectRow}>
            <ActivityIndicator size="small" color={'rgba(255,255,255,0.4)'} />
            <Text style={s.connectText}>{initStep}</Text>
          </View>
        )}
      </View>

      {/* Karta dolna */}
      <View style={s.cardWrapper}>
        <View style={s.card}>

          {/* Merchant header */}
          <View style={s.merchantRow}>
            <View style={s.merchantInfo}>
              <Text style={s.merchantName}>Tip For Me</Text>
              <View style={s.verifiedBadge}>
                <View style={s.verifiedDot} />
                <Text style={s.verifiedText}>Zweryfikowany odbiorca</Text>
              </View>
            </View>
          </View>

          {/* Kwota */}
          <View style={s.amountBlock}>
            <Text style={s.amountLabel}>Do zapłaty</Text>
            <Text style={s.amountValue}>{amountZl}<Text style={s.amountCurr}> zł</Text></Text>
          </View>

          {/* Status bar */}
          {status === 'connecting' && (
            <View style={s.progressBar}>
              <View style={[s.progressFill, { width: `${initProgress}%` as any }]} />
            </View>
          )}
          {status === 'processing' && (
            <View style={s.statusPill}>
              <ActivityIndicator size="small" color="#a78bfa" style={{ marginRight: 8 }} />
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

          {/* Metody płatności + info */}
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
              <View style={s.infoGridItem}>
                <View style={s.infoGridIcon}><Text style={s.infoGridIconText}>✓</Text></View>
                <Text style={s.infoGridText}>Brak dodatkowego{'\n'}sprzętu</Text>
              </View>
              <View style={s.infoGridItem}>
                <View style={s.infoGridIcon}><Text style={s.infoGridIconText}>✓</Text></View>
                <Text style={s.infoGridText}>Środki trafiają{'\n'}bezpośrednio do Ciebie</Text>
              </View>
              <View style={s.infoGridItem}>
                <View style={s.infoGridIcon}><Text style={s.infoGridIconText}>✓</Text></View>
                <Text style={s.infoGridText}>Szyfrowanie{'\n'}end-to-end</Text>
              </View>
              <View style={s.infoGridItem}>
                <View style={s.infoGridIcon}><Text style={s.infoGridIconText}>✓</Text></View>
                <Text style={s.infoGridText}>Zgodność z{'\n'}normą PCI DSS</Text>
              </View>
            </View>
          </View>


        </View>
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
    height: 310,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 0,
    marginTop: -40,
    overflow: 'hidden',
  },
  particle: {
    position: 'absolute',
    backgroundColor: '#5b7cff',
  },
  ringContainer: {
    width: 220, height: 220,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 24,
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
  },
  contactlessIcon: {
    width: 60, height: 60,
    tintColor: '#ffffff',
  },
  nfcWaves: {
    fontSize: 48, color: '#fff',
    fontWeight: '900', lineHeight: 56,
    marginHorizontal: -4,
  },
  nfcWaves2: { opacity: 0.7, fontSize: 36 },
  nfcWaves3: { opacity: 0.4, fontSize: 24 },
  hint: {
    position: 'absolute',
    bottom: 16,
    fontSize: 16, fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
  },
  connectRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  connectText: { fontSize: 12, color: 'rgba(255,255,255,0.35)' },

  // Karta dolna
  cardWrapper: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
  },
  card: {
    borderRadius: 28,
    backgroundColor: '#13112a',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    padding: 24,
    flex: 1,
  },

  // Merchant header
  merchantRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 24,
  },
  merchantAvatar: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: '#3b1f7a',
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.3)',
    alignItems: 'center', justifyContent: 'center',
  },
  merchantAvatarText: {
    fontSize: 22, fontWeight: '800', color: '#c4b5fd',
  },
  merchantInfo: { flex: 1 },
  merchantName: {
    fontSize: 17, fontWeight: '700', color: '#ffffff', marginBottom: 4,
  },
  verifiedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
  },
  verifiedDot: {
    width: 6, height: 6, borderRadius: 3, backgroundColor: '#34d399',
  },
  verifiedText: {
    fontSize: 12, color: '#34d399', fontWeight: '600',
  },

  // Kwota
  amountBlock: {
    marginBottom: 20,
  },
  amountLabel: {
    fontSize: 12, color: 'rgba(255,255,255,0.35)',
    fontWeight: '600', letterSpacing: 0.8,
    textTransform: 'uppercase', marginBottom: 4,
  },
  amountValue: {
    fontSize: 58, fontWeight: '900', color: '#ffffff', letterSpacing: -2, lineHeight: 66,
  },
  amountCurr: {
    fontSize: 26, fontWeight: '700', color: 'rgba(255,255,255,0.45)', letterSpacing: 0,
  },

  // Status
  progressBar: {
    width: '100%', height: 3, backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 2, overflow: 'hidden', marginBottom: 12,
  },
  progressFill: { height: '100%', backgroundColor: '#7c3aed', borderRadius: 2 },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(167,139,250,0.08)',
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.15)',
    marginBottom: 12,
  },
  statusPillText: {
    fontSize: 13, color: 'rgba(255,255,255,0.5)', fontWeight: '500',
  },
  errorPill: {
    paddingVertical: 12, paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(248,113,113,0.08)',
    borderWidth: 1, borderColor: 'rgba(248,113,113,0.2)',
    marginBottom: 12,
  },
  errorPillText: {
    fontSize: 13, color: '#f87171', textAlign: 'center', fontWeight: '500',
  },
  retryBtn: {
    paddingVertical: 14, borderRadius: 14,
    backgroundColor: 'rgba(124,58,237,0.2)',
    borderWidth: 1, borderColor: 'rgba(124,58,237,0.4)',
    alignItems: 'center', marginBottom: 12,
  },
  retryText: { color: '#a78bfa', fontSize: 15, fontWeight: '700' },

  // Info section
  infoSection: {
    marginTop: 20,
  },
  infoSectionDivider: {
    height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginBottom: 16,
  },
  infoSectionLabel: {
    fontSize: 11, color: 'rgba(255,255,255,0.25)',
    fontWeight: '600', letterSpacing: 0.8,
    textTransform: 'uppercase', marginBottom: 10,
  },
  methodsRow: {
    flexDirection: 'row', gap: 8, marginBottom: 16,
  },
  methodChip: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  methodChipText: {
    fontSize: 11, color: 'rgba(255,255,255,0.45)',
    fontWeight: '700', letterSpacing: 0.5,
  },
  infoGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
  },
  infoGridItem: {
    width: '47%',
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    paddingVertical: 10, paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  infoGridIcon: {
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: 'rgba(52,211,153,0.15)',
    alignItems: 'center', justifyContent: 'center',
    marginTop: 1,
  },
  infoGridIconText: {
    fontSize: 10, color: '#34d399', fontWeight: '800',
  },
  infoGridText: {
    fontSize: 11, color: 'rgba(255,255,255,0.35)',
    fontWeight: '500', lineHeight: 16, flex: 1,
  },

});
