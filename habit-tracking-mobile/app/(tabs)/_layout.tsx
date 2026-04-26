import { Tabs } from "expo-router";
import { Home, Users, BarChart3, MessageCircle, User } from "lucide-react-native";
import { colors } from "../../lib/theme";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "rgba(255,255,255,0.95)",
          borderTopWidth: 1,
          borderTopColor: colors.border,
          paddingTop: 4,
          height: 60,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedFg,
        tabBarLabelStyle: { fontSize: 10, fontWeight: "500", marginBottom: 4 },
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
