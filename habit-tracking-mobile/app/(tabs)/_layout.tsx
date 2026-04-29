import { Tabs } from "expo-router";
import { Home, Users, BarChart3, MessageCircle, User } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../../lib/theme";

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = 56 + insets.bottom;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "rgba(255,255,255,0.95)",
          borderTopWidth: 1,
          borderTopColor: colors.border,
          paddingTop: 6,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
          height: tabBarHeight,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedFg,
        tabBarLabelStyle: { fontSize: 10, fontWeight: "500" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Home", tabBarIcon: ({ color, size }) => <Home size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="social"
        options={{ title: "Friends", tabBarIcon: ({ color, size }) => <Users size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="analytics"
        options={{ title: "Stats", tabBarIcon: ({ color, size }) => <BarChart3 size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="aicoach"
        options={{ title: "AI Coach", tabBarIcon: ({ color, size }) => <MessageCircle size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: "Profile", tabBarIcon: ({ color, size }) => <User size={size} color={color} /> }}
      />
    </Tabs>
  );
}
