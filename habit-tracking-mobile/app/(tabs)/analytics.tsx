import { useEffect, useState, useMemo, ComponentType } from "react";
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl, TouchableOpacity, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Target, Zap, Calendar, TrendingUp, Flame, Star, Award, BookOpen,
  Heart, Activity, Brain, BookOpen as BookOpenIcon, Coffee, Sun, Moon,
  Smile, Home, Users, Music, Code2, Clock, Leaf, Droplets, Camera,
  Globe, Lightbulb, Headphones, ShoppingBag, Plane, BarChart2, Dumbbell,
  ChevronDown, ChevronUp, CheckCircle2, Send, Bot, Sparkles,
} from "lucide-react-native";
import { getToken } from "../../lib/auth";
import { api, AnalyticsSummaryResponse, HabitAnalyticsItem, AnalyzeResponse, QuestionField, ProposedHabit } from "../../lib/api";
import { colors, card, banner, radius } from "../../lib/theme";

// ── Icon + category maps ──────────────────────────────────────────────────────
const ICON_MAP: Record<string, ComponentType<any>> = {
  heart: Heart, activity: Activity, brain: Brain, "book-open": BookOpenIcon,
  coffee: Coffee, target: Target, star: Star, zap: Zap, sun: Sun, moon: Moon,
  smile: Smile, home: Home, users: Users, music: Music, code: Code2,
  clock: Clock, leaf: Leaf, flame: Flame, award: Award, droplets: Droplets,
  camera: Camera, globe: Globe, lightbulb: Lightbulb, headphones: Headphones,
  "shopping-bag": ShoppingBag, plane: Plane, "bar-chart": BarChart2, dumbbell: Dumbbell,
};

const CATEGORY_META: Record<string, { label: string; color: string; icon: string }> = {
  health:    { label: "Health",    color: "#ef4444", icon: "heart" },
  fitness:   { label: "Fitness",   color: "#f97316", icon: "dumbbell" },
  mind:      { label: "Mind",      color: "#8b5cf6", icon: "brain" },
  learning:  { label: "Learning",  color: "#3b82f6", icon: "book-open" },
  social:    { label: "Social",    color: "#ec4899", icon: "users" },
  work:      { label: "Work",      color: "#10b981", icon: "target" },
  finance:   { label: "Finance",   color: "#f59e0b", icon: "bar-chart" },
  lifestyle: { label: "Lifestyle", color: "#06b6d4", icon: "sun" },
  other:     { label: "Other",     color: "#6b7280", icon: "star" },
};

function catColor(cat: string | null) { return CATEGORY_META[cat ?? ""]?.color ?? colors.primary; }
function catLabel(cat: string | null) { return CATEGORY_META[cat ?? ""]?.label ?? (cat ?? "Other"); }
function catIconKey(cat: string | null) { return CATEGORY_META[cat ?? ""]?.icon ?? "star"; }

function HabitIcon({ iconKey, size, color }: { iconKey: string | null; size: number; color: string }) {
  const Ic = (iconKey ? ICON_MAP[iconKey] : null) ?? CheckCircle2;
  return <Ic size={size} color={color} />;
}

// ── Shared sub-components ─────────────────────────────────────────────────────
function StatCard({ Icon, value, label, sub, color }: { Icon: any; value: string | number; label: string; sub?: string; color?: string }) {
  const c = color ?? colors.primary;
  return (
    <View style={[card, sc.card]}>
      <View style={[sc.iconBox, { backgroundColor: c + "18" }]}>
        <Icon size={16} color={c} />
      </View>
      <Text style={sc.value}>{value}</Text>
      <Text style={sc.label}>{label}</Text>
      {sub ? <Text style={[sc.sub, { color: c }]}>{sub}</Text> : null}
    </View>
  );
}
const sc = StyleSheet.create({
  card: { flex: 1, padding: 14 },
  iconBox: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  value: { color: colors.foreground, fontSize: 20, fontWeight: "700" },
  label: { color: colors.mutedFg, fontSize: 12, marginTop: 2 },
  sub: { fontSize: 11, marginTop: 2, fontWeight: "500" },
});

function BarChartSimple({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <View style={bc.container}>
      {data.map((d, i) => (
        <View key={i} style={bc.col}>
          <Text style={bc.count}>{d.value > 0 ? d.value : ""}</Text>
          <View style={bc.barWrap}>
            <View style={[bc.bar, { height: `${(d.value / max) * 100}%`, backgroundColor: d.value > 0 ? colors.primary : colors.muted }]} />
          </View>
          <Text style={bc.dayLabel}>{d.label}</Text>
        </View>
      ))}
    </View>
  );
}
const bc = StyleSheet.create({
  container: { flexDirection: "row", alignItems: "flex-end", height: 120, gap: 4 },
  col: { flex: 1, alignItems: "center", height: "100%" },
  barWrap: { flex: 1, width: "100%", justifyContent: "flex-end" },
  bar: { width: "100%", borderRadius: 5, minHeight: 4 },
  dayLabel: { color: colors.mutedFg, fontSize: 9, marginTop: 3 },
  count: { color: colors.foreground, fontSize: 9, fontWeight: "600", marginBottom: 1 },
});

function XpBar({ level, xp }: { level: number; xp: number }) {
  const XP_PER = 100;
  const xpIn = xp % XP_PER;
  const pct = Math.round((xpIn / XP_PER) * 100);
  return (
    <View style={{ marginTop: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 5 }}>
        <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 12 }}>Level {level}</Text>
        <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 12 }}>{xpIn}/{XP_PER} XP → Lv {level + 1}</Text>
      </View>
      <View style={{ height: 7, backgroundColor: "rgba(255,255,255,0.25)", borderRadius: 4, overflow: "hidden" }}>
        <View style={{ height: 7, backgroundColor: "#fff", borderRadius: 4, width: `${pct}%` }} />
      </View>
    </View>
  );
}

function levelTitle(l: number) {
  if (l < 5) return "Beginner";
  if (l < 10) return "Explorer";
  if (l < 20) return "Tracker";
  if (l < 35) return "Master";
  return "Legend";
}

// ── Dots-30 mini chart ────────────────────────────────────────────────────────
function Dots30({ days, color }: { days: { date: string; count: number }[]; color: string }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 3, marginTop: 8 }}>
      {days.map((d, i) => (
        <View key={i} style={[dot.cell, { backgroundColor: d.count ? color : colors.muted }]} />
      ))}
    </View>
  );
}
const dot = StyleSheet.create({
  cell: { width: 9, height: 9, borderRadius: 2 },
});

// ── Horizontal progress bar ───────────────────────────────────────────────────
function HBar({ pct, color }: { pct: number; color: string }) {
  return (
    <View style={{ height: 7, backgroundColor: colors.muted, borderRadius: 4, overflow: "hidden", flex: 1 }}>
      <View style={{ height: 7, borderRadius: 4, width: `${Math.min(100, pct)}%`, backgroundColor: color }} />
    </View>
  );
}

const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type AIDerivedVisual =
  | { kind: "weekday"; title: string; rows: { label: string; value: number }[] }
  | { kind: "habits"; title: string; rows: { label: string; value: number; color: string }[] }
  | { kind: "categories"; title: string; rows: { label: string; value: number; color: string }[] }
  | { kind: "best"; title: string; top: HabitAnalyticsItem[] };

function buildAIDerivedVisuals(
  query: string,
  summary: AnalyticsSummaryResponse | null,
  habitStats: HabitAnalyticsItem[]
): AIDerivedVisual[] {
  const visuals: AIDerivedVisual[] = [];

  if (summary?.last_7_days?.length) {
    const rows = summary.last_7_days.map((d) => ({
      label: SHORT_DAYS[new Date(d.date + "T00:00:00").getDay()],
      value: d.count,
    }));
    visuals.push({ kind: "weekday", title: "Weekly activity rhythm", rows });
  }

  if (habitStats.length) {
    const byCompletions = [...habitStats]
      .sort((a, b) => b.total_completions - a.total_completions)
      .slice(0, 5)
      .map((h) => ({ label: h.habit_name, value: h.total_completions, color: catColor(h.category) }));
    visuals.push({ kind: "habits", title: "Top habits by completions", rows: byCompletions });

    const catMap = new Map<string, { total: number; color: string }>();
    for (const h of habitStats) {
      const key = h.category ?? "other";
      const cur = catMap.get(key) ?? { total: 0, color: catColor(key) };
      cur.total += h.total_completions;
      catMap.set(key, cur);
    }
    const cats = Array.from(catMap.entries())
      .map(([key, v]) => ({ label: catLabel(key), value: v.total, color: v.color }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 4);
    visuals.push({ kind: "categories", title: "Category balance", rows: cats });

    const lower = query.toLowerCase();
    if (lower.includes("best") || lower.includes("top") || lower.includes("habit")) {
      const top = [...habitStats]
        .sort((a, b) => {
          if (b.longest_streak !== a.longest_streak) return b.longest_streak - a.longest_streak;
          return b.completion_rate - a.completion_rate;
        })
        .slice(0, 3);
      visuals.push({ kind: "best", title: "Best habit candidates", top });
    }
  }

  return visuals;
}

// ── Mobile Questions Form ─────────────────────────────────────────────────────
function MobileQuestionsForm({
  intro, fields, loading, onSubmit, onCancel,
}: {
  intro: string | null;
  fields: QuestionField[];
  loading: boolean;
  onSubmit: (answers: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}) {
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  function set(id: string, val: unknown) { setAnswers(prev => ({ ...prev, [id]: val })); }

  return (
    <View style={[card, { padding: 16, borderWidth: 1, borderColor: colors.primary + "44", gap: 14 }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Bot size={16} color={colors.primary} />
        <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "700" }}>A few quick questions</Text>
      </View>
      {intro && <Text style={{ color: colors.mutedFg, fontSize: 13, lineHeight: 19 }}>{intro}</Text>}

      {fields.map(f => (
        <View key={f.id} style={{ gap: 6 }}>
          <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "600" }}>{f.label}</Text>

          {(f.type === "number" || f.type === "text") && (
            <TextInput
              style={{ backgroundColor: colors.muted, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, color: colors.foreground, fontSize: 14 }}
              placeholder={f.placeholder ?? ""}
              placeholderTextColor={colors.mutedFg}
              keyboardType={f.type === "number" ? "numeric" : "default"}
              value={answers[f.id] != null ? String(answers[f.id]) : ""}
              onChangeText={v => set(f.id, f.type === "number" ? (v ? Number(v) : "") : v)}
            />
          )}

          {f.type === "chips" && f.options && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {f.options.map(opt => {
                const selected = answers[f.id] === opt;
                return (
                  <TouchableOpacity
                    key={opt}
                    onPress={() => set(f.id, selected ? "" : opt)}
                    style={{
                      paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1,
                      backgroundColor: selected ? colors.primary : "transparent",
                      borderColor: selected ? colors.primary : colors.border,
                    }}
                  >
                    <Text style={{ color: selected ? "#fff" : colors.mutedFg, fontSize: 12, fontWeight: "500" }}>{opt}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {f.type === "slider" && (
            <View style={{ gap: 4 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: colors.mutedFg, fontSize: 11 }}>{f.min ?? 0}</Text>
                <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "700" }}>{(answers[f.id] as number) ?? f.min ?? 0}</Text>
                <Text style={{ color: colors.mutedFg, fontSize: 11 }}>{f.max ?? 10}</Text>
              </View>
              {/* Simple discrete step buttons for slider */}
              <View style={{ flexDirection: "row", gap: 2 }}>
                {Array.from({ length: (f.max ?? 10) - (f.min ?? 0) + 1 }, (_, idx) => (f.min ?? 0) + idx).map(v => (
                  <TouchableOpacity
                    key={v}
                    onPress={() => set(f.id, v)}
                    style={{ flex: 1, paddingVertical: 6, borderRadius: 4, backgroundColor: (answers[f.id] ?? f.min ?? 0) === v ? colors.primary : colors.muted, alignItems: "center" }}
                  >
                    <Text style={{ color: (answers[f.id] ?? f.min ?? 0) === v ? "#fff" : colors.mutedFg, fontSize: 10, fontWeight: "600" }}>{v}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>
      ))}

      <View style={{ flexDirection: "row", gap: 8 }}>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 10, alignItems: "center" }}
          onPress={() => void onSubmit(answers)}
          disabled={loading}
        >
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>{loading ? "Analyzing..." : "Submit"}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={{ paddingHorizontal: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 10, alignItems: "center" }}
          onPress={onCancel}
          disabled={loading}
        >
          <Text style={{ color: colors.mutedFg, fontSize: 14 }}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Tabs ─────────────────────────────────────────────────────────────────────
type Tab = "overview" | "categories" | "habits" | "ai";

// ── Main screen ──────────────────────────────────────────────────────────────
export default function AnalyticsScreen() {
  const insets = useSafeAreaInsets();
  const [token, setToken] = useState<string | null>(null);
  const [summary, setSummary] = useState<AnalyticsSummaryResponse | null>(null);
  const [habitStats, setHabitStats] = useState<HabitAnalyticsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  const [expandedHabit, setExpandedHabit] = useState<number | null>(null);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiHistory, setAiHistory] = useState<{ role: string; content: string }[]>([]);
  const [aiResults, setAiResults] = useState<(AnalyzeResponse & { query: string; acceptedIdxs?: Set<number>; declinedIdxs?: Set<number> })[]>([]);
  const [questionState, setQuestionState] = useState<{
    query: string;
    fields: QuestionField[];
    intro: string | null;
    answers: Record<string, unknown>;
  } | null>(null);

  async function sendAiQuery() {
    const q = aiInput.trim();
    if (!q || !token || aiLoading) return;
    setAiInput("");
    setAiLoading(true);
    try {
      const result = await api.ai.analyze(token, q, aiHistory);
      if (result.mode === "questions") {
        setQuestionState({ query: q, fields: result.questions, intro: result.intro ?? null, answers: {} });
      } else {
        setAiHistory(prev => [...prev, { role: "user", content: q }, { role: "assistant", content: result.text }]);
        setAiResults(prev => [...prev, { ...result, query: q }]);
      }
    } catch {
      setAiResults(prev => [...prev, { mode: "analysis", text: "Analysis failed. Please try again.", key_insights: [], charts: [], proposed_habits: [], questions: [], query: q }]);
    } finally {
      setAiLoading(false);
    }
  }

  async function submitAnswers(answers: Record<string, unknown>) {
    if (!token || !questionState) return;
    setQuestionState(null);
    setAiLoading(true);
    try {
      await api.user.patchProfile(token, answers);
      const result = await api.ai.analyze(token, questionState.query, aiHistory, answers);
      if (result.mode === "questions") {
        setQuestionState({ query: questionState.query, fields: result.questions, intro: result.intro ?? null, answers });
      } else {
        setAiHistory(prev => [...prev, { role: "user", content: questionState.query }, { role: "assistant", content: result.text }]);
        setAiResults(prev => [...prev, { ...result, query: questionState.query }]);
      }
    } catch {
      setAiResults(prev => [...prev, { mode: "analysis", text: "Analysis failed. Please try again.", key_insights: [], charts: [], proposed_habits: [], questions: [], query: questionState.query }]);
    } finally {
      setAiLoading(false);
    }
  }

  useEffect(() => { getToken().then(t => { setToken(t); if (t) load(t); }); }, []);

  async function load(t: string) {
    try {
      const [s, hs] = await Promise.all([
        api.analytics.summary(t),
        api.analytics.habits(t, 90).catch(() => [] as HabitAnalyticsItem[]),
      ]);
      setSummary(s);
      setHabitStats(hs);
    } catch {} finally { setLoading(false); setRefreshing(false); }
  }

  const consistency = summary
    ? Math.min(100, Math.round((summary.completions_this_week / summary.possible_this_week) * 100))
    : 0;

  const chartData = summary?.last_7_days.map(d => ({
    label: SHORT_DAYS[new Date(d.date + "T00:00:00").getDay()],
    value: d.count,
  })) ?? [];

  // Category breakdown computed from habitStats
  const categoryData = useMemo(() => {
    if (!habitStats.length) return [];
    const map = new Map<string, { total: number; rateSum: number; count: number }>();
    for (const h of habitStats) {
      const key = h.category ?? "other";
      const cur = map.get(key) ?? { total: 0, rateSum: 0, count: 0 };
      cur.total += h.total_completions;
      cur.rateSum += h.completion_rate;
      cur.count += 1;
      map.set(key, cur);
    }
    return Array.from(map.entries())
      .map(([key, v]) => ({
        key,
        label: catLabel(key),
        color: catColor(key),
        iconKey: catIconKey(key),
        total: v.total,
        avgRate: Math.round((v.rateSum / v.count) * 100),
        habitCount: v.count,
      }))
      .sort((a, b) => b.total - a.total);
  }, [habitStats]);

  const maxCatTotal = useMemo(() => Math.max(...categoryData.map(c => c.total), 1), [categoryData]);

  if (!token) return null;

  return (
    <View style={[an.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={an.headerRow}>
        <Text style={an.title}>Analytics</Text>
        <View style={an.liveBadge}>
          <View style={an.liveDot} />
          <Text style={an.liveText}>Live</Text>
        </View>
      </View>

      {/* Tab bar */}
      <View style={an.tabBar}>
        {(["overview", "categories", "habits", "ai"] as Tab[]).map(t => (
          <TouchableOpacity key={t} style={[an.tab, tab === t && an.tabActive]} onPress={() => setTab(t)}>
            <Text style={[an.tabTxt, tab === t && an.tabTxtActive]}>
              {t === "overview" ? "Overview" : t === "categories" ? "Cats" : t === "habits" ? "Habits" : "AI"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === "ai" ? (
        <View style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 20, gap: 16 }}>
            {/* Suggestions (when empty and no question) */}
            {aiResults.length === 0 && !questionState && (
              <View style={{ gap: 8 }}>
                <Text style={{ color: colors.mutedFg, fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 }}>Try asking</Text>
                {[
                  "What are my best days of the week?",
                  "Analyze my fitness category",
                  "Which habit has the best streak?",
                  "Show my weekly trend",
                ].map(q => (
                  <TouchableOpacity key={q} style={[card, { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 }]} onPress={() => setAiInput(q)}>
                    <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: colors.primary + "18", alignItems: "center", justifyContent: "center" }}>
                      <Sparkles size={14} color={colors.primary} />
                    </View>
                    <Text style={{ color: colors.foreground, fontSize: 13, flex: 1 }}>{q}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Questions form */}
            {questionState && (
              <MobileQuestionsForm
                intro={questionState.intro}
                fields={questionState.fields}
                loading={aiLoading}
                onSubmit={submitAnswers}
                onCancel={() => setQuestionState(null)}
              />
            )}

            {aiResults.map((r, i) => (
              <View key={i} style={{ gap: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Bot size={13} color={colors.mutedFg} />
                  <Text style={{ color: colors.mutedFg, fontSize: 11, fontStyle: "italic" }}>"{r.query}"</Text>
                </View>

                {/* Text + insights */}
                {!!r.text && (
                  <View style={[card, { padding: 14, gap: 10 }]}>
                    <Text style={{ color: colors.foreground, fontSize: 13, lineHeight: 20 }}>{r.text}</Text>
                    {r.key_insights.map((ins, j) => (
                      <View key={j} style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
                        <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: colors.primary + "22", alignItems: "center", justifyContent: "center" }}>
                          <Text style={{ color: colors.primary, fontSize: 9, fontWeight: "700" }}>{j + 1}</Text>
                        </View>
                        <Text style={{ color: colors.mutedFg, fontSize: 12, flex: 1, lineHeight: 18 }}>{ins}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Proposed habits */}
                {r.proposed_habits.length > 0 && (
                  <View style={{ gap: 8 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Sparkles size={13} color={colors.primary} />
                      <Text style={{ color: colors.mutedFg, fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 }}>Suggested habits</Text>
                    </View>
                    {r.proposed_habits.map((habit, hi) => {
                      const accepted = r.acceptedIdxs?.has(hi);
                      const declined = r.declinedIdxs?.has(hi);
                      const hColor = CATEGORY_META[habit.category ?? ""]?.color ?? colors.primary;
                      const iconKey = habit.icon ?? CATEGORY_META[habit.category ?? ""]?.icon ?? "star";
                      const HabitIc = ICON_MAP[iconKey] ?? CheckCircle2;
                      return (
                        <View key={hi} style={[card, { padding: 14, opacity: declined ? 0.4 : 1 }]}>
                          <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
                            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: hColor + "22", alignItems: "center", justifyContent: "center" }}>
                              <HabitIc size={18} color={hColor} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "600" }}>{habit.name}</Text>
                              {habit.description && <Text style={{ color: colors.mutedFg, fontSize: 12, marginTop: 2, lineHeight: 17 }}>{habit.description}</Text>}
                              {/* Days chips */}
                              {habit.days_of_week.length > 0 && (
                                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                                  {habit.days_of_week.map(d => (
                                    <View key={d} style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: hColor + "22" }}>
                                      <Text style={{ color: hColor, fontSize: 10, fontWeight: "700" }}>{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][d]}</Text>
                                    </View>
                                  ))}
                                </View>
                              )}
                              {habit.reason && (
                                <Text style={{ color: colors.mutedFg, fontSize: 11, fontStyle: "italic", marginTop: 6, borderLeftWidth: 2, borderLeftColor: hColor + "66", paddingLeft: 8 }}>
                                  {habit.reason}
                                </Text>
                              )}
                            </View>
                          </View>
                          {/* Action buttons */}
                          {!accepted && !declined && (
                            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                              <TouchableOpacity
                                style={{ flex: 1, backgroundColor: hColor, borderRadius: 8, paddingVertical: 8, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6 }}
                                onPress={async () => {
                                  try {
                                    if (habit.existing_habit_id) {
                                      await api.habits.update(token!, habit.existing_habit_id, { name: habit.name, description: habit.description, category: habit.category, icon: habit.icon, days_of_week: habit.days_of_week, target_count: habit.target_count });
                                    } else {
                                      await api.habits.create(token!, { name: habit.name, description: habit.description, category: habit.category, icon: habit.icon, days_of_week: habit.days_of_week, target_count: habit.target_count });
                                    }
                                    setAiResults(prev => prev.map((res, ri) =>
                                      ri === i ? { ...res, acceptedIdxs: new Set([...(res.acceptedIdxs ?? []), hi]) } : res
                                    ));
                                  } catch { /* silent */ }
                                }}
                              >
                                <CheckCircle2 size={14} color="#fff" />
                                <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>Accept</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 8, alignItems: "center" }}
                                onPress={() => setAiResults(prev => prev.map((res, ri) =>
                                  ri === i ? { ...res, declinedIdxs: new Set([...(res.declinedIdxs ?? []), hi]) } : res
                                ))}
                              >
                                <Text style={{ color: colors.mutedFg, fontSize: 13 }}>Decline</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                          {accepted && (
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 }}>
                              <CheckCircle2 size={14} color={hColor} />
                              <Text style={{ color: hColor, fontSize: 12, fontWeight: "600" }}>{habit.existing_habit_id ? "Habit updated!" : "Habit created!"}</Text>
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                )}

                {/* Charts — simple bar visualization */}
                {r.charts.map((chart, ci) => {
                  const chartColor = chart.color ?? colors.primary;
                  const vals = chart.data.map(d => Number(d[chart.y_key] ?? 0));
                  const maxVal = Math.max(...vals, 1);
                  const labels = chart.data.map(d => String(d[chart.x_key] ?? ""));
                  return (
                    <View key={ci} style={[card, { padding: 14 }]}>
                      <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "600", marginBottom: 12 }}>{chart.title}</Text>
                      <View style={{ flexDirection: "row", alignItems: "flex-end", height: 100, gap: 4 }}>
                        {vals.map((v, vi) => (
                          <View key={vi} style={{ flex: 1, alignItems: "center", height: "100%" }}>
                            <Text style={{ color: colors.foreground, fontSize: 8, fontWeight: "600", marginBottom: 2 }}>{v > 0 ? v : ""}</Text>
                            <View style={{ flex: 1, width: "100%", justifyContent: "flex-end" }}>
                              <View style={{ width: "100%", borderRadius: 4, backgroundColor: v > 0 ? chartColor : colors.muted, height: `${(v / maxVal) * 100}%`, minHeight: v > 0 ? 4 : 0 }} />
                            </View>
                            <Text style={{ color: colors.mutedFg, fontSize: 8, marginTop: 3 }} numberOfLines={1}>{labels[vi]}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  );
                })}

                {/* Derived visuals — shown when AI returns few/no charts */}
                {buildAIDerivedVisuals(r.query, summary, habitStats)
                  .slice(0, r.charts.length >= 2 ? 1 : 3)
                  .map((viz, vi) => {
                    if (viz.kind === "best") {
                      return (
                        <View key={`viz-${vi}`} style={[card, { padding: 14, gap: 10 }]}>
                          <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "600" }}>{viz.title}</Text>
                          {viz.top.map((h, rank) => {
                            const c = catColor(h.category);
                            return (
                              <View key={h.habit_id} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                                <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: c + "20", alignItems: "center", justifyContent: "center" }}>
                                  <Text style={{ color: c, fontSize: 11, fontWeight: "700" }}>{rank + 1}</Text>
                                </View>
                                <View style={{ flex: 1 }}>
                                  <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "600" }} numberOfLines={1}>
                                    {h.habit_name}
                                  </Text>
                                  <Text style={{ color: colors.mutedFg, fontSize: 11 }}>
                                    Streak {h.longest_streak}d · Rate {Math.round(h.completion_rate * 100)}%
                                  </Text>
                                </View>
                              </View>
                            );
                          })}
                        </View>
                      );
                    }

                    const rows = viz.rows;
                    const maxVal = Math.max(...rows.map((row) => row.value), 1);
                    return (
                      <View key={`viz-${vi}`} style={[card, { padding: 14 }]}>
                        <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "600", marginBottom: 12 }}>{viz.title}</Text>
                        <View style={{ gap: 10 }}>
                          {rows.map((row, ri) => {
                            const pct = Math.round((row.value / maxVal) * 100);
                            const rowColor = "color" in row ? row.color : colors.primary;
                            return (
                              <View key={ri} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                                <Text style={{ color: colors.mutedFg, width: 56, fontSize: 11 }} numberOfLines={1}>
                                  {row.label}
                                </Text>
                                <View style={{ flex: 1 }}>
                                  <HBar pct={pct} color={rowColor} />
                                </View>
                                <Text style={{ color: colors.foreground, width: 28, textAlign: "right", fontSize: 11, fontWeight: "600" }}>
                                  {row.value}
                                </Text>
                              </View>
                            );
                          })}
                        </View>
                      </View>
                    );
                  })}
              </View>
            ))}

            {aiLoading && (
              <View style={[card, { padding: 14, flexDirection: "row", alignItems: "center", gap: 12 }]}>
                <ActivityIndicator size="small" color={colors.primary} />
                <View>
                  <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "600" }}>Analyzing your data...</Text>
                  <Text style={{ color: colors.mutedFg, fontSize: 11, marginTop: 2 }}>Fetching habits & computing patterns</Text>
                </View>
              </View>
            )}
          </ScrollView>

          {/* Input bar (hidden when showing questions) */}
          {!questionState && (
            <View style={{ flexDirection: "row", padding: 12, paddingBottom: 12, backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.border, gap: 8 }}>
              <TextInput
                style={{ flex: 1, backgroundColor: colors.muted, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, color: colors.foreground, fontSize: 14 }}
                placeholder="Ask about your habits..."
                placeholderTextColor={colors.mutedFg}
                value={aiInput}
                onChangeText={setAiInput}
                onSubmitEditing={sendAiQuery}
                returnKeyType="send"
              />
              <TouchableOpacity
                style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}
                onPress={sendAiQuery}
                disabled={aiLoading || !aiInput.trim()}
              >
                <Send size={16} color="#fff" />
              </TouchableOpacity>
            </View>
          )}
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={an.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); if (token) load(token); }} tintColor={colors.primary} />}
        >
          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} size="large" />
          ) : !summary ? (
            <Text style={{ color: colors.mutedFg, textAlign: "center", marginTop: 40 }}>No stats yet. Start completing habits!</Text>
          ) : tab === "overview" ? (
            <OverviewTab summary={summary} consistency={consistency} chartData={chartData} />
          ) : tab === "categories" ? (
            <CategoriesTab categoryData={categoryData} maxTotal={maxCatTotal} habitStats={habitStats} />
          ) : (
            <HabitsTab habitStats={habitStats} expandedHabit={expandedHabit} onToggle={id => setExpandedHabit(prev => prev === id ? null : id)} />
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ── Overview tab ──────────────────────────────────────────────────────────────
function OverviewTab({ summary, consistency, chartData }: {
  summary: AnalyticsSummaryResponse;
  consistency: number;
  chartData: { label: string; value: number }[];
}) {
  return (
    <>
      <View style={an.grid}>
        <StatCard Icon={Target} value={`${consistency}%`} label="This week" sub="Consistency" />
        <StatCard Icon={Zap} value={`${summary.stats.current_streak_days}d`} label="Streak" sub="Current" color={colors.accent} />
      </View>
      <View style={[an.grid, { marginTop: 10 }]}>
        <StatCard Icon={Calendar} value={summary.total_completions} label="All time" sub="Completions" />
        <StatCard Icon={BookOpen} value={summary.habits_count} label="Active" sub="Habits" />
      </View>

      {/* Level banner */}
      <View style={[banner, { padding: 16, marginTop: 10 }]}>
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

      {/* 7-day bar chart */}
      <View style={[card, { padding: 16, marginTop: 10 }]}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <Text style={{ color: colors.foreground, fontWeight: "600", fontSize: 14 }}>Last 7 days</Text>
          <Text style={{ color: colors.mutedFg, fontSize: 12 }}>{summary.completions_this_week} this week</Text>
        </View>
        <BarChartSimple data={chartData} />
      </View>

      {/* Streaks */}
      <View style={[card, { padding: 16, marginTop: 10 }]}>
        <Text style={{ color: colors.foreground, fontWeight: "600", fontSize: 14, marginBottom: 14 }}>Streaks</Text>
        <View style={{ flexDirection: "row", justifyContent: "space-around" }}>
          <View style={{ alignItems: "center" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Flame size={22} color={colors.accent} />
              <Text style={{ fontSize: 28, fontWeight: "700", color: colors.accent }}>{summary.stats.current_streak_days}</Text>
            </View>
            <Text style={{ color: colors.mutedFg, fontSize: 12, marginTop: 4 }}>Current streak</Text>
          </View>
          <View style={{ width: 1, backgroundColor: colors.border }} />
          <View style={{ alignItems: "center" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Star size={22} color={colors.primary} />
              <Text style={{ fontSize: 28, fontWeight: "700", color: colors.primary }}>{summary.stats.longest_streak_days}</Text>
            </View>
            <Text style={{ color: colors.mutedFg, fontSize: 12, marginTop: 4 }}>Personal best</Text>
          </View>
        </View>
      </View>

      {/* Insights */}
      <View style={[card, { padding: 16, marginTop: 10 }]}>
        <Text style={{ color: colors.foreground, fontWeight: "600", fontSize: 14, marginBottom: 12 }}>Insights</Text>
        {[
          { Icon: TrendingUp, text: `Best day: ${summary.best_weekday ?? "—"}` },
          { Icon: Target, text: `Today: ${summary.completions_today} completions` },
          { Icon: Zap, text: `This week: ${summary.completions_this_week}/${summary.possible_this_week} slots` },
        ].map(({ Icon, text }, i) => (
          <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: i > 0 ? 10 : 0 }}>
            <Icon size={15} color={colors.primary} />
            <Text style={{ color: colors.mutedFg, fontSize: 13, flex: 1 }}>{text}</Text>
          </View>
        ))}
      </View>
    </>
  );
}

// ── Categories tab ────────────────────────────────────────────────────────────
function CategoriesTab({ categoryData, maxTotal, habitStats }: {
  categoryData: { key: string; label: string; color: string; iconKey: string; total: number; avgRate: number; habitCount: number }[];
  maxTotal: number;
  habitStats: HabitAnalyticsItem[];
}) {
  if (!categoryData.length) {
    return <Text style={{ color: colors.mutedFg, textAlign: "center", marginTop: 40 }}>No categories yet. Assign categories to your habits!</Text>;
  }

  return (
    <>
      {/* Summary bar chart */}
      <View style={[card, { padding: 16 }]}>
        <Text style={{ color: colors.foreground, fontWeight: "600", fontSize: 14, marginBottom: 14 }}>Completions by category</Text>
        {categoryData.map(cat => (
          <View key={cat.key} style={{ marginBottom: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                <View style={[ct.iconBox, { backgroundColor: cat.color + "20" }]}>
                  <HabitIcon iconKey={cat.iconKey} size={13} color={cat.color} />
                </View>
                <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "600" }}>{cat.label}</Text>
                <Text style={{ color: colors.mutedFg, fontSize: 11 }}>{cat.habitCount} habit{cat.habitCount !== 1 ? "s" : ""}</Text>
              </View>
              <Text style={{ color: cat.color, fontSize: 12, fontWeight: "600" }}>{cat.total}</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <HBar pct={Math.round((cat.total / maxTotal) * 100)} color={cat.color} />
              <Text style={{ color: colors.mutedFg, fontSize: 11, width: 38, textAlign: "right" }}>{cat.avgRate}% rate</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Per-category habit list */}
      {categoryData.map(cat => {
        const habits = habitStats.filter(h => (h.category ?? "other") === cat.key);
        return (
          <View key={cat.key} style={[card, { padding: 16, marginTop: 10 }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <View style={[ct.iconBox, { backgroundColor: cat.color + "20" }]}>
                <HabitIcon iconKey={cat.iconKey} size={14} color={cat.color} />
              </View>
              <Text style={{ color: colors.foreground, fontWeight: "600", fontSize: 14 }}>{cat.label}</Text>
            </View>
            {habits.map(h => (
              <View key={h.habit_id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border }}>
                <Text style={{ color: colors.foreground, fontSize: 13, flex: 1 }} numberOfLines={1}>{h.habit_name}</Text>
                <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                    <Flame size={11} color={colors.accent} />
                    <Text style={{ color: colors.accent, fontSize: 11, fontWeight: "600" }}>{h.current_streak}d</Text>
                  </View>
                  <Text style={{ color: cat.color, fontSize: 11, fontWeight: "600" }}>{Math.round(h.completion_rate * 100)}%</Text>
                </View>
              </View>
            ))}
          </View>
        );
      })}
    </>
  );
}
const ct = StyleSheet.create({
  iconBox: { width: 24, height: 24, borderRadius: 6, alignItems: "center", justifyContent: "center" },
});

// ── Habits tab ────────────────────────────────────────────────────────────────
function HabitsTab({ habitStats, expandedHabit, onToggle }: {
  habitStats: HabitAnalyticsItem[];
  expandedHabit: number | null;
  onToggle: (id: number) => void;
}) {
  if (!habitStats.length) {
    return <Text style={{ color: colors.mutedFg, textAlign: "center", marginTop: 40 }}>No habits yet.</Text>;
  }

  return (
    <>
      {habitStats.map(h => {
        const color = catColor(h.category);
        const expanded = expandedHabit === h.habit_id;
        const rate = Math.round(h.completion_rate * 100);
        return (
          <TouchableOpacity key={h.habit_id} style={[card, { padding: 14, marginBottom: 10 }]} onPress={() => onToggle(h.habit_id)} activeOpacity={0.7}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={[hb.iconBox, { backgroundColor: color + "20" }]}>
                <HabitIcon iconKey={h.icon} size={16} color={color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={hb.name} numberOfLines={1}>{h.habit_name}</Text>
                <Text style={hb.meta}>{catLabel(h.category)} · {h.total_completions} completions</Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 2 }}>
                <Text style={[hb.rate, { color }]}>{rate}%</Text>
                {expanded ? <ChevronUp size={14} color={colors.mutedFg} /> : <ChevronDown size={14} color={colors.mutedFg} />}
              </View>
            </View>

            {expanded && (
              <View style={{ marginTop: 14 }}>
                {/* Streak row */}
                <View style={{ flexDirection: "row", justifyContent: "space-around", paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
                  <View style={{ alignItems: "center" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Flame size={16} color={colors.accent} />
                      <Text style={{ fontSize: 20, fontWeight: "700", color: colors.accent }}>{h.current_streak}</Text>
                    </View>
                    <Text style={{ color: colors.mutedFg, fontSize: 11, marginTop: 2 }}>Current</Text>
                  </View>
                  <View style={{ width: 1, backgroundColor: colors.border }} />
                  <View style={{ alignItems: "center" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Star size={16} color={colors.primary} />
                      <Text style={{ fontSize: 20, fontWeight: "700", color: colors.primary }}>{h.longest_streak}</Text>
                    </View>
                    <Text style={{ color: colors.mutedFg, fontSize: 11, marginTop: 2 }}>Best</Text>
                  </View>
                  <View style={{ width: 1, backgroundColor: colors.border }} />
                  <View style={{ alignItems: "center" }}>
                    <Text style={{ fontSize: 20, fontWeight: "700", color }}>
                      {rate}%
                    </Text>
                    <Text style={{ color: colors.mutedFg, fontSize: 11, marginTop: 2 }}>Rate (90d)</Text>
                  </View>
                </View>

                {/* Completion rate progress bar */}
                <View style={{ paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 5 }}>
                    <Text style={{ color: colors.mutedFg, fontSize: 12 }}>Last 30 days</Text>
                    <Text style={{ color, fontSize: 12, fontWeight: "600" }}>
                      {h.last_30_days.filter(d => d.count).length} / 30 days
                    </Text>
                  </View>
                  <Dots30 days={h.last_30_days} color={color} />
                </View>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </>
  );
}
const hb = StyleSheet.create({
  iconBox: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  name: { color: colors.foreground, fontSize: 14, fontWeight: "600" },
  meta: { color: colors.mutedFg, fontSize: 11, marginTop: 1 },
  rate: { fontSize: 13, fontWeight: "700" },
});

// ── Layout styles ─────────────────────────────────────────────────────────────
const an = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingTop: 6, paddingBottom: 4 },
  title: { color: colors.foreground, fontSize: 24, fontWeight: "700", letterSpacing: -0.5 },
  liveBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.primary + "18", paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary },
  liveText: { color: colors.primary, fontSize: 12, fontWeight: "600" },
  tabBar: { flexDirection: "row", marginHorizontal: 16, marginBottom: 4, backgroundColor: colors.muted, borderRadius: radius.md, padding: 3 },
  tab: { flex: 1, paddingVertical: 7, alignItems: "center", borderRadius: radius.md - 2 },
  tabActive: { backgroundColor: colors.card, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  tabTxt: { color: colors.mutedFg, fontSize: 13, fontWeight: "500" },
  tabTxtActive: { color: colors.foreground, fontWeight: "600" },
  scroll: { padding: 16, paddingBottom: 100 },
  grid: { flexDirection: "row", gap: 10 },
});
