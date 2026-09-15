import { BebasNeue_400Regular } from "@expo-google-fonts/bebas-neue";
import {
  Inter_700Bold,
  Inter_600SemiBold,
  Inter_400Regular,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { AppState, Platform } from "react-native";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/contexts/AuthContext";
import { LocaleProvider } from "@/contexts/LocaleContext";
import { warmUpApi } from "@/lib/api";
import { initMobileAds } from "@/native/ad-helper";
import "@/lib/i18n";

SplashScreen.preventAutoHideAsync();

// Initialize AdMob SDK once at app startup (no-op on web / Expo Go)
if (Platform.OS !== "web") {
  initMobileAds();
}

const queryClient = new QueryClient();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: "slide_from_right" }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="quick-game" />
      <Stack.Screen name="online" />
      <Stack.Screen name="1v1" />
      <Stack.Screen name="friends" />
      <Stack.Screen name="invite/friend/[id]" />
      <Stack.Screen name="invite/game/[id]" />
      <Stack.Screen name="game" />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    BebasNeue_400Regular,
    Inter_400Regular,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  // Uyuyan API'yi kullanıcı menüde gezinirken uyandırmaya başla: Online'a
  // bastığında 50 saniyelik spin-up'ın çoğu çoktan geçmiş olur.
  useEffect(() => {
    warmUpApi();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") warmUpApi();
    });
    return () => sub.remove();
  }, []);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <LocaleProvider>
            <AuthProvider>
              <GestureHandlerRootView style={{ flex: 1 }}>
                <RootLayoutNav />
              </GestureHandlerRootView>
            </AuthProvider>
          </LocaleProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
