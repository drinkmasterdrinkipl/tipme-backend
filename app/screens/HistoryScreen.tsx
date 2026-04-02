// ============================================
// HistoryScreen.tsx — Historia napiwków
// ============================================

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../App';

interface Transaction {
  id: string;
  amount: number;
  paymentMethod: string;
  created: string;
  status: string;
}

export default function HistoryScreen() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [todayTotal, setTodayTotal] = useState(0);

  useEffect(() => {
    loadTransactions();
  }, []);

  const loadTransactions = async () => {
    try {
      const accountId = await AsyncStorage.getItem('stripeAccountId');
      const res = await fetch(`${API_URL}/api/transactions/${accountId}?limit=50`);
      const data = await res.json();
      setTransactions(data.transactions || []);
      setTodayTotal(
        (data.transactions || []).reduce((s: number, t: Transaction) => s + t.amount, 0)
      );
    } catch (e) {
      console.log('Load error:', e);
    } finally {
      setLoading(false);
    }
  };

  const renderItem = ({ item }: { item: Transaction }) => {
    const date = new Date(item.created);
    const time = date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });

    return (
      <View style={styles.item}>
        <View>
          <Text style={styles.itemAmount}>+{item.amount.toFixed(0)} zł</Text>
          <Text style={styles.itemMethod}>{item.paymentMethod}</Text>
        </View>
        <Text style={styles.itemTime}>{time}</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.brand}>📋 Historia</Text>
      </View>

      <View style={styles.hero}>
        <Text style={styles.heroLabel}>NAPIWKI DZIŚ</Text>
        <Text style={styles.heroAmount}>{todayTotal.toFixed(0)} zł</Text>
      </View>

      <Text style={styles.sectionLabel}>DZISIEJSZE NAPIWKI</Text>

      {loading ? (
        <ActivityIndicator color="#a855f7" style={{ marginTop: 40 }} />
      ) : transactions.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>💜</Text>
          <Text style={styles.emptyText}>Brak napiwków</Text>
          <Text style={styles.emptySub}>Pierwszy napiwek pojawi się tutaj</Text>
        </View>
      ) : (
        <FlatList
          data={transactions}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 100 }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0c0a13' },
  header: { paddingHorizontal: 22, paddingTop: 10, paddingBottom: 6 },
  brand: { fontSize: 20, fontWeight: '800', color: '#a855f7' },
  hero: { alignItems: 'center', paddingVertical: 20 },
  heroLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 2, color: '#a855f7' },
  heroAmount: { fontSize: 42, fontWeight: '900', color: '#f0eef5', letterSpacing: -2 },
  sectionLabel: {
    paddingHorizontal: 22, paddingTop: 14, paddingBottom: 8,
    fontSize: 10, fontWeight: '700', letterSpacing: 2, color: '#555',
  },
  item: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 22, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.03)',
  },
  itemAmount: { fontSize: 18, fontWeight: '800', color: '#34d399' },
  itemMethod: { fontSize: 12, color: '#555', marginTop: 2 },
  itemTime: { fontSize: 13, color: '#666', fontWeight: '600' },
  empty: { alignItems: 'center', marginTop: 60 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { fontSize: 16, fontWeight: '700', color: '#666' },
  emptySub: { fontSize: 13, color: '#444', marginTop: 4 },
});
