import { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Settings, Zap, Flame, Star, Trophy, Crown, Target, Gem } from "lucide-react-native";
import { getToken, clearToken } from "../../lib/auth";
import { api, UserResponse, AnalyticsSummaryResponse } from "../../lib/api";
import { colors, card, radius } from "../../lib/theme";

const BADGES = [
  { Icon: Trophy, name: "First Step", desc: "Complete 1 habit" },
  { Icon: Flame, name: "On Fire", desc: "7-day streak" },
  { Icon: Star, name: "Dedicated", desc: "30-day streak" },
  { Icon: Crown, name: "Legend", desc: "Level 50" },
  { Icon: Target, name: "Perfect Week", desc: "7/7 days" },
  { Icon: Gem, name: "Diamond", desc: "100 completions" },
];

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const [user, setUser] = useState<UserResponse | null>(null);
  const [summary, setSummary] = useState<AnalyticsSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getToken().then(async t => {
      if (!t) return;
      try {
        const [u, s] = await Promise.all([api.auth.me(t), api.analytics.summary(t)]);
        setUser(u); setSummary(s);
      } catch {}
      finally { setLoading(false); }
    });
  }, []);

  async function logout() {
    Alert.alert("Sign out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: async () => { await clearToken(); router.replace("/(auth)/login"); } },
    ]);
  }

  const initials = user?.full_name
    ? user.full_name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
    : (user?.email ?? "?")[0].toUpperCase();

  if (loading) return (
    <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: "center", alignItems: "center" }}>
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );

  return (
    <View style={[{ flex: 1, backgroundColor: colors.background }, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <Text style={pr.title}>Profile</Text>
          <TouchableOpacity style={pr.settingsBtn}>
            <Settings size={18} color={colors.mutedFg} />
          </TouchableOpacity>
        </View>

        {/* User card */}
        <View style={[card, { padding: 20, alignItems: "center", marginBottom: 12 }]}>
          <View style={pr.avatar}>
            <Text style={pr.avatarText}>{initials}</Text>
          </View>
          <Text style={pr.name}>{user?.full_name ?? "No name set"}</Text>
          <Text style={pr.email}>{user?.email}</Text>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
            {summary && (
              <>
                <View style={[pr.badge, { flexDirection: "row", alignItems: "center", gap: 4 }]}>
                  <Zap size={13} color={colors.foreground} />
                  <Text style={pr.badgeText}>Level {summary.stats.level}</Text>
                </View>
                <View style={[pr.badge, { flexDirection: "row", alignItems: "center", gap: 4 }]}>
                  <Flame size={13} color={colors.foreground} />
                  <Text style={pr.badgeText}>{summary.stats.current_streak_days}d streak</Text>
                </View>
              </>
            )}
          </View>
          <TouchableOpacity style={pr.logoutBtn} onPress={logout}>
            <Text style={pr.logoutTxt}>Sign out</Text>
          </TouchableOpacity>
        </View>

        {/* XP Progress */}
        {summary && (
          <View style={[card, { padding: 16, marginBottom: 12 }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <Star size={18} color={colors.primary} />
              <Text style={{ color: colors.foreground, fontWeight: "600", fontSize: 15 }}>XP Progress</Text>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
              <Text style={{ color: colors.foreground, fontSize: 20, fontWeight: "700" }}>{summary.stats.total_xp} XP</Text>
              <Text style={{ color: colors.mutedFg, fontSize: 13 }}>Level {summary.stats.level}</Text>
            </View>
            <View style={pr.xpBar}>
              <View style={[pr.xpFill, { width: `${(summary.stats.level % 5) * 20}%` }]} />
            </View>
            <Text style={{ color: colors.mutedFg, fontSize: 12, marginTop: 6 }}>
              {(summary.stats.level % 5) * 20}% to Level {summary.stats.level + 1}
            </Text>
          </View>
        )}

        {/* Badges */}
        <View style={[card, { padding: 16, marginBottom: 12 }]}>
          <Text style={{ color: colors.foreground, fontWeight: "600", fontSize: 15, marginBottom: 14 }}>Badges</Text>
          <View style={pr.badgesGrid}>
            {BADGES.map((b, i) => {
              const earned = i < (summary?.stats.level ?? 0) / 5;
              return (
                <View key={i} style={[pr.badgeCard, !earned && { opacity: 0.4 }]}>
                  <View style={pr.badgeIcon}>
                    <b.Icon size={22} color={earned ? colors.primary : colors.mutedFg} />
                  </View>
                  <Text style={pr.badgeName}>{b.name}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Stats */}
        {summary && (
          <View style={[card, { padding: 16 }]}>
            <Text style={{ color: colors.foreground, fontWeight: "600", fontSize: 15, marginBottom: 12 }}>Statistics</Text>
            {[
              { label: "Total XP", value: summary.stats.total_xp },
              { label: "Current Streak", value: `${summary.stats.current_streak_days} days` },
              { label: "Longest Streak", value: `${summary.stats.longest_streak_days} days` },
              { label: "This Week", value: `${summary.completions_this_week} completions` },
            ].map((row, i) => (
              <View key={i} style={[pr.statRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
                <Text style={{ color: colors.mutedFg, fontSize: 14 }}>{row.label}</Text>
                <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "600" }}>{row.value}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const pr = StyleSheet.create({
  title: { color: colors.foreground, fontSize: 24, fontWeight: "700", letterSpacing: -0.5 },
  settingsBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  avatarText: { color: "#fff", fontSize: 24, fontWeight: "700" },
  name: { color: colors.foreground, fontSize: 20, fontWeight: "700" },
  email: { color: colors.mutedFg, fontSize: 14, marginTop: 2 },
  badge: { backgroundColor: colors.secondary, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 5 },
  badgeText: { color: colors.foreground, fontSize: 13, fontWeight: "500" },
  logoutBtn: { marginTop: 16, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 24, paddingVertical: 8 },
  logoutTxt: { color: colors.foreground, fontSize: 14, fontWeight: "500" },
  xpBar: { height: 12, backgroundColor: colors.secondary, borderRadius: radius.full, overflow: "hidden" },
  xpFill: { height: 12, backgroundColor: colors.primary, borderRadius: radius.full },
  badgesGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  badgeCard: { width: "30%", alignItems: "center", padding: 12, backgroundColor: colors.muted, borderRadius: radius.md },
  badgeIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  badgeName: { color: colors.foreground, fontSize: 11, fontWeight: "500", textAlign: "center" },
  statRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 10 },
});
