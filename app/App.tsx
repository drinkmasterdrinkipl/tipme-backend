// ============================================
// Tip For Me — App.tsx
// ============================================

import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
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
  const response = await apiFetch(`${API_URL}/api/connection-token`, {
    method: 'POST',
    body: JSON.stringify({ stripeAccountId: accountId }),
  });
  if (!response.ok) throw new Error(`Connection token fetch failed: ${response.status}`);
  const { secret } = await response.json();
  if (!secret) throw new Error('No connection token received');
  return secret;
};

// Warm-up Stripe Terminal przy starcie (wymaganie Apple 1.5)
function TerminalWarmup() {
  const { initialize } = useStripeTerminal();
  useEffect(() => { initialize().catch(() => {}); }, [initialize]);
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

// Główny stack — zawsze renderowany, nie duplikuje routów
function MainStack({ onLogout }: { onLogout: () => void }) {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Main" component={MainTabs} />
      <Stack.Screen name="Tap" component={TapScreen} />
      <Stack.Screen name="Success" component={SuccessScreen} />
      <Stack.Screen name="TapToPayWelcome" component={TapToPayWelcomeScreen} />
      <Stack.Screen name="TapToPayEducation" component={TapToPayEducationScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
    </Stack.Navigator>
  );
}

export default function App() {
  const [isOnboarded, setIsOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem('stripeAccountId').then(id => {
      setIsOnboarded(!!id);
    }).catch(() => setIsOnboarded(false));
  }, []);

  if (isOnboarded === null) {
    return <View style={{ flex: 1, backgroundColor: '#0c0a13' }} />;
  }

  return (
    <AppContext.Provider value={{ onLogout: () => setIsOnboarded(false) }}>
    <SafeAreaProvider>
      <StripeTerminalProvider tokenProvider={fetchTokenProvider} logLevel="verbose">
        <TerminalWarmup />
        <NavigationContainer>
          {!isOnboarded ? (
            <Stack.Navigator screenOptions={{ headerShown: false }}>
              <Stack.Screen name="Onboarding">
                {(props) => (
                  <OnboardingScreen
                    {...props}
                    onComplete={() => setIsOnboarded(true)}
                  />
                )}
              </Stack.Screen>
              <Stack.Screen name="StripeWebView" component={StripeWebViewScreen} />
              <Stack.Screen name="AccountDetails" component={AccountDetailsScreen} />
            </Stack.Navigator>
          ) : (
            <Stack.Navigator screenOptions={{ headerShown: false }}>
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
  );
}
