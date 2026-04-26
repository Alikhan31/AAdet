import { useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Target, Zap, Calendar, TrendingUp, Flame, Star, Award, BookOpen } from "lucide-react-native";
import { getToken } from "../../lib/auth";
import { api, AnalyticsSummaryResponse } from "../../lib/api";
import { colors, card, banner, radius } from "../../lib/theme";

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ Icon, value, label, sub }: { Icon: any; value: string | number; label: string; sub?: string }) {
  return (
    <View style={[card, sc.card]}>
      <View style={sc.iconBox}>
        <Icon size={16} color={colors.primary} />
      </View>
      <Text style={sc.value}>{value}</Text>
      <Text style={sc.label}>{label}</Text>
      {sub ? <Text style={sc.sub}>{sub}</Text> : null}
    </View>
  );
}
const sc = StyleSheet.create({
  card: { flex: 1, padding: 14 },
  iconBox: { width: 32, height: 32, borderRadius: 8, backgroundColor: colors.primary + "18", alignItems: "center", justifyContent: "center", marginBottom: 8 },
  value: { color: colors.foreground, fontSize: 20, fontWeight: "700" },
  label: { color: colors.mutedFg, fontSize: 12, marginTop: 2 },
  sub: { color: colors.primary, fontSize: 11, marginTop: 2, fontWeight: "500" },
});

// ── Bar chart ─────────────────────────────────────────────────────────────────
function BarChart({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <View style={bc.container}>
      {data.map((d, i) => (
        <View key={i} style={bc.col}>
          <Text style={bc.count}>{d.value > 0 ? d.value : ""}</Text>
          <View style={bc.barWrap}>
            <View style={[bc.bar, { height: `${(d.value / max) * 100}%`, backgroundColor: d.value > 0 ? colors.primary : colors.muted }]} />
          </View>
          <Text style={bc.label}>{d.label}</Text>
        </View>
      ))}
    </View>
  );
}
const bc = StyleSheet.create({
  container: { flexDirection: "row", alignItems: "flex-end", height: 130, gap: 6 },
  col: { flex: 1, alignItems: "center", height: "100%" },
  barWrap: { flex: 1, width: "100%", justifyContent: "flex-end" },
  bar: { width: "100%", borderRadius: 6, minHeight: 4 },
  label: { color: colors.mutedFg, fontSize: 10, marginTop: 4 },
  count: { color: colors.foreground, fontSize: 10, fontWeight: "600", marginBottom: 2 },
});

// ── Progress ring (XP bar) ────────────────────────────────────────────────────
function XpBar({ level, xp }: { level: number; xp: number }) {
  const XP_PER_LEVEL = 100;
  const xpInLevel = xp % XP_PER_LEVEL;
  const pct = Math.round((xpInLevel / XP_PER_LEVEL) * 100);
  return (
    <View style={{ marginTop: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
        <Text style={{ color: "rgba(255,255,255,0.9)", fontSize: 12 }}>Level {level}</Text>
        <Text style={{ color: "rgba(255,255,255,0.9)", fontSize: 12 }}>{xpInLevel}/{XP_PER_LEVEL} XP → Level {level + 1}</Text>
      </View>
      <View style={{ height: 8, backgroundColor: "rgba(255,255,255,0.25)", borderRadius: 4, overflow: "hidden" }}>
        <View style={{ height: 8, backgroundColor: "#fff", borderRadius: 4, width: `${pct}%` }} />
      </View>
    </View>
  );
}

function levelTitle(level: number) {
  if (level < 5) return "Beginner";
  if (level < 10) return "Explorer";
  if (level < 20) return "Tracker";
  if (level < 35) return "Master";
  return "Legend";
}

const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function AnalyticsScreen() {
  const insets = useSafeAreaInsets();
  const [token, setToken] = useState<string | null>(null);
  const [summary, setSummary] = useState<AnalyticsSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { getToken().then(t => { setToken(t); if (t) load(t); }); }, []);

  async function load(t: string) {
    try { setSummary(await api.analytics.summary(t)); }
    catch {} finally { setLoading(false); setRefreshing(false); }
  }

  const consistency = summary
    ? Math.round((summary.completions_this_week / summary.possible_this_week) * 100)
    : 0;

  const chartData = summary?.last_7_days.map(d => ({
    label: SHORT_DAYS[new Date(d.date + "T00:00:00").getDay()],
    value: d.count,
  })) ?? [];

  if (!token) return null;

  return (
    <View style={[an.container, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={an.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); if (token) load(token); }} tintColor={colors.primary} />}
      >
        <View style={an.headerRow}>
          <Text style={an.title}>Stats</Text>
          <View style={an.liveBadge}>
            <View style={an.liveDot} />
            <Text style={an.liveText}>Live</Text>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} size="large" />
        ) : !summary ? (
          <Text style={{ color: colors.mutedFg, textAlign: "center", marginTop: 40 }}>No stats yet. Start completing habits!</Text>
        ) : (
          <>
            {/* 4-stat grid */}
            <View style={an.grid}>
              <StatCard Icon={Target} value={`${consistency}%`} label="This week" sub="Consistency" />
              <StatCard Icon={Zap} value={`${summary.stats.current_streak_days}d`} label="Streak" sub="Current" />
            </View>
            <View style={[an.grid, { marginTop: 10 }]}>
              <StatCard Icon={Calendar} value={summary.total_completions} label="All time" sub="Completions" />
              <StatCard Icon={BookOpen} value={summary.habits_count} label="Habits" sub="Active" />
            </View>

            {/* Level banner */}
            <View style={[banner, an.levelCard]}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View>
                  <Text style={{ color: "#fff", fontSize: 18, fontWeight: "700" }}>
                    Level {summary.stats.level} — {levelTitle(summary.stats.level)}
                  </Text>
                  <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 13, marginTop: 2 }}>
                    {summary.stats.total_xp} XP total
                  </Text>
                </View>
                <Award size={32} color="rgba(255,255,255,0.6)" />
              </View>
              <XpBar level={summary.stats.level} xp={summary.stats.total_xp} />
            </View>

            {/* Bar chart – last 7 days */}
            <View style={[card, { padding: 16, marginTop: 10 }]}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <Text style={{ color: colors.foreground, fontWeight: "600", fontSize: 14 }}>Last 7 days</Text>
                <Text style={{ color: colors.mutedFg, fontSize: 12 }}>{summary.completions_this_week} this week</Text>
              </View>
              <BarChart data={chartData} />
            </View>

            {/* Streaks card */}
            <View style={[card, { padding: 16, marginTop: 10 }]}>
              <Text style={{ color: colors.foreground, fontWeight: "600", fontSize: 14, marginBottom: 12 }}>Streaks</Text>
              <View style={{ flexDirection: "row", justifyContent: "space-around" }}>
                <View style={{ alignItems: "center" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Flame size={22} color={colors.accent} />
                    <Text style={{ fontSize: 26, fontWeight: "700", color: colors.accent }}>{summary.stats.current_streak_days}</Text>
                  </View>
                  <Text style={{ color: colors.mutedFg, fontSize: 12, marginTop: 4 }}>Current streak</Text>
                </View>
                <View style={an.divider} />
                <View style={{ alignItems: "center" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Star size={22} color={colors.primary} />
                    <Text style={{ fontSize: 26, fontWeight: "700", color: colors.primary }}>{summary.stats.longest_streak_days}</Text>
                  </View>
                  <Text style={{ color: colors.mutedFg, fontSize: 12, marginTop: 4 }}>Personal best</Text>
                </View>
              </View>
            </View>

            {/* Best day + today */}
            <View style={[card, { padding: 16, marginTop: 10 }]}>
              <Text style={{ color: colors.foreground, fontWeight: "600", fontSize: 14, marginBottom: 12 }}>Insights</Text>
              <View style={an.insightRow}>
                <TrendingUp size={16} color={colors.primary} />
                <Text style={an.insightText}>
                  Best day: <Text style={{ fontWeight: "600", color: colors.foreground }}>{summary.best_weekday ?? "—"}</Text>
                </Text>
              </View>
              <View style={[an.insightRow, { marginTop: 8 }]}>
                <Target size={16} color={colors.primary} />
                <Text style={an.insightText}>
                  Today: <Text style={{ fontWeight: "600", color: colors.foreground }}>{summary.completions_today} completions</Text>
                </Text>
              </View>
              <View style={[an.insightRow, { marginTop: 8 }]}>
                <Zap size={16} color={colors.primary} />
                <Text style={an.insightText}>
                  This week: <Text style={{ fontWeight: "600", color: colors.foreground }}>{summary.completions_this_week}/{summary.possible_this_week}</Text>
                  {" "}<Text style={{ color: colors.mutedFg }}>scheduled slots</Text>
                </Text>
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const an = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: 16, paddingBottom: 100 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  title: { color: colors.foreground, fontSize: 24, fontWeight: "700", letterSpacing: -0.5 },
  liveBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.primary + "18", paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary },
  liveText: { color: colors.primary, fontSize: 12, fontWeight: "600" },
  grid: { flexDirection: "row", gap: 10 },
  levelCard: { padding: 16, marginTop: 10 },
  divider: { width: 1, backgroundColor: colors.border },
  insightRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  insightText: { color: colors.mutedFg, fontSize: 14, flex: 1 },
});
