import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, TextInput,
  StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { API_URL, apiFetch } from '../config';
import { C } from '../theme';
import { useRefreshOnNewDay } from '../hooks/useRefreshOnNewDay';

const TIP_PRESETS = [5, 10, 15, 20, 30, 50];

export default function HomeScreen({ navigation }: any) {
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [todayTotal, setTodayTotal] = useState(0);
  const [todayCount, setTodayCount] = useState(0);
  const [tapToPayEnabled, setTapToPayEnabled] = useState(false);

  const finalAmount = selectedPreset || parseFloat(customAmount) || 0;

  useFocusEffect(useCallback(() => {
    loadStats();
    AsyncStorage.getItem('tapToPayEnabled').then(v => setTapToPayEnabled(v === 'true'));
  }, []));

  useRefreshOnNewDay(useCallback(() => {
    loadStats();
  }, []));

  const loadStats = async () => {
    try {
      const accountId = await AsyncStorage.getItem('stripeAccountId');
      if (!accountId) return;
      const res = await apiFetch(`${API_URL}/api/stats/${accountId}`);
      if (!res.ok) return;
      const data = await res.json();
      setTodayTotal(data.today?.total ?? 0);
      setTodayCount(data.today?.count ?? 0);
    } catch {
      // Sieć niedostępna — zostaw 0, użytkownik zobaczy dane przy odświeżeniu
    }
  };

  const selectPreset = (val: number) => { setSelectedPreset(val); setCustomAmount(''); };
  const typeCustom = (val: string) => { setCustomAmount(val); setSelectedPreset(null); };

  const startPayment = () => {
    if (!tapToPayEnabled) {
      Alert.alert('Tap to Pay wyłączony', 'Włącz Tap to Pay w Ustawieniach, aby przyjmować płatności.');
      return;
    }
    if (finalAmount < 2) return;
    navigation.navigate('Tap', { amount: Math.round(finalAmount * 100) });
  };

  return (
    <SafeAreaView style={s.root}>
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
          {/* Header */}
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

          {/* Hero */}
          <View style={s.hero}>
            <Text style={s.heroLabel}>NAPIWKI DZIŚ</Text>
            <Text style={s.heroAmount}>
              {todayTotal.toFixed(0)}
              <Text style={s.heroCurrency}> zł</Text>
            </Text>
            <View style={s.heroDivider} />
            <Text style={s.heroSub}>
              {todayCount === 0
                ? 'Brak napiwków — zacznij teraz'
                : `${todayCount} ${
                    todayCount === 1 ? 'napiwek' :
                    (todayCount % 10 >= 2 && todayCount % 10 <= 4 && (todayCount % 100 < 10 || todayCount % 100 >= 20)) ? 'napiwki' :
                    'napiwków'
                  } dzisiaj`}
            </Text>
          </View>

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
              style={[s.cta, tapToPayEnabled && finalAmount >= 2 && s.ctaActive]}
              onPress={startPayment}
              activeOpacity={0.85}
            >
              <Text style={[s.ctaText, tapToPayEnabled && finalAmount >= 2 && s.ctaTextActive]}>
                {!tapToPayEnabled
                  ? 'Włącz Tap to Pay w Ustawieniach'
                  : finalAmount >= 2
                    ? `Pobierz  ${finalAmount % 1 === 0 ? finalAmount.toFixed(0) : finalAmount.toFixed(2)} zł`
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
  scroll: { paddingBottom: 40 },
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
  hero: { alignItems: 'center', paddingVertical: 20, paddingHorizontal: 24 },
  heroLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 3, color: C.text3, marginBottom: 8 },
  heroAmount: { fontSize: 60, fontWeight: '900', color: C.text1, letterSpacing: -3, lineHeight: 64 },
  heroCurrency: { fontSize: 32, fontWeight: '700', color: C.text2, letterSpacing: 0 },
  heroDivider: { width: 32, height: 2, borderRadius: 1, backgroundColor: C.primaryLight, marginVertical: 14, opacity: 0.4 },
  heroSub: { fontSize: 13, color: C.text3, fontWeight: '500' },
  sectionLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 2.5, color: C.text3, paddingHorizontal: 24, marginBottom: 12 },
  presets: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 20, gap: 10, marginBottom: 28 },
  presetBtn: {
    width: '30%', paddingVertical: 20, borderRadius: 20,
    borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.card,
    alignItems: 'center', justifyContent: 'center',
  },
  presetBtnActive: { borderColor: C.cardBorderActive, backgroundColor: C.primaryFaint },
  presetVal: { fontSize: 26, fontWeight: '900', color: C.text3 },
  presetValActive: { color: C.text1 },
  presetCurr: { fontSize: 11, fontWeight: '700', color: C.text4, marginTop: 1 },
  presetCurrActive: { color: C.primaryLight },
  customWrap: { paddingHorizontal: 24, marginBottom: 16 },
  inputRow: {
    flexDirection: 'row', borderRadius: 18,
    borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.card, overflow: 'hidden',
  },
  input: { flex: 1, paddingVertical: 18, paddingHorizontal: 20, color: C.text1, fontSize: 28, fontWeight: '800', textAlign: 'center' },
  inputCurrBox: { justifyContent: 'center', paddingHorizontal: 18, borderLeftWidth: 1, borderLeftColor: C.cardBorder },
  inputCurr: { fontSize: 15, fontWeight: '700', color: C.text3 },
  ctaWrap: { paddingHorizontal: 24, paddingBottom: 32, paddingTop: 24 },
  cta: { paddingVertical: 20, borderRadius: 22, backgroundColor: C.text4, alignItems: 'center' },
  ctaActive: { backgroundColor: C.primary, shadowColor: C.primary, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.4, shadowRadius: 30 },
  ctaText: { fontSize: 17, fontWeight: '800', color: C.text3 },
  ctaTextActive: { color: C.white },
});
