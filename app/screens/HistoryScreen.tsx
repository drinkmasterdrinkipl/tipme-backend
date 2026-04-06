import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL, apiFetch } from '../config';
import { C } from '../theme';

interface Transaction { id: string; amount: number; paymentMethod: string; created: string; status: string; }

export default function HistoryScreen() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [todayTotal, setTodayTotal] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => { loadTransactions(); }, []);

  const loadTransactions = async () => {
    setError('');
    try {
      const accountId = await AsyncStorage.getItem('stripeAccountId');
      if (!accountId) throw new Error('Brak ID konta. Zaloguj się ponownie.');
      const res = await apiFetch(`${API_URL}/api/transactions/${accountId}?limit=50`);
      if (!res.ok) throw new Error(`Błąd serwera (${res.status})`);
      const data = await res.json();
      const txs: Transaction[] = data.transactions || [];
      setTransactions(txs);
      const todayStr = new Date().toISOString().slice(0, 10);
      setTodayTotal(txs.filter(t => t.created.slice(0, 10) === todayStr).reduce((s, t) => s + t.amount, 0));
    } catch (e: any) {
      setError(e.message || 'Nie udało się pobrać historii');
    } finally { setLoading(false); }
  };

  const renderItem = ({ item, index }: { item: Transaction; index: number }) => {
    const date = new Date(item.created);
    const time = date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
    return (
      <View style={[s.item, index === 0 && s.itemFirst]}>
        <View style={s.itemLeft}>
          <View style={s.itemIcon}><Text style={s.itemIconText}>↑</Text></View>
          <View>
            <Text style={s.itemMethod}>{item.paymentMethod}</Text>
            <Text style={s.itemTime}>{time}</Text>
          </View>
        </View>
        <Text style={s.itemAmount}>+{item.amount.toFixed(0)} zł</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={s.root}>
      <View style={s.header}>
        <Text style={s.title}>Historia</Text>
        <TouchableOpacity style={s.refreshBtn} onPress={loadTransactions}>
          <Text style={s.refreshText}>↻</Text>
        </TouchableOpacity>
      </View>

      <View style={s.heroCard}>
        <Text style={s.heroLabel}>ZEBRANO DZIŚ</Text>
        <Text style={s.heroAmount}>{todayTotal.toFixed(0)}<Text style={s.heroCurr}> zł</Text></Text>
      </View>

      <Text style={s.sectionLabel}>TRANSAKCJE</Text>

      {loading ? (
        <ActivityIndicator color={C.primary} style={{ marginTop: 40 }} />
      ) : error ? (
        <View style={s.empty}>
          <Text style={[s.emptyTitle, { color: C.error }]}>{error}</Text>
          <TouchableOpacity onPress={loadTransactions} style={{ marginTop: 12, paddingVertical: 10, paddingHorizontal: 24, borderRadius: 12, borderWidth: 1, borderColor: C.cardBorder }}>
            <Text style={{ color: C.primaryLight, fontWeight: '700' }}>Odśwież</Text>
          </TouchableOpacity>
        </View>
      ) : transactions.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyTitle}>Brak transakcji</Text>
          <Text style={s.emptySub}>Pierwsza płatność pojawi się tutaj</Text>
        </View>
      ) : (
        <FlatList
          data={transactions}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8 },
  title: { fontSize: 20, fontWeight: '800', color: C.text1, letterSpacing: -0.5 },
  refreshBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder, alignItems: 'center', justifyContent: 'center' },
  refreshText: { fontSize: 18, color: C.text3 },
  heroCard: {
    marginHorizontal: 24, marginTop: 8, marginBottom: 24,
    paddingVertical: 28, borderRadius: 24,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder,
    alignItems: 'center',
  },
  heroLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 3, color: C.text3, marginBottom: 10 },
  heroAmount: { fontSize: 52, fontWeight: '900', color: C.text1, letterSpacing: -3 },
  heroCurr: { fontSize: 22, fontWeight: '700', color: C.text2 },
  sectionLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 2.5, color: C.text3, paddingHorizontal: 24, marginBottom: 8 },
  list: { paddingHorizontal: 24, paddingBottom: 100 },
  item: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.cardBorder,
  },
  itemFirst: {},
  itemLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  itemIcon: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: C.successFaint, borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.2)', alignItems: 'center', justifyContent: 'center',
  },
  itemIconText: { fontSize: 16, color: C.success, fontWeight: '800' },
  itemMethod: { fontSize: 14, fontWeight: '700', color: C.text1 },
  itemTime: { fontSize: 12, color: C.text3, marginTop: 2 },
  itemAmount: { fontSize: 18, fontWeight: '900', color: C.success },
  empty: { alignItems: 'center', marginTop: 80 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: C.text3, marginBottom: 6 },
  emptySub: { fontSize: 13, color: C.text4 },
});
