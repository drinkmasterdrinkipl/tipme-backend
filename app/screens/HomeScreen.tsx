import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, TextInput,
  StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Keyboard,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { useStripeTerminal } from '@stripe/stripe-terminal-react-native';
import { C } from '../theme';

const TIP_PRESETS = [5, 10, 15, 20, 30, 40, 50, 100, 200];

export default function HomeScreen({ navigation }: any) {
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [tapToPayEnabled, setTapToPayEnabled] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const warmupDoneRef = useRef(false);

  const { discoverReaders, connectReader, disconnectReader } = useStripeTerminal({
    // Wymaganie Apple 1.6: status pobieramy z SDK (Apple), nie z lokalnej zmiennej
    onUpdateDiscoveredReaders: (readers) => {
      if (readers.length > 0) {
        AsyncStorage.setItem('tapToPayEnabled', 'true').catch(() => {});
        setTapToPayEnabled(true);
      }
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
      await disconnectReader().catch(() => {});
      const { error } = await discoverReaders({ discoveryMethod: 'tapToPay', simulated: false });
      if (error) {
        // SDK zwrócił błąd — synchronizujemy stan z Apple
        await AsyncStorage.removeItem('tapToPayEnabled').catch(() => {});
        setTapToPayEnabled(false);
        return;
      }
      // onUpdateDiscoveredReaders zaktualizuje tapToPayEnabled gdy znajdzie czytnik
      warmupDoneRef.current = true;
    } catch { /* cicho — warmup nieblokujący */ }
  }, [discoverReaders, disconnectReader]);

  useFocusEffect(useCallback(() => {
    setNavigating(false);
    setSelectedPreset(null);   // reset kwoty po powrocie z płatności
    setCustomAmount('');
    // Odczyt wstępny z AsyncStorage dla natychmiastowego UI
    AsyncStorage.getItem('tapToPayEnabled').then(v => setTapToPayEnabled(v === 'true')).catch(() => {});
    // Wymaganie Apple 1.6: zawsze weryfikuj aktualny status z SDK
    warmupReader();
    return () => { warmupDoneRef.current = false; };
  }, [warmupReader]));

  const selectPreset = (val: number) => { setSelectedPreset(val); setCustomAmount(''); };
  const typeCustom = (val: string) => { setCustomAmount(val); setSelectedPreset(null); };

  const startPayment = () => {
    if (finalAmount < 2 || navigating) return;
    Keyboard.dismiss();
    setNavigating(true);
    if (!tapToPayEnabled) {
      // Wymaganie Apple 5.3: przycisk nigdy nie zablokowany — otwórz flow włączenia
      navigation.navigate('TapToPayWelcome', {
        onComplete: () => {
          AsyncStorage.setItem('tapToPayEnabled', 'true').then(() => {
            setTapToPayEnabled(true);
            navigation.navigate('Tap', { amount: Math.round(finalAmount * 100) });
          }).finally(() => setNavigating(false));
        },
      });
      return;
    }
    navigation.navigate('Tap', { amount: Math.round(finalAmount * 100) });
    // Reset po chwili — na wypadek gdyby user wrócił bez płatności
    setTimeout(() => setNavigating(false), 1000);
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

          {/* CTA — wewnątrz ScrollView */}
          <View style={s.ctaWrap}>
            <TouchableOpacity
              style={[s.cta, finalAmount >= 2 && s.ctaActive]}
              onPress={startPayment}
              activeOpacity={0.85}
            >
              <Text style={[s.ctaText, finalAmount >= 2 && s.ctaTextActive]}>
                {finalAmount >= 2
                  ? `Pobierz ${finalAmount % 1 === 0 ? finalAmount.toFixed(0) : finalAmount.toFixed(2)} zł`
                  : finalAmount > 0 ? 'Minimalna kwota: 2 zł' : 'Wybierz kwotę'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingBottom: 16 },
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
  ctaWrap: { paddingHorizontal: 24, paddingBottom: 16, paddingTop: 12 },
  cta: { paddingVertical: 20, borderRadius: 22, backgroundColor: C.text4, alignItems: 'center' },
  ctaActive: { backgroundColor: C.primary, shadowColor: C.primary, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.4, shadowRadius: 30 },
  ctaText: { fontSize: 17, fontWeight: '800', color: C.text3 },
  ctaTextActive: { color: C.white },
});
