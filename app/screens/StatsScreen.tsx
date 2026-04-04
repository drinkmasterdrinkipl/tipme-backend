import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../config';
import { C } from '../theme';

// ─── Helpers ─────────────────────────────────────────────
const MONTHS = ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'];
const DAYS   = ['Pn','Wt','Śr','Cz','Pt','Sb','Nd'];

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function todayStr() { return toDateStr(new Date()); }

// ─── Calendar ────────────────────────────────────────────
function Calendar({ selected, onSelect }: { selected: string; onSelect: (d: string) => void }) {
  const [year, setYear]   = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());

  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const firstMon = firstDay === 0 ? 6 : firstDay - 1; // shift so Mon=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = todayStr();

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y-1); } else setMonth(m => m-1); };
  const nextMonth = () => {
    const now = new Date();
    if (year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth())) return;
    if (month === 11) { setMonth(0); setYear(y => y+1); } else setMonth(m => m+1);
  };

  const cells: (number|null)[] = [...Array(firstMon).fill(null), ...Array.from({length: daysInMonth}, (_,i) => i+1)];
  while (cells.length < 42) cells.push(null);

  return (
    <View style={cal.wrap}>
      {/* Nagłówek miesiąca */}
      <View style={cal.header}>
        <TouchableOpacity onPress={prevMonth} style={cal.navBtn}><Text style={cal.navArrow}>‹</Text></TouchableOpacity>
        <Text style={cal.monthTitle}>{MONTHS[month]} {year}</Text>
        <TouchableOpacity onPress={nextMonth} style={cal.navBtn}><Text style={cal.navArrow}>›</Text></TouchableOpacity>
      </View>

      {/* Dni tygodnia */}
      <View style={cal.row}>
        {DAYS.map(d => <Text key={d} style={cal.dayName}>{d}</Text>)}
      </View>

      {/* Siatka dni */}
      {Array.from({length: cells.length/7}, (_,w) => (
        <View key={w} style={cal.row}>
          {cells.slice(w*7, w*7+7).map((day, i) => {
            if (!day) return <View key={i} style={cal.cell} />;
            const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
            const isToday    = ds === today;
            const isSelected = ds === selected;
            const isFuture   = ds > today;
            return (
              <TouchableOpacity
                key={i}
                style={[cal.cell, isSelected && cal.cellSelected, isToday && !isSelected && cal.cellToday]}
                onPress={() => !isFuture && onSelect(ds)}
                disabled={isFuture}
                activeOpacity={0.7}
              >
                <Text style={[cal.dayNum, isSelected && cal.dayNumSelected, isFuture && cal.dayNumFuture, isToday && !isSelected && cal.dayNumToday]}>
                  {day}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────
export default function StatsScreen() {
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [stats, setStats]   = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadStats = useCallback(async (date: string) => {
    setLoading(true);
    try {
      const accountId = await AsyncStorage.getItem('stripeAccountId');
      const res = await fetch(`${API_URL}/api/stats/${accountId}?date=${date}`);
      const data = await res.json();
      setStats(data.today);
    } catch (e) {} finally { setLoading(false); }
  }, []);

  useEffect(() => { loadStats(selectedDate); }, [selectedDate]);

  const handleSelect = (date: string) => { setSelectedDate(date); };

  const total   = stats?.total || 0;
  const count   = stats?.count || 0;
  const average = stats?.average || 0;
  const net     = stats?.netAfterStripeFee || 0;
  const fee     = total - net;

  const isToday = selectedDate === todayStr();
  const dateLabel = isToday ? 'Dziś' : new Date(selectedDate + 'T12:00:00').toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <SafeAreaView style={s.root}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <Text style={s.title}>Statystyki</Text>
          <View style={s.dateBadge}>
            <Text style={s.dateBadgeText}>{dateLabel}</Text>
          </View>
        </View>

        {/* Kalendarz */}
        <Calendar selected={selectedDate} onSelect={handleSelect} />

        {/* Statystyki wybranego dnia */}
        {loading ? (
          <ActivityIndicator color={C.primary} style={{ marginTop: 32 }} />
        ) : (
          <>
            <View style={s.countCard}>
              <Text style={s.countLabel}>NAPIWKÓW</Text>
              <Text style={s.countValue}>{count}</Text>
              {count > 0 && <Text style={s.countSub}>średnio {average.toFixed(0)} zł / napiwek</Text>}
            </View>

            <View style={s.grid}>
              {[
                { label: 'ZEBRANO', value: `${total.toFixed(0)} zł`, color: C.primaryLight },
                { label: 'NETTO', value: `${net.toFixed(0)} zł`, color: C.success },
              ].map((c, i) => (
                <View key={i} style={s.card}>
                  <Text style={s.cardLabel}>{c.label}</Text>
                  <Text style={[s.cardValue, { color: c.color }]}>{c.value}</Text>
                </View>
              ))}
            </View>

            {total > 0 && (
              <View style={s.breakdown}>
                <Text style={s.breakdownTitle}>Rozliczenie</Text>
                {[
                  ['Napiwki brutto', `${total.toFixed(2)} zł`],
                  ['Prowizja Tip For Me (5%)', `−${(total * 0.05).toFixed(2)} zł`],
                  ['Opłata Stripe (~1.4%)', `−${(total * 0.014).toFixed(2)} zł`],
                  ['Twój zarobek netto', `${net.toFixed(2)} zł`],
                ].map(([label, val], i, arr) => (
                  <View key={i} style={[s.breakdownRow, i > 0 && s.breakdownBorder]}>
                    <Text style={s.breakdownLabel}>{label}</Text>
                    <Text style={[s.breakdownVal, i === arr.length-1 && { color: C.success, fontWeight: '800' }]}>{val}</Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: 16, paddingBottom: 12 },
  title: { fontSize: 20, fontWeight: '800', color: C.text1, letterSpacing: -0.5 },
  dateBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, backgroundColor: C.primaryFaint, borderWidth: 1, borderColor: C.cardBorderActive },
  dateBadgeText: { fontSize: 12, fontWeight: '700', color: C.primaryLight },
  countCard: { marginHorizontal: 24, marginTop: 4, marginBottom: 12, paddingVertical: 24, borderRadius: 22, backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder, alignItems: 'center' },
  countLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 3, color: C.text3, marginBottom: 6 },
  countValue: { fontSize: 56, fontWeight: '900', color: C.text1, letterSpacing: -3 },
  countSub: { fontSize: 12, color: C.text3, marginTop: 4 },
  grid: { flexDirection: 'row', paddingHorizontal: 20, gap: 10, marginBottom: 12 },
  card: { flex: 1, padding: 18, borderRadius: 20, backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder },
  cardLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 2, color: C.text3, marginBottom: 6 },
  cardValue: { fontSize: 24, fontWeight: '900', letterSpacing: -1 },
  breakdown: { marginHorizontal: 24, marginBottom: 40, borderRadius: 22, backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder, overflow: 'hidden' },
  breakdownTitle: { fontSize: 12, fontWeight: '800', color: C.text2, padding: 16, borderBottomWidth: 1, borderBottomColor: C.cardBorder },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  breakdownBorder: { borderTopWidth: 1, borderTopColor: C.cardBorder },
  breakdownLabel: { fontSize: 13, color: C.text3 },
  breakdownVal: { fontSize: 13, fontWeight: '700', color: C.text2 },
});

const cal = StyleSheet.create({
  wrap: { marginHorizontal: 24, marginBottom: 16, borderRadius: 22, backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder, padding: 14 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  navBtn: { width: 28, height: 28, borderRadius: 8, backgroundColor: C.primaryFaint, alignItems: 'center', justifyContent: 'center' },
  navArrow: { fontSize: 18, color: C.primaryLight, fontWeight: '700' },
  monthTitle: { fontSize: 14, fontWeight: '800', color: C.text1 },
  row: { flexDirection: 'row', marginBottom: 2 },
  dayName: { flex: 1, textAlign: 'center', fontSize: 9, fontWeight: '700', color: C.text3, letterSpacing: 0.5, paddingBottom: 4 },
  cell: { flex: 1, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  cellSelected: { backgroundColor: C.primary },
  cellToday: { backgroundColor: C.primaryFaint, borderWidth: 1, borderColor: C.cardBorderActive },
  dayNum: { fontSize: 12, fontWeight: '600', color: C.text2 },
  dayNumSelected: { color: C.white, fontWeight: '800' },
  dayNumFuture: { color: C.text4 },
  dayNumToday: { color: C.primaryLight, fontWeight: '800' },
});
