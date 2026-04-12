// ============================================
// Tip For Me — App.tsx
// ============================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Text, View, AppState, AppStateStatus, StatusBar } from 'react-native';
import { AppContext } from './AppContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { C } from './theme';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StripeTerminalProvider, useStripeTerminal } from '@stripe/stripe-terminal-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL, apiFetch } from './config';

import HomeScreen from './screens/HomeScreen';
import TapScreen from './screens/TapScreen';
import SuccessScreen from './screens/SuccessScreen';
import HistoryScreen from './screens/HistoryScreen';
import StatsScreen from './screens/StatsScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import WalletScreen from './screens/WalletScreen';
import SettingsScreen from './screens/SettingsScreen';
import TapToPayWelcomeScreen from './screens/TapToPayWelcomeScreen';
import TapToPayEducationScreen from './screens/TapToPayEducationScreen';
import StripeWebViewScreen from './screens/StripeWebViewScreen';
import AccountDetailsScreen from './screens/AccountDetailsScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const fetchTokenProvider = async () => {
  const accountId = await AsyncStorage.getItem('stripeAccountId');
  if (!accountId) throw new Error('Brak ID konta');
  const response = await apiFetch(`${API_URL}/api/connection-token`, {
    method: 'POST',
    body: JSON.stringify({ stripeAccountId: accountId }),
  });
  if (!response.ok) throw new Error(`Connection token fetch failed: ${response.status}`);
  const { secret } = await response.json();
  if (!secret) throw new Error('No connection token received');
  return secret;
};

// Warm-up Stripe Terminal przy starcie i powrocie z tła (wymaganie Apple 1.5)
function TerminalWarmup() {
  const { initialize } = useStripeTerminal();
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    initialize().catch(() => {});
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        initialize().catch(() => {});
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, [initialize]);

  return null;
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: C.surface,
          borderTopColor: C.cardBorder,
          paddingBottom: 8,
          paddingTop: 8,
          height: 85,
        },
        tabBarActiveTintColor: C.primaryLight,
        tabBarInactiveTintColor: C.text3,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen}
        options={{ tabBarLabel: 'Napiwek', tabBarIcon: ({ color }) => (
          <View style={{ width: 24, height: 24, borderRadius: 8, backgroundColor: color === C.primaryLight ? C.primaryFaint : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 14, color }}>⬡</Text>
          </View>
        )}}
      />
      <Tab.Screen name="History" component={HistoryScreen}
        options={{ tabBarLabel: 'Historia', tabBarIcon: ({ color }) => <Text style={{ fontSize: 18, color }}>≡</Text> }}
      />
      <Tab.Screen name="Stats" component={StatsScreen}
        options={{ tabBarLabel: 'Statystyki', tabBarIcon: ({ color }) => <Text style={{ fontSize: 16, color }}>◈</Text> }}
      />
      <Tab.Screen name="Wallet" component={WalletScreen}
        options={{ tabBarLabel: 'Portfel', tabBarIcon: ({ color }) => <Text style={{ fontSize: 16, color }}>◎</Text> }}
      />
      <Tab.Screen name="SettingsTab" component={SettingsScreen}
        options={{ tabBarLabel: 'Ustawienia', tabBarIcon: ({ color }) => <Text style={{ fontSize: 16, color }}>⚙</Text> }}
      />
    </Tab.Navigator>
  );
}


export default function App() {
  const [isOnboarded, setIsOnboarded] = useState<boolean | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const navigationRef = useRef<any>(null);
  const welcomeNavigatedRef = useRef(false);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem('stripeAccountId'),
      AsyncStorage.getItem('authToken'),
      AsyncStorage.getItem('tapToPayWelcomeShown'),
    ]).then(([id, token, welcomeShown]) => {
      setIsOnboarded(!!(id && token));
      // Jeśli zalogowany ale nigdy nie widział welcome — pokaż po załadowaniu
      if (id && token && !welcomeShown) setShowWelcome(true);
    }).catch(() => setIsOnboarded(false));
  }, []);

  const handleOnboardingComplete = useCallback(async () => {
    const welcomeShown = await AsyncStorage.getItem('tapToPayWelcomeShown');
    if (!welcomeShown) setShowWelcome(true);
    setIsOnboarded(true);
  }, []);

  // Po zalogowaniu — jeśli user nie widział welcome, nawiguj do niego
  // (osobny useEffect zamiast render prop, żeby SettingsScreen mógł też nawigować i przekazać własny onComplete)
  useEffect(() => {
    if (!isOnboarded || !showWelcome || welcomeNavigatedRef.current) return;
    const t = setTimeout(() => {
      if (!navigationRef.current) return;
      welcomeNavigatedRef.current = true;
      navigationRef.current.navigate('TapToPayWelcome' as never, {
        onComplete: async () => {
          await AsyncStorage.setItem('tapToPayWelcomeShown', 'true');
          setShowWelcome(false);
          welcomeNavigatedRef.current = false;
          navigationRef.current?.navigate('Main' as never);
        },
      } as never);
    }, 100);
    return () => clearTimeout(t);
  }, [isOnboarded, showWelcome]);

  const handleLogout = useCallback(() => {
    setIsOnboarded(false);
    setShowWelcome(false);
    welcomeNavigatedRef.current = false;
    // Reset backstack — user nie może trafić na stare ekrany po wylogowaniu
    setTimeout(() => {
      navigationRef.current?.reset({ index: 0, routes: [{ name: 'Onboarding' as never }] });
    }, 0);
  }, []);

  const contextValue = useMemo(() => ({ onLogout: handleLogout }), [handleLogout]);

  if (isOnboarded === null) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0c0a13', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 28, marginBottom: 16 }}>💜</Text>
        <Text style={{ color: '#a855f7', fontWeight: '800', fontSize: 18 }}>Tip For Me</Text>
      </View>
    );
  }

  return (
    <>
    <StatusBar barStyle="light-content" backgroundColor="#070511" />
    <AppContext.Provider value={contextValue}>
    <SafeAreaProvider>
      <StripeTerminalProvider tokenProvider={fetchTokenProvider} logLevel="none">
        {isOnboarded && <TerminalWarmup />}
        <NavigationContainer ref={navigationRef}>
          {!isOnboarded ? (
            <Stack.Navigator screenOptions={{ headerShown: false }}>
              <Stack.Screen name="Onboarding">
                {(props) => (
                  <OnboardingScreen
                    {...props}
                    onComplete={handleOnboardingComplete}
                  />
                )}
              </Stack.Screen>
              <Stack.Screen name="StripeWebView" component={StripeWebViewScreen} />
              <Stack.Screen name="AccountDetails" component={AccountDetailsScreen} />
            </Stack.Navigator>
          ) : (
            <Stack.Navigator
              screenOptions={{ headerShown: false }}
              initialRouteName="Main"
            >
              <Stack.Screen name="Main" component={MainTabs} />
              <Stack.Screen name="Tap" component={TapScreen} />
              <Stack.Screen name="Success" component={SuccessScreen} />
              <Stack.Screen name="TapToPayWelcome" component={TapToPayWelcomeScreen} />
              <Stack.Screen name="TapToPayEducation" component={TapToPayEducationScreen} />
              <Stack.Screen name="Settings" component={SettingsScreen} />
              <Stack.Screen name="StripeWebView" component={StripeWebViewScreen} />
              <Stack.Screen name="AccountDetails" component={AccountDetailsScreen} />
            </Stack.Navigator>
          )}
        </NavigationContainer>
      </StripeTerminalProvider>
    </SafeAreaProvider>
    </AppContext.Provider>
    </>
  );
}
