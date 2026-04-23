import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, TextInput,
  StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Keyboard,
} from 'react-native';
import { SymbolView } from 'expo-symbols';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { useStripeTerminal } from '@stripe/stripe-terminal-react-native';
import { C } from '../theme';
import { API_URL, apiFetch } from '../config';

const TIP_PRESETS = [5, 10, 15, 20, 30, 40, 50, 100, 200];

export default function HomeScreen({ navigation }: any) {
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [tapToPayEnabled, setTapToPayEnabled] = useState(false);
  const [chargesEnabled, setChargesEnabled] = useState(true);
  const [navigating, setNavigating] = useState(false);
  const warmupDoneRef = useRef(false);
  const discoveredRef = useRef<any[]>([]);
  const navigatingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { initialize, discoverReaders, disconnectReader } = useStripeTerminal({
    // Wymaganie Apple 1.6: SDK potwierdza dostępność czytnika — ale NIE nadpisuje
    // świadomego wyboru usera (wyłączone w Ustawieniach = zostaje wyłączone)
    onUpdateDiscoveredReaders: (readers) => {
      discoveredRef.current = readers;
    },
  });

  const finalAmount = selectedPreset || parseFloat(customAmount.replace(',', '.')) || 0;

  // Wymaganie Apple 5.6 + 1.6: warmup czytnika i weryfikacja statusu z SDK (nie z AsyncStorage)
  const warmupReader = useCallback(async () => {
    try {
      // Wymaganie Apple 1.6: sprawdzamy registered users (locationId), nie lokalną flagę
      const locationId = await AsyncStorage.getItem('stripeLocationId');
      if (!locationId) return; // niezarejestrowany użytkownik
      if (warmupDoneRef.current) return;
      // Upewnij się że SDK jest zainicjalizowane przed wywołaniem discoverReaders
      // (TerminalWarmup może jeszcze nie skończyć initialize() — eliminuje race condition)
      await initialize().catch(() => {});
      await disconnectReader().catch(() => {});
      const { error } = await discoverReaders({ discoveryMethod: 'tapToPay', simulated: false });
      if (error) {
        // SDK zawiedzie = T&C mogą wymagać ponownej akceptacji — wyłącz tylko jeśli było włączone
        const wasEnabled = await AsyncStorage.getItem('tapToPayEnabled').catch(() => null);
        if (wasEnabled === 'true') {
          await AsyncStorage.removeItem('tapToPayEnabled').catch(() => {});
          setTapToPayEnabled(false);
        }
        return;
      }
      // SDK działa — nie nadpisuj wyboru usera (wyłączone zostaje wyłączone)
      warmupDoneRef.current = true;
    } catch { /* cicho — warmup nieblokujący */ }
  }, [discoverReaders, disconnectReader]);

  useFocusEffect(useCallback(() => {
    setNavigating(false);
    setSelectedPreset(null);   // reset kwoty po powrocie z płatności
    setCustomAmount('');
    // Odczyt wstępny z AsyncStorage dla natychmiastowego UI
    AsyncStorage.getItem('tapToPayEnabled').then(v => setTapToPayEnabled(v === 'true')).catch(() => {});
    // Sprawdź czy konto Stripe jest zweryfikowane
    AsyncStorage.getItem('stripeAccountId').then(async (accountId) => {
      if (!accountId) return;
      try {
        const res = await apiFetch(`${API_URL}/api/account-status/${accountId}`);
        if (!res.ok) return;
        const data = await res.json();
        setChargesEnabled(!!data.chargesEnabled);
      } catch { /* nie blokuj UI przy braku internetu */ }
    }).catch(() => {});
    // Wymaganie Apple 1.6: zawsze weryfikuj aktualny status z SDK
    warmupReader();
    return () => { warmupDoneRef.current = false; };
  }, [warmupReader]));

  const selectPreset = (val: number) => { setSelectedPreset(val); setCustomAmount(''); };
  const typeCustom = (val: string) => { setCustomAmount(val); setSelectedPreset(null); };

  const startPayment = () => {
    if (finalAmount < 5 || finalAmount > 1000 || navigating || !chargesEnabled) return;
    Keyboard.dismiss();
    if (!tapToPayEnabled) {
      // Wymaganie Apple 5.3: przycisk checkout automatycznie otwiera T&C Tap to Pay
      navigation.navigate('TapToPayWelcome', {});
      return;
    }
    setNavigating(true);
    navigation.navigate('Tap', { amount: Math.round(finalAmount * 100) });
    if (navigatingTimerRef.current) clearTimeout(navigatingTimerRef.current);
    navigatingTimerRef.current = setTimeout(() => setNavigating(false), 1000);
  };

  return (
    <SafeAreaView style={s.root}>
      {/* Header — zawsze na górze */}
      <View style={s.header}>
        <View>
          <Text style={s.brand}>Tip For Me</Text>
          <Text style={s.brandSub}>Terminal napiwkowy</Text>
        </View>
        <View style={s.badge}>
          <View style={s.badgeDot} />
          <Text style={s.badgeText}>Live</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Presety */}
          <Text style={s.sectionLabel}>WYBIERZ KWOTĘ</Text>
          <View style={s.presets}>
            {TIP_PRESETS.map((val) => (
              <TouchableOpacity
                key={val}
                style={[s.presetBtn, selectedPreset === val && s.presetBtnActive]}
                onPress={() => selectPreset(val)}
                activeOpacity={0.7}
                accessibilityLabel={`Napiwek ${val} złotych`}
                accessibilityRole="button"
                accessibilityState={{ selected: selectedPreset === val }}
              >
                <Text style={[s.presetVal, selectedPreset === val && s.presetValActive]}>{val}</Text>
                <Text style={[s.presetCurr, selectedPreset === val && s.presetCurrActive]}>zł</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Własna kwota */}
          <View style={s.customWrap}>
            <Text style={s.sectionLabel}>LUB WPISZ</Text>
            <View style={s.inputRow}>
              <TextInput
                style={s.input}
                placeholder="0"
                placeholderTextColor={C.text4}
                keyboardType="decimal-pad"
                value={customAmount}
                onChangeText={typeCustom}
              />
              <View style={s.inputCurrBox}>
                <Text style={s.inputCurr}>zł</Text>
              </View>
            </View>
          </View>

          {/* Baner weryfikacji — widoczny gdy konto niezweryfikowane */}
          {!chargesEnabled && (
            <View style={s.verifyBanner}>
              <Text style={s.verifyIcon}>⏳</Text>
              <View style={s.verifyTextWrap}>
                <Text style={s.verifyTitle}>Konto w trakcie weryfikacji</Text>
                <Text style={s.verifyDesc}>Stripe weryfikuje Twoje dane. Płatności zostaną odblokowane automatycznie po zatwierdzeniu konta — zazwyczaj do 24h.</Text>
              </View>
            </View>
          )}
        </ScrollView>

        {/* CTA — poza ScrollView, zawsze widoczny (wymaganie Apple 5.2) */}
        <View style={s.ctaWrap}>
          <TouchableOpacity
            style={[s.cta, finalAmount >= 5 && finalAmount <= 1000 && chargesEnabled && s.ctaActive]}
            onPress={startPayment}
            activeOpacity={0.85}
          >
            <View style={s.ctaInner}>
              {finalAmount >= 5 && chargesEnabled && (
                <SymbolView
                  name="wave.3.right.circle.fill"
                  size={22}
                  tintColor="#fff"
                  style={{ marginRight: 8 }}
                />
              )}
              <Text style={[s.ctaText, finalAmount >= 5 && finalAmount <= 1000 && chargesEnabled && s.ctaTextActive]}>
                {!chargesEnabled
                  ? 'Oczekiwanie na weryfikację Stripe'
                  : finalAmount > 1000
                    ? 'Maksymalna kwota: 1000 zł'
                    : finalAmount >= 5
                      ? `Tap to Pay on iPhone · ${finalAmount % 1 === 0 ? finalAmount.toFixed(0) : finalAmount.toFixed(2)} zł`
                      : finalAmount > 0 ? 'Minimalna kwota: 5 zł' : 'Wybierz kwotę'}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scroll: { flexGrow: 1, paddingBottom: 8, paddingTop: 8, justifyContent: 'center' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8,
  },
  brand: { fontSize: 20, fontWeight: '800', color: C.text1, letterSpacing: -0.5 },
  brandSub: { fontSize: 11, color: C.text3, marginTop: 1, fontWeight: '500' },
  badge: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10,
    paddingVertical: 5, borderRadius: 20, backgroundColor: C.successFaint,
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.2)', gap: 5,
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.success },
  badgeText: { fontSize: 11, fontWeight: '700', color: C.success },
  sectionLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 2.5, color: C.text3, paddingHorizontal: 24, marginBottom: 12 },
  presets: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', paddingHorizontal: 16, gap: 8, marginBottom: 16 },
  presetBtn: {
    width: '31%', paddingVertical: 18, borderRadius: 20,
    borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.card,
    alignItems: 'center', justifyContent: 'center',
  },
  presetBtnActive: { borderColor: C.cardBorderActive, backgroundColor: C.primaryFaint },
  presetVal: { fontSize: 28, fontWeight: '900', color: C.text3 },
  presetValActive: { color: C.text1 },
  presetCurr: { fontSize: 11, fontWeight: '700', color: C.text4, marginTop: 1 },
  presetCurrActive: { color: C.primaryLight },
  customWrap: { paddingHorizontal: 24, marginBottom: 10 },
  inputRow: {
    flexDirection: 'row', borderRadius: 18,
    borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.card, overflow: 'hidden',
  },
  input: { flex: 1, paddingVertical: 14, paddingHorizontal: 20, color: C.text1, fontSize: 26, fontWeight: '800', textAlign: 'center' },
  inputCurrBox: { justifyContent: 'center', paddingHorizontal: 18, borderLeftWidth: 1, borderLeftColor: C.cardBorder },
  inputCurr: { fontSize: 15, fontWeight: '700', color: C.text3 },
  verifyBanner: {
    marginHorizontal: 24, marginBottom: 12, borderRadius: 16,
    backgroundColor: 'rgba(245,158,11,0.08)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)',
    padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 10,
  },
  verifyIcon: { fontSize: 20, marginTop: 1 },
  verifyTextWrap: { flex: 1 },
  verifyTitle: { fontSize: 13, fontWeight: '700', color: '#F59E0B', marginBottom: 4 },
  verifyDesc: { fontSize: 12, color: C.text3, lineHeight: 18 },
  ctaWrap: { paddingHorizontal: 24, paddingBottom: 16, paddingTop: 12, backgroundColor: C.bg },
  cta: { paddingVertical: 20, borderRadius: 22, backgroundColor: C.text4, alignItems: 'center' },
  ctaInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  ctaActive: { backgroundColor: C.primary, shadowColor: C.primary, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.4, shadowRadius: 30 },
  ctaText: { fontSize: 17, fontWeight: '800', color: C.text3 },
  ctaTextActive: { color: C.white },
});
