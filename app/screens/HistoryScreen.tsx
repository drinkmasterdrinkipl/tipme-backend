import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL, apiFetch } from '../config';
import { C } from '../theme';
import { useRefreshOnNewDay } from '../hooks/useRefreshOnNewDay';

const PAGE_SIZE = 15;
const DEMO_MODE = false;

const today = new Date().toISOString();
const yesterday = new Date(Date.now() - 86400000).toISOString();
const DEMO_TRANSACTIONS = [
  { id: '1', amount: 20, paymentMethod: 'Visa', created: today, status: 'succeeded' },
  { id: '2', amount: 15, paymentMethod: 'Mastercard', created: today, status: 'succeeded' },
  { id: '3', amount: 30, paymentMethod: 'Apple Pay', created: yesterday, status: 'succeeded' },
  { id: '4', amount: 10, paymentMethod: 'Visa', created: yesterday, status: 'succeeded' },
];

interface Transaction { id: string; amount: number; paymentMethod: string; created: string; status: string; }
type ListItem = { type: 'header'; label: string } | { type: 'tx' } & Transaction;

function toPlDate(d: Date) {
  // Polska strefa: UTC+1 zima, UTC+2 lato
  const jan = new Date(d.getFullYear(), 0, 1).getTimezoneOffset();
  const jul = new Date(d.getFullYear(), 6, 1).getTimezoneOffset();
  const isDST = d.getTimezoneOffset() < Math.max(jan, jul);
  const plOffset = isDST ? 2 : 1;
  const pl = new Date(d.getTime() + plOffset * 3600000);
  return `${pl.getUTCFullYear()}-${String(pl.getUTCMonth()+1).padStart(2,'0')}-${String(pl.getUTCDate()).padStart(2,'0')}`;
}
function todayStr() { return toPlDate(new Date()); }
function yesterdayStr() { return toPlDate(new Date(Date.now() - 86400000)); }
function dateLabel(dateStr: string): string {
  const t = todayStr();
  const y = yesterdayStr();
  if (dateStr === t) return 'Dzisiaj';
  if (dateStr === y) return 'Wczoraj';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });
}

function txDateStr(isoStr: string): string {
  return toPlDate(new Date(isoStr));
}

function groupByDay(txs: Transaction[]): ListItem[] {
  const result: ListItem[] = [];
  let lastDay = '';
  for (const tx of txs) {
    const day = txDateStr(tx.created);
    if (day !== lastDay) {
      result.push({ type: 'header', label: dateLabel(day) });
      lastDay = day;
    }
    result.push({ type: 'tx', ...tx });
  }
  return result;
}

export default function HistoryScreen() {
  const [transactions, setTransactions] = useState<Transaction[]>(DEMO_MODE ? DEMO_TRANSACTIONS : []);
  const [loading, setLoading] = useState(!DEMO_MODE);
  const [todayTotal, setTodayTotal] = useState(DEMO_MODE ? 35 : 0);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const accountId = await AsyncStorage.getItem('stripeAccountId');
      if (!accountId) throw new Error('Brak ID konta. Zaloguj się ponownie.');
      const res = await apiFetch(`${API_URL}/api/transactions/${accountId}?limit=100`);
      if (!res.ok) throw new Error(`Błąd serwera (${res.status})`);
      const data = await res.json();
      const txs: Transaction[] = data.transactions || [];
      setTransactions(txs);
      setPage(1);
      const today = todayStr();
      setTodayTotal(txs.filter(t => txDateStr(t.created) === today).reduce((s, t) => s + t.amount, 0));
    } catch (e: any) {
      setError(e.message || 'Nie udało się pobrać historii');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (!DEMO_MODE) loadTransactions(); }, [loadTransactions]);
  useRefreshOnNewDay(useCallback(() => { if (!DEMO_MODE) loadTransactions(); }, [loadTransactions]));

  const totalPages = Math.max(1, Math.ceil(transactions.length / PAGE_SIZE));
  const pageTxs = transactions.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const items = groupByDay(pageTxs);

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
          <TouchableOpacity onPress={loadTransactions} style={s.retryBtn}>
            <Text style={{ color: C.primaryLight, fontWeight: '700' }}>Odśwież</Text>
          </TouchableOpacity>
        </View>
      ) : transactions.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyTitle}>Brak transakcji</Text>
          <Text style={s.emptySub}>Pierwsza płatność pojawi się tutaj</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.list}>
          {items.map((item, idx) => {
            if (item.type === 'header') {
              return (
                <View key={`h-${idx}`} style={s.dayHeader}>
                  <Text style={s.dayHeaderText}>{item.label}</Text>
                </View>
              );
            }
            const tx = item as Transaction & { type: 'tx' };
            const time = new Date(tx.created).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
            return (
              <View key={tx.id} style={s.item}>
                <View style={s.itemLeft}>
                  <View style={s.itemIcon}><Text style={s.itemIconText}>↑</Text></View>
                  <View>
                    <Text style={s.itemMethod}>{tx.paymentMethod}</Text>
                    <Text style={s.itemTime}>{time}</Text>
                  </View>
                </View>
                <Text style={s.itemAmount}>+{tx.amount.toFixed(0)} zł</Text>
              </View>
            );
          })}

          {/* Paginacja */}
          {totalPages > 1 && (
            <View style={s.pagination}>
              <TouchableOpacity
                style={[s.pageBtn, page === 1 && s.pageBtnDisabled]}
                onPress={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <Text style={[s.pageBtnText, page === 1 && s.pageBtnTextDisabled]}>‹</Text>
              </TouchableOpacity>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <TouchableOpacity
                  key={p}
                  style={[s.pageBtn, p === page && s.pageBtnActive]}
                  onPress={() => setPage(p)}
                >
                  <Text style={[s.pageBtnText, p === page && s.pageBtnTextActive]}>{p}</Text>
                </TouchableOpacity>
              ))}

              <TouchableOpacity
                style={[s.pageBtn, page === totalPages && s.pageBtnDisabled]}
                onPress={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                <Text style={[s.pageBtnText, page === totalPages && s.pageBtnTextDisabled]}>›</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
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
  list: { paddingHorizontal: 24, paddingBottom: 40 },
  dayHeader: { paddingTop: 20, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: C.cardBorder, marginBottom: 4 },
  dayHeaderText: { fontSize: 12, fontWeight: '800', color: C.text2, letterSpacing: 0.5 },
  item: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.cardBorder,
  },
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
  retryBtn: { marginTop: 12, paddingVertical: 10, paddingHorizontal: 24, borderRadius: 12, borderWidth: 1, borderColor: C.cardBorder },
  pagination: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, paddingTop: 28, paddingBottom: 20 },
  pageBtn: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  pageBtnActive: { backgroundColor: C.primary, borderColor: C.primary },
  pageBtnDisabled: { opacity: 0.3 },
  pageBtnText: { fontSize: 15, fontWeight: '700', color: C.text2 },
  pageBtnTextActive: { color: C.white },
  pageBtnTextDisabled: { color: C.text4 },
});
