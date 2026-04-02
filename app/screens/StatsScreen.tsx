// ============================================
// StatsScreen.tsx — Statystyki napiwków
// ============================================

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../App';

export default function StatsScreen() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const accountId = await AsyncStorage.getItem('stripeAccountId');
      const res = await fetch(`${API_URL}/api/stats/${accountId}`);
      const data = await res.json();
      setStats(data.today);
    } catch (e) {
      console.log('Stats error:', e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color="#a855f7" style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  const total = stats?.total || 0;
  const count = stats?.count || 0;
  const average = stats?.average || 0;
  const net = stats?.netAfterStripeFee || 0;
  const stripeFee = total - net;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView>
        <View style={styles.header}>
          <Text style={styles.brand}>📊 Statystyki</Text>
        </View>

        {/* Cards */}
        <View style={styles.grid}>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>ZEBRANO</Text>
            <Text style={[styles.cardValue, { color: '#c084fc' }]}>{total.toFixed(0)} zł</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>NETTO</Text>
            <Text style={[styles.cardValue, { color: '#34d399' }]}>{net.toFixed(0)} zł</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>PROWIZJA</Text>
            <Text style={[styles.cardValue, { color: '#fb923c' }]}>{stripeFee.toFixed(0)} zł</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>ŚREDNI TIP</Text>
            <Text style={[styles.cardValue, { color: '#c084fc' }]}>{average.toFixed(0)} zł</Text>
          </View>
        </View>

        {/* Licznik */}
        <View style={styles.counterSection}>
          <Text style={styles.counterLabel}>LICZBA NAPIWKÓW DZIŚ</Text>
          <Text style={styles.counterValue}>{count}</Text>
        </View>

        {/* Info */}
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>💡 Jak to działa</Text>
          <Text style={styles.infoText}>
            Każdy napiwek trafia przez Stripe na Twoje konto bankowe.{'\n\n'}
            Prowizja Stripe: ~1.4% za transakcję{'\n'}
            Prowizja TipMe: 5% od napiwku{'\n\n'}
            Wypłaty na konto bankowe realizowane są automatycznie
            zgodnie z harmonogramem ustawionym w Stripe Dashboard.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0c0a13' },
  header: { paddingHorizontal: 22, paddingTop: 10, paddingBottom: 16 },
  brand: { fontSize: 20, fontWeight: '800', color: '#a855f7' },
  grid: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: 22, gap: 12,
  },
  card: {
    width: '47%', padding: 18, borderRadius: 18,
    backgroundColor: 'rgba(168,85,247,0.06)',
    borderWidth: 1, borderColor: 'rgba(168,85,247,0.1)',
  },
  cardLabel: {
    fontSize: 10, fontWeight: '700', letterSpacing: 1.5, color: '#777',
  },
  cardValue: {
    fontSize: 28, fontWeight: '900', letterSpacing: -1, marginTop: 4,
  },
  counterSection: {
    alignItems: 'center', paddingVertical: 28,
  },
  counterLabel: {
    fontSize: 10, fontWeight: '700', letterSpacing: 2, color: '#555',
  },
  counterValue: {
    fontSize: 48, fontWeight: '900', color: '#c084fc', letterSpacing: -2, marginTop: 4,
  },
  infoBox: {
    marginHorizontal: 22, padding: 20, borderRadius: 18,
    backgroundColor: 'rgba(168,85,247,0.04)',
    borderWidth: 1, borderColor: 'rgba(168,85,247,0.08)',
    marginBottom: 100,
  },
  infoTitle: {
    fontSize: 15, fontWeight: '800', color: '#c084fc', marginBottom: 10,
  },
  infoText: {
    fontSize: 13, color: '#777', lineHeight: 22,
  },
});
