import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Platform, Modal, TextInput, KeyboardAvoidingView,
} from 'react-native';
import { useStripeTerminal, ErrorCode } from '@stripe/stripe-terminal-react-native';
import type { Reader } from '@stripe/stripe-terminal-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL, apiFetch } from '../config';
import { C } from '../theme';

const CARD_ERROR_PHRASES = [
  'Niewystarczające środki',
  'Karta odrzucona',
  'Karta wygasła',
  'Karta zablokowana',
  'nie obsługuje płatności zbliżeniowych',
  'Płatność anulowana',
];
const isCardError = (msg: string) => CARD_ERROR_PHRASES.some(p => msg.includes(p));

export default function TapScreen({ navigation, route }: any) {
  const amount: number = route.params?.amount ?? 0;
  const amountZl = (amount / 100 % 1 === 0)
    ? (amount / 100).toFixed(0)
    : (amount / 100).toFixed(2);

  const [status, setStatus] = useState<'connecting' | 'ready' | 'processing' | 'confirming' | 'error'>('connecting');
  const [errorMsg, setErrorMsg] = useState('');
  const [initProgress, setInitProgress] = useState(0);
  const [initStep, setInitStep] = useState('Inicjalizacja SDK...');
  const discoveredRef = useRef<Reader.Type[]>([]);
  const paymentIntentIdRef = useRef<string | null>(null);
  const isInitializingRef = useRef(false);
  const [retryCount, setRetryCount] = useState(0);
  const MAX_RETRIES = 3;

  // Paragon po odrzuconej transakcji (wymaganie Apple 5.10)
  const [receiptModalVisible, setReceiptModalVisible] = useState(false);
  const [receiptEmail, setReceiptEmail] = useState('');
  const [receiptSending, setReceiptSending] = useState(false);
  const [receiptSent, setReceiptSent] = useState(false);
  const [receiptError, setReceiptError] = useState('');
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  const sendDeclinedReceipt = async () => {
    if (!isValidEmail(receiptEmail)) return;
    setReceiptSending(true);
    setReceiptError('');
    try {
      const now = new Date();
      const date = now.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ', ' + now.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
      const res = await apiFetch(`${API_URL}/api/send-receipt`, {
        method: 'POST',
        body: JSON.stringify({ email: receiptEmail.trim(), amount: (amount / 100).toFixed(2), last4: '****', paymentMethod: 'Karta', date, status: 'declined' }),
      });
      if (!res.ok) throw new Error('Błąd serwera');
      if (mountedRef.current) { setReceiptSent(true); setTimeout(() => { if (mountedRef.current) { setReceiptModalVisible(false); setReceiptSent(false); setReceiptEmail(''); } }, 1500); }
    } catch (e: any) {
      if (mountedRef.current) setReceiptError(e.message || 'Nie udało się wysłać');
    } finally {
      if (mountedRef.current) setReceiptSending(false);
    }
  };


  const {
    discoverReaders, connectReader, disconnectReader,
    collectPaymentMethod, confirmPaymentIntent, retrievePaymentIntent,
  } = useStripeTerminal({
    onUpdateDiscoveredReaders: (readers) => { discoveredRef.current = readers; },
    // Wymaganie Apple 3.9.1: wskaźnik postępu konfiguracji czytnika via PSP SDK
    onDidStartInstallingUpdate: () => {
      setInitStep('Aktualizacja czytnika...');
      setInitProgress(50);
    },
    onDidReportReaderSoftwareUpdateProgress: (progress: number) => {
      setInitProgress(Math.round(progress * 100));
      setInitStep(`Aktualizacja (${Math.round(progress * 100)}%)...`);
    },
    onDidFinishInstallingUpdate: () => {
      setInitStep('Czytnik zaktualizowany...');
      setInitProgress(90);
    },
  });

  const statusRef = useRef(status);
  useEffect(() => { statusRef.current = status; }, [status]);

  const translateError = useCallback((msg: string): string => {
    if (!msg) return 'Nieznany błąd';
    if (msg.includes('osVersionNotSupported') || msg.includes('OS version') || msg.includes('PaymentCardReaderError')) return 'Ta funkcja wymaga iOS 17.6 lub nowszego. Zaktualizuj system w Ustawieniach iPhone\'a.';
    if (msg.includes('Already connected')) return 'Czytnik już połączony. Trwa rozłączanie, spróbuj ponownie.';
    if (msg.includes('Network request failed') || msg.includes('network') || msg.includes('-1009') || msg.includes('networkUnavailable')) return 'Brak połączenia z internetem. Sprawdź sieć i spróbuj ponownie.';
    if (msg.includes('timed out') || msg.includes('timeout') || msg.includes('Przekroczono czas') || msg.includes('pinEntryTimeout')) return 'Przekroczono czas oczekiwania. Spróbuj ponownie.';
    if (msg.includes('canceled') || msg.includes('Canceled') || msg.includes('pinCancelled')) return 'Płatność anulowana.';
    if (msg.includes('phone call') || msg.includes('phone_call') || msg.includes('readNotAllowedDuringCall')) return 'Czytnik kart nie może być używany podczas rozmowy telefonicznej. Zakończ rozmowę i spróbuj ponownie.';
    if (msg.includes('nfcDisabled')) return 'NFC jest wyłączone. Włącz NFC w Ustawieniach iPhone\'a.';
    if (msg.includes('passcodeDisabled')) return 'Tap to Pay wymaga ustawionego kodu blokady. Ustaw go w Ustawieniach → Face ID i kod.';
    if (msg.includes('readFromBackground')) return 'Płatność musi być wykonana gdy aplikacja jest na pierwszym planie.';
    if (msg.includes('readerSessionExpired') || msg.includes('readerTokenExpired')) return 'Sesja wygasła. Spróbuj ponownie.';
    if (msg.includes('readerSessionBusy')) return 'Czytnik jest zajęty. Poczekaj chwilę i spróbuj ponownie.';
    if (msg.includes('readerNotAvailable') || msg.includes('readerInitializationFailed')) return 'Czytnik tymczasowo niedostępny. Spróbuj ponownie za chwilę.';
    if (msg.includes('readerServiceConnection')) return 'Błąd połączenia z systemem. Zamknij aplikację i otwórz ponownie.';
    if (msg.includes('insufficient_funds') || msg.toLowerCase().includes('insufficient funds')) return 'Niewystarczające środki na karcie.';
    if (msg.includes('do_not_honor') || msg.includes('card_velocity_exceeded')) return 'Karta zablokowana przez bank. Poproś klienta o inną kartę.';
    if (msg.includes('expired_card')) return 'Karta wygasła. Poproś klienta o inną kartę.';
    if (msg.includes('card_not_supported') || msg.includes('feature_not_supported') || msg.includes('cardNotSupported')) return 'Ta karta nie obsługuje płatności zbliżeniowych. Poproś klienta o inną kartę lub Apple Pay.';
    if (msg.includes('declined') || msg.includes('paymentCardDeclined')) return 'Karta odrzucona. Poproś klienta o inną kartę lub Apple Pay.';
    if (msg.includes('pinEntryFailed') || msg.includes('pinNotAllowed')) return 'Błąd wprowadzania PIN. Spróbuj ponownie lub użyj innej karty.';
    if (msg.includes('invalidAmount')) return 'Nieprawidłowa kwota. Wróć i wprowadź kwotę ponownie.';
    if (msg.includes('No reader')) return 'Nie znaleziono czytnika.';
    if (msg.includes('location')) return 'Brak lokalizacji Stripe. Wyloguj się i zaloguj ponownie.';
    if (msg.includes('server') || msg.includes('Server') || msg.includes('500') || msg.includes('503') || msg.includes('readerServiceError')) return 'Błąd serwera. Spróbuj za chwilę.';
    return msg;
  }, []);

  const processPayment = useCallback(async () => {
    try {
      setStatus('processing');
      statusRef.current = 'processing'; // bezpośrednia synchronizacja — useEffect jest asynchroniczny

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
        paymentIntentIdRef.current = data.paymentIntentId ?? null;
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

      // Wymaganie Apple 5.6: ekran "przetwarzanie" po odczycie karty (TTP screen zniknął)
      setStatus('confirming');
      statusRef.current = 'confirming';

      const { paymentIntent: confirmedPI, error: confirmError } = await confirmPaymentIntent({ paymentIntent: collectedPI! });
      if (confirmError) throw new Error(confirmError.message);

      // Sprawdź status — upewnij się że płatność faktycznie przeszła
      if (confirmedPI?.status !== 'succeeded' && confirmedPI?.status !== 'processing') {
        throw new Error(`Płatność nie powiodła się (status: ${confirmedPI?.status ?? 'unknown'})`);
      }

      const charge = confirmedPI?.charges?.[0];
      const details = charge?.paymentMethodDetails?.cardPresentDetails;

      paymentIntentIdRef.current = null; // wyczysć po sukcesie
      navigation.replace('Success', {
        amount: amountZl,
        paymentMethod: details?.brand ?? 'Karta',
        last4: details?.last4 ?? '****',
      });
    } catch (error: any) {
      // Anuluj Payment Intent jeśli płatność nie doszła do skutku (odmowa, brak środków itp.)
      // Pozwala na czysty retry bez otwartych PI w tle
      if (paymentIntentIdRef.current) {
        const accountId = await AsyncStorage.getItem('stripeAccountId').catch(() => null);
        if (accountId) {
          apiFetch(`${API_URL}/api/cancel-payment-intent`, {
            method: 'POST',
            body: JSON.stringify({
              paymentIntentId: paymentIntentIdRef.current,
              stripeAccountId: accountId,
            }),
          }).catch(() => {});
        }
        paymentIntentIdRef.current = null;
      }
      setStatus('error');
      setErrorMsg(translateError(error.message || ''));
    }
  }, [amount, amountZl, navigation, collectPaymentMethod, confirmPaymentIntent, retrievePaymentIntent, translateError]);

  useEffect(() => {
    if (!amount || amount < 500) { navigation.goBack(); return; }
    initializeReader();
    return () => {
      if (statusRef.current !== 'processing' && statusRef.current !== 'confirming') {
        disconnectReader().catch(() => {});
        // Anuluj niezakończony Payment Intent — czyści dashboard i zapobiega Incomplete
        if (paymentIntentIdRef.current) {
          AsyncStorage.getItem('stripeAccountId').then(accountId => {
            if (!accountId) return;
            apiFetch(`${API_URL}/api/cancel-payment-intent`, {
              method: 'POST',
              body: JSON.stringify({
                paymentIntentId: paymentIntentIdRef.current,
                stripeAccountId: accountId,
              }),
            }).catch(() => {});
          });
          paymentIntentIdRef.current = null;
        }
      }
    };
  }, [initializeReader]);

  useEffect(() => {
    if (status === 'ready') processPayment();
  }, [status, processPayment]);

  const initializeReader = useCallback(async () => {
    if (isInitializingRef.current) return;
    isInitializingRef.current = true;
    try {
      setStatus('connecting');
      setInitProgress(0);

      // Wymaganie Apple 1.4: sprawdź wersję iOS
      if (Platform.OS === 'ios') {
        const version = typeof Platform.Version === 'string'
          ? parseFloat(Platform.Version)
          : Platform.Version;
        const [major, minor] = String(version).split('.').map(Number);
        if (major < 17 || (major === 17 && (minor ?? 0) < 6)) {
          throw new Error('osVersionNotSupported');
        }
      }

      // Jeśli warmup z HomeScreen już odkrył czytnik — pomiń discovery (szybsza inicjalizacja)
      const alreadyDiscovered = discoveredRef.current.length > 0;

      if (!alreadyDiscovered) {
        await disconnectReader().catch(() => {});
        discoveredRef.current = [];
        setInitStep('Szukanie czytnika...');
        setInitProgress(25);
        const { error: discoverError } = await discoverReaders({ discoveryMethod: 'tapToPay', simulated: false });
        if (discoverError) throw new Error(discoverError.message);

        setInitStep('Wykrywanie urządzenia...');
        setInitProgress(50);

        let waited = 0;
        while (discoveredRef.current.length === 0 && waited < 15000) {
          await new Promise(r => setTimeout(r, 300));
          waited += 300;
        }
      } else {
        // Warmup znalazł już czytnik — rozłącz poprzednią sesję przed nowym connect
        await disconnectReader().catch(() => {});
        setInitStep('Czytnik gotowy...');
        setInitProgress(60);
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
    } finally {
      isInitializingRef.current = false;
    }
  }, [discoverReaders, connectReader, disconnectReader, translateError]);

  return (
    <SafeAreaView style={s.root}>

      {/* Góra — przycisk powrotu + merchant */}
      <View style={s.topBar}>
        <TouchableOpacity
          style={[s.back, (status === 'processing' || status === 'confirming') && { opacity: 0.3 }]}
          onPress={() => navigation.goBack()}
          disabled={status === 'processing' || status === 'confirming'}
        >
          <Text style={s.backIcon}>←</Text>
        </TouchableOpacity>
        <View style={s.merchantHeader}>
          <Text style={s.merchantName}>Tip For Me</Text>
          <Text style={s.merchantSub}>Terminal napiwkowy</Text>
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
        {status === 'confirming' && (
          <View style={s.statusPill}>
            <ActivityIndicator size="small" color={C.primaryLight} style={{ marginRight: 8 }} />
            <Text style={s.statusPillText}>Przetwarzanie płatności...</Text>
          </View>
        )}
        {status === 'error' && (
          <>
            <View style={s.errorPill}>
              <Text style={s.errorPillText}>{errorMsg}</Text>
            </View>
            {isCardError(errorMsg) || retryCount >= MAX_RETRIES ? (
              <TouchableOpacity style={s.retryBtn} onPress={() => navigation.goBack()}>
                <Text style={s.retryText}>Wróć</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={s.retryBtn} onPress={() => { setRetryCount(c => c + 1); initializeReader(); }}>
                <Text style={s.retryText}>Spróbuj ponownie ({MAX_RETRIES - retryCount} prób pozostało)</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={s.receiptBtn} onPress={() => setReceiptModalVisible(true)} activeOpacity={0.8}>
              <Text style={s.receiptBtnText}>Wyślij potwierdzenie na email</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Dół — metody płatności */}
      <View style={s.infoSection}>
        {status !== 'processing' && status !== 'confirming' && (
          <View style={s.readyNote}>
            <Text style={s.readyNoteText}>
              Upewnij się, że klient jest gotowy do płatności. Zainicjowana transakcja powinna zostać zrealizowana.
            </Text>
          </View>
        )}
        <View style={s.infoSectionDivider} />
        <Text style={s.infoSectionLabel}>Akceptowane metody płatności</Text>
        <View style={s.methodsRow}>
          {['VISA', 'Mastercard', 'Google Pay', 'Apple Pay'].map(m => (
            <View key={m} style={s.methodChip}>
              <Text style={s.methodChipText}>{m}</Text>
            </View>
          ))}
        </View>
        <View style={s.infoGrid}>
          {[
            'Brak dodatkowego\nsprzętu',
            'Wypłata na konto\nw 7 dni',
            'Szyfrowanie\nend-to-end',
            'Zgodność z\nnormą PCI DSS',
          ].map((txt) => (
            <View key={txt} style={s.infoGridItem}>
              <View style={s.infoGridIcon}><Text style={s.infoGridIconText}>✓</Text></View>
              <Text style={s.infoGridText}>{txt}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Modal paragonu po odrzuconej transakcji (wymaganie Apple 5.10) */}
      <Modal visible={receiptModalVisible} transparent animationType="fade" onRequestClose={() => setReceiptModalVisible(false)}>
        <KeyboardAvoidingView style={s.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.modalCard}>
            {receiptSent ? (
              <View style={s.sentWrap}>
                <Text style={s.sentCheck}>✓</Text>
                <Text style={s.sentText}>Wysłano!</Text>
              </View>
            ) : (
              <>
                <Text style={s.modalTitle}>Potwierdzenie transakcji</Text>
                <Text style={s.modalSub}>Podaj email klienta — wyślemy informację o transakcji na kwotę {(amount / 100).toFixed(2)} zł</Text>
                <TextInput
                  style={s.emailInput}
                  placeholder="email@klienta.pl"
                  placeholderTextColor={C.text3}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={receiptEmail}
                  onChangeText={setReceiptEmail}
                  autoFocus
                />
                {receiptError ? <Text style={s.errorText}>{receiptError}</Text> : null}
                <TouchableOpacity
                  style={[s.sendBtn, (!isValidEmail(receiptEmail) || receiptSending) && s.sendBtnDisabled]}
                  onPress={sendDeclinedReceipt}
                  disabled={!isValidEmail(receiptEmail) || receiptSending}
                  activeOpacity={0.85}
                >
                  {receiptSending ? <ActivityIndicator color="#fff" /> : <Text style={s.sendBtnText}>Wyślij</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={s.cancelBtn} onPress={() => setReceiptModalVisible(false)}>
                  <Text style={s.cancelBtnText}>Pomiń</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  merchantName: { fontSize: 18, fontWeight: '800', color: C.text1, marginBottom: 2 },
  merchantSub: { fontSize: 12, color: C.text3, fontWeight: '500' },

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
  readyNote: {
    marginBottom: 14, paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: 10, backgroundColor: 'rgba(99,102,241,0.06)',
    borderWidth: 1, borderColor: 'rgba(99,102,241,0.15)',
  },
  readyNoteText: { fontSize: 11, color: C.text3, textAlign: 'center', lineHeight: 16 },
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
  receiptBtn: {
    marginTop: 12, paddingVertical: 14, paddingHorizontal: 24,
    borderRadius: 16, borderWidth: 1, borderColor: C.cardBorder,
    backgroundColor: C.card, alignItems: 'center',
  },
  receiptBtnText: { fontSize: 13, fontWeight: '700', color: C.primaryLight },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 32 },
  modalCard: { width: '100%', backgroundColor: '#13102a', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 28, borderWidth: 1, borderColor: C.cardBorder },
  modalTitle: { fontSize: 20, fontWeight: '900', color: C.text1, marginBottom: 8, letterSpacing: -0.5 },
  modalSub: { fontSize: 13, color: C.text3, marginBottom: 20, lineHeight: 20 },
  emailInput: { borderWidth: 1.5, borderColor: C.cardBorder, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 18, color: C.text1, fontSize: 16, fontWeight: '600', backgroundColor: C.card, marginBottom: 14 },
  sendBtn: { paddingVertical: 18, borderRadius: 18, backgroundColor: C.primary, alignItems: 'center', marginBottom: 10 },
  sendBtnDisabled: { backgroundColor: C.text4 },
  sendBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  cancelBtn: { alignItems: 'center', paddingVertical: 12 },
  cancelBtnText: { color: C.text3, fontSize: 14, fontWeight: '600' },
  errorText: { fontSize: 12, color: C.error ?? '#f87171', textAlign: 'center', marginBottom: 8 },
  sentWrap: { alignItems: 'center', paddingVertical: 24 },
  sentCheck: { fontSize: 48, color: C.success, marginBottom: 8 },
  sentText: { fontSize: 22, fontWeight: '900', color: C.success },
});
