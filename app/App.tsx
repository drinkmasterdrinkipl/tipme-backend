// ============================================
// TipMe — App.tsx
// Główna aplikacja React Native
// ============================================

import React, { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StripeTerminalProvider } from '@stripe/stripe-terminal-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import HomeScreen from './screens/HomeScreen';
import TapScreen from './screens/TapScreen';
import SuccessScreen from './screens/SuccessScreen';
import HistoryScreen from './screens/HistoryScreen';
import StatsScreen from './screens/StatsScreen';
import OnboardingScreen from './screens/OnboardingScreen';

// ============================================
// KONFIGURACJA — zmień na swój URL backendu
// ============================================
export const API_URL = 'https://your-backend-url.com';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// Pobieranie tokena z backendu dla Stripe Terminal
const fetchTokenProvider = async () => {
  const accountId = await AsyncStorage.getItem('stripeAccountId');
  const response = await fetch(`${API_URL}/api/connection-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stripeAccountId: accountId }),
  });
  const { secret } = await response.json();
  return secret;
};

// Tabs — główna nawigacja
function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#0c0a13',
          borderTopColor: 'rgba(255,255,255,0.06)',
          paddingBottom: 8,
          paddingTop: 8,
          height: 85,
        },
        tabBarActiveTintColor: '#a855f7',
        tabBarInactiveTintColor: '#555',
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: 'Napiwek',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 22 }}>💜</Text>
          ),
        }}
      />
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{
          tabBarLabel: 'Historia',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 22 }}>📋</Text>
          ),
        }}
      />
      <Tab.Screen
        name="Stats"
        component={StatsScreen}
        options={{
          tabBarLabel: 'Statystyki',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 22 }}>📊</Text>
          ),
        }}
      />
    </Tab.Navigator>
  );
}

export default function App() {
  const [isOnboarded, setIsOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    checkOnboarding();
  }, []);

  const checkOnboarding = async () => {
    const accountId = await AsyncStorage.getItem('stripeAccountId');
    setIsOnboarded(!!accountId);
  };

  if (isOnboarded === null) return null; // loading

  return (
    <StripeTerminalProvider
      logLevel="verbose"
      tokenProvider={fetchTokenProvider}
    >
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {!isOnboarded ? (
            <Stack.Screen name="Onboarding" component={OnboardingScreen} />
          ) : (
            <>
              <Stack.Screen name="Main" component={MainTabs} />
              <Stack.Screen name="Tap" component={TapScreen} />
              <Stack.Screen name="Success" component={SuccessScreen} />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </StripeTerminalProvider>
  );
}
