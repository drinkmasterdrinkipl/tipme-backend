// ============================================
// HomeScreen.tsx — Ekran wyboru kwoty napiwku
// ============================================

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../App';

const TIP_PRESETS = [5, 10, 15, 20, 30, 50];

export default function HomeScreen({ navigation }: any) {
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [todayTotal, setTodayTotal] = useState(0);
  const [todayCount, setTodayCount] = useState(0);

  const finalAmount = selectedPreset || parseFloat(customAmount) || 0;

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const accountId = await AsyncStorage.getItem('stripeAccountId');
      const res = await fetch(`${API_URL}/api/stats/${accountId}`);
      const data = await res.json();
      setTodayTotal(data.today.total);
      setTodayCount(data.today.count);
    } catch (e) {
      console.log('Stats error:', e);
    }
  };

  const selectPreset = (val: number) => {
    setSelectedPreset(val);
    setCustomAmount('');
  };

  const typeCustom = (val: string) => {
    setCustomAmount(val);
    setSelectedPreset(null);
  };

  const startPayment = () => {
    if (finalAmount <= 0) return;
    // Nawiguj do ekranu Tap to Pay z kwotą w groszach
    navigation.navigate('Tap', { amount: Math.round(finalAmount * 100) });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.brand}>💜 TipMe</Text>
        </View>

        {/* Dzisiejsze podsumowanie */}
        <View style={styles.hero}>
          <Text style={styles.heroLabel}>NAPIWKI DZIŚ</Text>
          <Text style={styles.heroAmount}>{todayTotal.toFixed(0)} zł</Text>
          <Text style={styles.heroSub}>{todayCount} napiwków</Text>
        </View>

        {/* Presety kwot */}
        <View style={styles.presets}>
          {TIP_PRESETS.map((val) => (
            <TouchableOpacity
              key={val}
              style={[
                styles.presetBtn,
                selectedPreset === val && styles.presetBtnActive,
              ]}
              onPress={() => selectPreset(val)}
            >
              <Text
                style={[
                  styles.presetText,
                  selectedPreset === val && styles.presetTextActive,
                ]}
              >
                {val} zł
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Własna kwota */}
        <View style={styles.customSection}>
          <Text style={styles.dividerText}>lub wpisz kwotę</Text>
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.input}
              placeholder="Inna kwota"
              placeholderTextColor="#444"
              keyboardType="decimal-pad"
              value={customAmount}
              onChangeText={typeCustom}
            />
            <Text style={styles.currency}>zł</Text>
          </View>
        </View>
      </ScrollView>

      {/* Przycisk płatności */}
      <View style={styles.paySection}>
        <TouchableOpacity
          style={[styles.payBtn, finalAmount > 0 && styles.payBtnReady]}
          onPress={startPayment}
          disabled={finalAmount <= 0}
        >
          <Text style={[styles.payText, finalAmount > 0 && styles.payTextReady]}>
            {finalAmount > 0
              ? `💳 Pobierz napiwek ${finalAmount.toFixed(0)} zł`
              : 'Wybierz kwotę napiwku'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0c0a13',
  },
  scroll: {
    paddingBottom: 120,
  },
  header: {
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 6,
  },
  brand: {
    fontSize: 22,
    fontWeight: '800',
    color: '#a855f7',
  },
  hero: {
    alignItems: 'center',
    paddingVertical: 28,
  },
  heroLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    color: '#a855f7',
    marginBottom: 6,
  },
  heroAmount: {
    fontSize: 44,
    fontWeight: '900',
    color: '#f0eef5',
    letterSpacing: -2,
  },
  heroSub: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
  presets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 22,
    gap: 10,
  },
  presetBtn: {
    width: '30%',
    paddingVertical: 22,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(168,85,247,0.12)',
    backgroundColor: 'rgba(255,255,255,0.025)',
    alignItems: 'center',
  },
  presetBtnActive: {
    borderColor: 'rgba(168,85,247,0.5)',
    backgroundColor: 'rgba(168,85,247,0.12)',
  },
  presetText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#ccc',
  },
  presetTextActive: {
    color: '#e0d4f7',
  },
  customSection: {
    paddingHorizontal: 22,
    paddingTop: 24,
  },
  dividerText: {
    textAlign: 'center',
    fontSize: 11,
    color: '#555',
    fontWeight: '600',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 14,
  },
  inputWrap: {
    position: 'relative',
  },
  input: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(168,85,247,0.15)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  currency: {
    position: 'absolute',
    right: 18,
    top: 18,
    color: '#666',
    fontSize: 14,
    fontWeight: '700',
  },
  paySection: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 22,
    paddingBottom: 36,
    backgroundColor: '#0c0a13',
  },
  payBtn: {
    paddingVertical: 18,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
  },
  payBtnReady: {
    backgroundColor: '#a855f7',
    shadowColor: '#a855f7',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
  },
  payText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#444',
  },
  payTextReady: {
    color: '#fff',
  },
});
