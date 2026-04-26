import { useEffect, useState } from "react";
import { Stack, router, useRootNavigationState } from "expo-router";
import { getToken, clearToken } from "../lib/auth";
import { api } from "../lib/api";

export default function RootLayout() {
  const [destination, setDestination] = useState<string | null>(null);
  const navState = useRootNavigationState();

  useEffect(() => {
    async function check() {
      const token = await getToken();
      if (!token) {
        setDestination("/(auth)/login");
        return;
      }
      try {
        await api.auth.me(token);
        setDestination("/(tabs)/");
      } catch {
        await clearToken();
        setDestination("/(auth)/login");
      }
    }
    void check();
  }, []);

  useEffect(() => {
    if (!navState?.key || !destination) return;
    router.replace(destination as any);
  }, [navState?.key, destination]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}
