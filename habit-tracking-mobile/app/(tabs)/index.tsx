import { useEffect, useState, useRef, ComponentType } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Modal, ActivityIndicator, Alert, RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Plus, Sparkles, TrendingUp, CheckCircle2, Circle,
  Eye, EyeOff, Pencil, ChevronDown, ChevronUp, Flame, Users,
  Heart, Activity, Brain, BookOpen, Coffee, Target, Star, Zap,
  Sun, Moon, Smile, Home, Music, Code2, Clock, Leaf,
  Award, Droplets, Camera, Globe, Lightbulb, Headphones,
  ShoppingBag, Plane, BarChart2, Dumbbell, UserPlus, LogOut,
} from "lucide-react-native";
import * as SecureStore from "expo-secure-store";
import { getToken } from "../../lib/auth";
import { api, HabitResponse, FriendResponse, ShareInfo, SharedHabitMemberStat } from "../../lib/api";
import { colors, card, banner, radius, avatarColors } from "../../lib/theme";

// ── Icon registry ──────────────────────────────────────────────────────────────
const ICON_MAP: Record<string, ComponentType<any>> = {
  heart: Heart, activity: Activity, brain: Brain, "book-open": BookOpen,
  coffee: Coffee, target: Target, star: Star, zap: Zap, sun: Sun, moon: Moon,
  smile: Smile, home: Home, users: Users, music: Music, code: Code2,
  clock: Clock, leaf: Leaf, flame: Flame, award: Award, droplets: Droplets,
  camera: Camera, globe: Globe, lightbulb: Lightbulb, headphones: Headphones,
  "shopping-bag": ShoppingBag, plane: Plane, "bar-chart": BarChart2, dumbbell: Dumbbell,
};

const ALL_ICONS = [
  "heart", "activity", "dumbbell", "droplets", "flame",
  "brain", "book-open", "lightbulb", "coffee", "headphones", "music",
  "target", "clock", "code", "bar-chart", "award",
  "sun", "moon", "smile", "star", "zap", "home", "leaf", "globe",
  "users", "camera", "plane", "shopping-bag",
];

type Category = { key: string; label: string; icon: string; color: string };
const CATEGORIES: Category[] = [
  { key: "health",    label: "Health",    icon: "heart",     color: "#ef4444" },
  { key: "fitness",   label: "Fitness",   icon: "dumbbell",  color: "#f97316" },
  { key: "mind",      label: "Mind",      icon: "brain",     color: "#8b5cf6" },
  { key: "learning",  label: "Learning",  icon: "book-open", color: "#3b82f6" },
  { key: "social",    label: "Social",    icon: "users",     color: "#ec4899" },
  { key: "work",      label: "Work",      icon: "target",    color: "#10b981" },
  { key: "finance",   label: "Finance",   icon: "bar-chart", color: "#f59e0b" },
  { key: "lifestyle", label: "Lifestyle", icon: "sun",       color: "#06b6d4" },
  { key: "other",     label: "Other",     icon: "star",      color: "#6b7280" },
];

function categoryColor(cat: string | null) {
  return CATEGORIES.find(c => c.key === cat)?.color ?? colors.primary;
}

function HabitIcon({ iconKey, size, color }: { iconKey: string | null; size: number; color: string }) {
  const Icon = iconKey ? (ICON_MAP[iconKey] ?? CheckCircle2) : CheckCircle2;
  return <Icon size={size} color={color} />;
}

function localDateStr(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function todayStr() { return localDateStr(new Date()); }
function formatDate(d: Date) { return localDateStr(d); }
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function buildWeeks(n: number): Date[][] {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days: Date[] = [];
  const start = new Date(today); start.setDate(today.getDate() - n * 7 + 1);
  for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) days.push(new Date(d));
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}

const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAY_LABELS: Record<number, string> = { 1: "Mon", 3: "Wed", 5: "Fri" };

function heatColor(count: number) {
  if (count === 0) return "#E2E5EC";
  if (count === 1) return "#9ED4BC";
  if (count === 2) return "#5BBD97";
  if (count <= 4) return "#2FA872";
  return "#1D7350";
}

function habitColor(idx: number) { return avatarColors[idx % avatarColors.length]; }

function BigHeatmap({ counts }: { counts: Map<string, number> }) {
  const weeks = buildWeeks(26);
  const monthLabels: { label: string; col: number }[] = [];
  weeks.forEach((week, wi) => {
    const first = week[0];
    if (first && (wi === 0 || first.getDate() <= 7))
      monthLabels.push({ label: MONTH_SHORT[first.getMonth()], col: wi });
  });
  return (
    <View>
      <View style={{ flexDirection: "row", marginBottom: 4 }}>
        <View style={{ width: 26 }} />
        <View style={{ flex: 1, flexDirection: "row" }}>
          {weeks.map((_, wi) => {
            const ml = monthLabels.find(m => m.col === wi);
            return <View key={wi} style={{ flex: 1 }}>{ml && <Text style={hm.monthLabel}>{ml.label}</Text>}</View>;
          })}
        </View>
      </View>
      <View style={{ flexDirection: "row" }}>
        <View style={{ width: 26, gap: 2 }}>
          {[0,1,2,3,4,5,6].map(di => (
            <View key={di} style={hm.dayLabelCell}>
              {DAY_LABELS[di] && <Text style={hm.dayLabel}>{DAY_LABELS[di]}</Text>}
            </View>
          ))}
        </View>
        <View style={{ flex: 1, flexDirection: "row", gap: 2 }}>
          {weeks.map((week, wi) => (
            <View key={wi} style={{ flex: 1, gap: 2 }}>
              {[0,1,2,3,4,5,6].map(di => {
                const day = week[di];
                const count = day ? (counts.get(formatDate(day)) ?? 0) : 0;
                return <View key={di} style={[hm.cell, { backgroundColor: heatColor(count) }]} />;
              })}
            </View>
          ))}
        </View>
      </View>
      <View style={hm.legend}>
        <Text style={hm.legendLabel}>Less</Text>
        {[0,1,2,3,4].map(i => <View key={i} style={[hm.legendCell, { backgroundColor: heatColor(i) }]} />)}
        <Text style={hm.legendLabel}>More</Text>
      </View>
    </View>
  );
}

function MiniHeatmap({ dates, color }: { dates: Set<string>; color: string }) {
  const weeks = buildWeeks(18);
  return (
    <View style={{ flexDirection: "row", gap: 2, marginTop: 8 }}>
      {weeks.map((week, wi) => (
        <View key={wi} style={{ flex: 1, gap: 2 }}>
          {week.map((day, di) => (
            <View key={di} style={[hm.miniCell, { backgroundColor: dates.has(formatDate(day)) ? color : "#E2E5EC" }]} />
          ))}
        </View>
      ))}
    </View>
  );
}

const hm = StyleSheet.create({
  monthLabel: { color: colors.mutedFg, fontSize: 9 },
  dayLabelCell: { aspectRatio: 1, justifyContent: "center" },
  dayLabel: { color: colors.mutedFg, fontSize: 9 },
  cell: { aspectRatio: 1, borderRadius: 2 },
  miniCell: { aspectRatio: 1, borderRadius: 2 },
  legend: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 6, justifyContent: "flex-end" },
  legendCell: { width: 10, height: 10, borderRadius: 2 },
  legendLabel: { color: colors.mutedFg, fontSize: 9 },
});

interface HabitState {
  habit: HabitResponse; dates: Set<string>; note: string; streak: number; index: number;
}

function HabitCard({ hs, token, shareInfo, onToggle, onEdit, onShare, onLeave }: {
  hs: HabitState; token: string; shareInfo?: ShareInfo;
  onToggle: () => void; onEdit: () => void;
  onShare: () => void; onLeave: () => void;
}) {
  const today = todayStr();
  const done = hs.dates.has(today);
  const color = hs.habit.category ? categoryColor(hs.habit.category) : habitColor(hs.index);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState(hs.note);
  const [membersOpen, setMembersOpen] = useState(false);
  const [members, setMembers] = useState<SharedHabitMemberStat[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isShared = shareInfo && shareInfo.group_id !== null;
  const isOwner = shareInfo?.is_owner ?? true;

  useEffect(() => { setNoteText(hs.note); }, [hs.note]);

  function handleNote(t: string) {
    setNoteText(t);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try { await api.habits.updateNote(token, hs.habit.id, today, t || null); } catch {}
    }, 800);
  }

  async function toggleMembers() {
    if (!membersOpen && isShared) {
      try {
        const m = await api.sharedHabits.members(token, hs.habit.id);
        setMembers(m);
      } catch {}
    }
    setMembersOpen(v => !v);
  }

  function handleLeave() {
    const title = isOwner ? "Dissolve shared habit?" : "Leave shared habit?";
    const msg = isOwner
      ? "This will remove all members from the shared habit."
      : "You will no longer share progress with the group.";
    Alert.alert(title, msg, [
      { text: "Cancel", style: "cancel" },
      { text: isOwner ? "Dissolve" : "Leave", style: "destructive", onPress: onLeave },
    ]);
  }

  return (
    <View style={[card, { marginBottom: 10, opacity: done ? 0.85 : 1 }]}>
      <View style={hc.row}>
        <View style={[hc.iconBox, { backgroundColor: color + "20" }]}>
          <HabitIcon iconKey={hs.habit.icon} size={20} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[hc.name, done && hc.nameDone]} numberOfLines={1}>{hs.habit.name}</Text>
          {hs.habit.description ? <Text style={hc.desc} numberOfLines={1}>{hs.habit.description}</Text> : null}
          {isShared && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 }}>
              <Users size={11} color={colors.primary} />
              <Text style={{ fontSize: 11, color: colors.primary }}>Shared</Text>
            </View>
          )}
        </View>
        <View style={hc.actions}>
          {hs.streak > 0 && (
            <View style={hc.streakPill}>
              <Flame size={11} color="#92400e" />
              <Text style={hc.streakTxt}>{hs.streak}</Text>
            </View>
          )}
          {isShared && (
            <TouchableOpacity onPress={toggleMembers} style={hc.iconBtn}>
              <Users size={15} color={membersOpen ? colors.primary : colors.mutedFg} />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => setNoteOpen(v => !v)} style={hc.iconBtn}>
            {noteOpen ? <ChevronUp size={16} color={colors.mutedFg} /> : <ChevronDown size={16} color={colors.mutedFg} />}
          </TouchableOpacity>
          {(!isShared || isOwner) && (
            <>
              <TouchableOpacity onPress={onShare} style={hc.iconBtn}>
                <UserPlus size={14} color={colors.mutedFg} />
              </TouchableOpacity>
              <TouchableOpacity onPress={onEdit} style={hc.iconBtn}>
                <Pencil size={14} color={colors.mutedFg} />
              </TouchableOpacity>
            </>
          )}
          {isShared && (
            <TouchableOpacity onPress={handleLeave} style={hc.iconBtn}>
              <LogOut size={14} color={colors.destructive} />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={onToggle}>
            {done
              ? <CheckCircle2 size={26} color={colors.primary} />
              : <Circle size={26} color={colors.border} />}
          </TouchableOpacity>
        </View>
      </View>

      {membersOpen && members.length > 0 && (
        <View style={{ paddingHorizontal: 14, paddingBottom: 12 }}>
          <View style={{ backgroundColor: colors.muted, borderRadius: radius.md, overflow: "hidden" }}>
            <View style={{ flexDirection: "row", paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={[hc.memberHeader, { flex: 1 }]}>Member</Text>
              <Text style={[hc.memberHeader, { width: 50, textAlign: "center" }]}>Streak</Text>
              <Text style={[hc.memberHeader, { width: 50, textAlign: "center" }]}>Rate</Text>
            </View>
            {members.map(m => {
              const displayName = m.full_name ?? m.email;
              return (
              <View key={m.user_id} style={{ flexDirection: "row", paddingHorizontal: 12, paddingVertical: 8, alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.border + "60" }}>
                <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }}>
                  {m.is_owner && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary }} />}
                  <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: m.is_owner ? "600" : "400" }} numberOfLines={1}>{displayName}</Text>
                </View>
                <View style={{ width: 50, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3 }}>
                  <Flame size={12} color="#f97316" />
                  <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "600" }}>{m.streak}</Text>
                </View>
                <Text style={{ width: 50, color: colors.primary, fontSize: 13, fontWeight: "600", textAlign: "center" }}>{m.completion_rate}%</Text>
              </View>
            )})}
          </View>
        </View>
      )}

      {noteOpen && (
        <View style={{ paddingHorizontal: 14, paddingBottom: 10 }}>
          <TextInput
            style={hc.noteInput}
            placeholder="Add a note for today..."
            placeholderTextColor={colors.mutedFg}
            value={noteText}
            onChangeText={handleNote}
            multiline
          />
        </View>
      )}

      <View style={{ paddingHorizontal: 14, paddingBottom: 10 }}>
        <MiniHeatmap dates={hs.dates} color={color} />
      </View>
    </View>
  );
}

const hc = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  iconBox: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 15, fontWeight: "600", color: colors.foreground },
  nameDone: { textDecorationLine: "line-through", opacity: 0.6 },
  desc: { fontSize: 12, color: colors.mutedFg, marginTop: 2 },
  actions: { flexDirection: "row", alignItems: "center", gap: 4 },
  streakPill: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: colors.accent + "40", borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  streakTxt: { fontSize: 11, fontWeight: "600", color: "#92400e" },
  iconBtn: { padding: 4 },
  noteInput: { backgroundColor: colors.muted, borderRadius: radius.md, padding: 10, color: colors.foreground, fontSize: 14, minHeight: 60 },
  memberHeader: { color: colors.mutedFg, fontSize: 11, fontWeight: "600", textTransform: "uppercase" },
});

type VisOption = "friends" | "selected" | "private";
const VIS_OPTIONS: { key: VisOption; label: string; Icon: any }[] = [
  { key: "friends", label: "All friends", Icon: Eye },
  { key: "selected", label: "Select", Icon: Users },
  { key: "private", label: "Nobody", Icon: EyeOff },
];

function FriendPicker({ token, selectedIds, onChange }: {
  token: string; selectedIds: Set<number>; onChange: (ids: Set<number>) => void;
}) {
  const [friends, setFriends] = useState<FriendResponse[]>([]);
  useEffect(() => {
    api.friends.list(token).then(setFriends).catch(() => {});
  }, []);

  function toggle(id: number) {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    onChange(next);
  }

  if (!friends.length) return <Text style={{ color: colors.mutedFg, fontSize: 13, marginTop: 8 }}>No friends yet.</Text>;

  return (
    <View style={{ marginTop: 10, gap: 6 }}>
      {friends.map(f => {
        const on = selectedIds.has(f.id);
        const name = f.full_name ?? f.email;
        return (
          <TouchableOpacity key={f.id} onPress={() => toggle(f.id)}
            style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 10, backgroundColor: on ? colors.primary + "12" : colors.muted, borderRadius: radius.md, borderWidth: 1, borderColor: on ? colors.primary : colors.border }}>
            <View style={{ width: 20, height: 20, borderRadius: 4, borderWidth: 2, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : "transparent", alignItems: "center", justifyContent: "center" }}>
              {on && <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>✓</Text>}
            </View>
            <Text style={{ color: colors.foreground, fontSize: 14, flex: 1 }}>{name}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function CategoryPicker({ value, onChange }: { value: string | null; onChange: (k: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
      <View style={{ flexDirection: "row", gap: 8, paddingVertical: 4 }}>
        {CATEGORIES.map(cat => {
          const CatIcon = ICON_MAP[cat.icon] ?? Star;
          const active = value === cat.key;
          return (
            <TouchableOpacity
              key={cat.key}
              onPress={() => onChange(cat.key)}
              style={[cp.chip, active && { borderColor: cat.color, backgroundColor: cat.color + "18" }]}
            >
              <CatIcon size={14} color={active ? cat.color : colors.mutedFg} />
              <Text style={[cp.chipTxt, active && { color: cat.color, fontWeight: "600" }]}>{cat.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
}
const cp = StyleSheet.create({
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  chipTxt: { color: colors.mutedFg, fontSize: 13 },
});

function IconPickerGrid({ value, onChange }: { value: string | null; onChange: (k: string) => void }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
      {ALL_ICONS.map(key => {
        const Ic = ICON_MAP[key] ?? Star;
        const active = value === key;
        return (
          <TouchableOpacity
            key={key}
            onPress={() => onChange(key)}
            style={[ip.btn, active && { borderColor: colors.primary, backgroundColor: colors.primary + "15" }]}
          >
            <Ic size={20} color={active ? colors.primary : colors.mutedFg} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
const ip = StyleSheet.create({
  btn: { width: 44, height: 44, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, alignItems: "center", justifyContent: "center" },
});

function EditModal({ visible, habit, token, onClose, onSaved, onDeleted }: {
  visible: boolean; habit: HabitResponse | null; token: string;
  onClose: () => void; onSaved: () => void; onDeleted: () => void;
}) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [vis, setVis] = useState<VisOption>("friends");
  const [selectedFriends, setSelectedFriends] = useState<Set<number>>(new Set());
  const [category, setCategory] = useState<string | null>(null);
  const [icon, setIcon] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!habit) return;
    setName(habit.name);
    setDesc(habit.description ?? "");
    setVis((habit.visibility as VisOption) ?? "friends");
    setCategory(habit.category ?? null);
    setIcon(habit.icon ?? null);
    if (habit.visibility === "selected") {
      api.habits.getVisibleTo(token, habit.id)
        .then(ids => setSelectedFriends(new Set(ids)))
        .catch(() => {});
    } else {
      setSelectedFriends(new Set());
    }
  }, [habit]);

  function pickCategory(key: string) {
    setCategory(key);
    // Auto-set icon to category default only if no icon chosen yet
    if (!icon) {
      const def = CATEGORIES.find(c => c.key === key)?.icon ?? null;
      setIcon(def);
    }
  }

  async function save() {
    if (!habit || !name.trim()) return;
    setLoading(true);
    try {
      await api.habits.update(token, habit.id, { name: name.trim(), description: desc.trim() || null, visibility: vis, category, icon });
      if (vis === "selected") {
        await api.habits.setVisibleTo(token, habit.id, [...selectedFriends]);
      }
      onSaved();
    }
    catch (e: any) { Alert.alert("Error", e?.message); }
    finally { setLoading(false); }
  }

  async function del() {
    if (!habit) return;
    Alert.alert("Delete habit", "This action cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        setLoading(true);
        try { await api.habits.delete(token, habit.id); onDeleted(); }
        catch (e: any) { Alert.alert("Error", e?.message); }
        finally { setLoading(false); }
      }},
    ]);
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={em.container}>
        <View style={em.header}>
          <TouchableOpacity onPress={onClose}><Text style={em.cancel}>Cancel</Text></TouchableOpacity>
          <Text style={em.title}>Edit Habit</Text>
          <TouchableOpacity onPress={save} disabled={loading}>
            {loading ? <ActivityIndicator color={colors.primary} /> : <Text style={em.save}>Save</Text>}
          </TouchableOpacity>
        </View>
        <ScrollView style={{ padding: 16 }}>
          <Text style={em.label}>Name</Text>
          <TextInput style={em.input} value={name} onChangeText={setName} placeholder="Habit name" placeholderTextColor={colors.mutedFg} />
          <Text style={em.label}>Description</Text>
          <TextInput style={[em.input, { height: 80 }]} value={desc} onChangeText={setDesc} placeholder="Optional" placeholderTextColor={colors.mutedFg} multiline />
          <Text style={em.label}>Category</Text>
          <CategoryPicker value={category} onChange={pickCategory} />
          <Text style={em.label}>Icon</Text>
          <IconPickerGrid value={icon} onChange={setIcon} />
          <Text style={em.label}>Who can see this in the feed?</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {VIS_OPTIONS.map(({ key, label, Icon }) => (
              <TouchableOpacity key={key} style={[em.visBtn, vis === key && em.visBtnActive]} onPress={() => setVis(key)}>
                <Icon size={15} color={vis === key ? colors.primary : colors.mutedFg} />
                <Text style={[em.visTxt, vis === key && { color: colors.primary, fontWeight: "600" }]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {vis === "selected" && (
            <FriendPicker token={token} selectedIds={selectedFriends} onChange={setSelectedFriends} />
          )}
          <TouchableOpacity style={em.deleteBtn} onPress={del}>
            <Text style={em.deleteTxt}>Delete habit</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

function AddModal({ visible, token, onClose, onAdded }: {
  visible: boolean; token: string; onClose: () => void; onAdded: () => void;
}) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [vis, setVis] = useState<VisOption>("friends");
  const [selectedFriends, setSelectedFriends] = useState<Set<number>>(new Set());
  const [category, setCategory] = useState<string | null>(null);
  const [icon, setIcon] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function pickCategory(key: string) {
    setCategory(key);
    if (!icon) setIcon(CATEGORIES.find(c => c.key === key)?.icon ?? null);
  }

  function reset() {
    setName(""); setDesc(""); setVis("friends");
    setSelectedFriends(new Set()); setCategory(null); setIcon(null);
  }

  async function create() {
    if (!name.trim()) { Alert.alert("Error", "Name is required"); return; }
    setLoading(true);
    try {
      const created = await api.habits.create(token, {
        name: name.trim(), description: desc.trim() || null,
        visibility: vis, category, icon,
      });
      if (vis === "selected" && selectedFriends.size > 0) {
        await api.habits.setVisibleTo(token, created.id, [...selectedFriends]);
      }
      reset();
      onAdded();
    } catch (e: any) { Alert.alert("Error", e?.message); }
    finally { setLoading(false); }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={em.container}>
        <View style={em.header}>
          <TouchableOpacity onPress={() => { reset(); onClose(); }}><Text style={em.cancel}>Cancel</Text></TouchableOpacity>
          <Text style={em.title}>New Habit</Text>
          <TouchableOpacity onPress={create} disabled={loading}>
            {loading ? <ActivityIndicator color={colors.primary} /> : <Text style={em.save}>Add</Text>}
          </TouchableOpacity>
        </View>
        <ScrollView style={{ padding: 16 }}>
          <Text style={em.label}>Name *</Text>
          <TextInput style={em.input} value={name} onChangeText={setName} placeholder="e.g. Read 30 min" placeholderTextColor={colors.mutedFg} />
          <Text style={em.label}>Description</Text>
          <TextInput style={[em.input, { height: 80 }]} value={desc} onChangeText={setDesc} placeholder="Optional" placeholderTextColor={colors.mutedFg} multiline />
          <Text style={em.label}>Category</Text>
          <CategoryPicker value={category} onChange={pickCategory} />
          <Text style={em.label}>Icon</Text>
          <IconPickerGrid value={icon} onChange={setIcon} />
          <Text style={em.label}>Who can see this in the feed?</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {VIS_OPTIONS.map(({ key, label, Icon }) => (
              <TouchableOpacity key={key} style={[em.visBtn, vis === key && em.visBtnActive]} onPress={() => setVis(key)}>
                <Icon size={15} color={vis === key ? colors.primary : colors.mutedFg} />
                <Text style={[em.visTxt, vis === key && { color: colors.primary, fontWeight: "600" }]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {vis === "selected" && (
            <FriendPicker token={token} selectedIds={selectedFriends} onChange={setSelectedFriends} />
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const em = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.card },
  title: { color: colors.foreground, fontSize: 17, fontWeight: "600" },
  cancel: { color: colors.mutedFg, fontSize: 16 },
  save: { color: colors.primary, fontSize: 16, fontWeight: "600" },
  label: { color: colors.mutedFg, fontSize: 13, fontWeight: "500", marginBottom: 6, marginTop: 16 },
  input: { backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 12, color: colors.foreground, fontSize: 16 },
  visBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 14 },
  visBtnActive: { borderColor: colors.primary, backgroundColor: colors.primary + "10" },
  visTxt: { color: colors.mutedFg, fontSize: 15 },
  deleteBtn: { marginTop: 32, backgroundColor: colors.destructive + "15", borderRadius: radius.md, padding: 16, alignItems: "center", borderWidth: 1, borderColor: colors.destructive + "30" },
  deleteTxt: { color: colors.destructive, fontWeight: "600", fontSize: 16 },
});

function ShareModal({ visible, habitId, habitName, token, onClose }: {
  visible: boolean; habitId: number | null; habitName: string; token: string; onClose: () => void;
}) {
  const [friends, setFriends] = useState<FriendResponse[]>([]);
  const [inviting, setInviting] = useState<number | null>(null);
  const [invited, setInvited] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (visible && token) {
      api.friends.list(token).then(f => setFriends(f.filter(fr => fr.status === "accepted"))).catch(() => {});
      setInvited(new Set());
    }
  }, [visible]);

  async function invite(userId: number) {
    if (!habitId) return;
    setInviting(userId);
    try {
      await api.sharedHabits.invite(token, habitId, userId);
      setInvited(prev => new Set(prev).add(userId));
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to invite");
    } finally {
      setInviting(null);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" }}>
        <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40, maxHeight: "70%" }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "700" }}>Share "{habitName}"</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={{ color: colors.mutedFg, fontSize: 16 }}>✕</Text>
            </TouchableOpacity>
          </View>
          {friends.length === 0 ? (
            <Text style={{ color: colors.mutedFg, textAlign: "center", paddingVertical: 24 }}>No accepted friends to invite.</Text>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              {friends.map((f, idx) => {
                const done = invited.has(f.id);
                return (
                  <View key={f.id} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: avatarColors[idx % avatarColors.length], alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                      <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>{(f.full_name ?? f.email)[0].toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.foreground, fontWeight: "600", fontSize: 14 }}>{f.full_name ?? f.email}</Text>
                      <Text style={{ color: colors.mutedFg, fontSize: 12 }}>{f.email}</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => !done && invite(f.id)}
                      style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.md, backgroundColor: done ? colors.muted : colors.primary }}
                      disabled={inviting === f.id || done}
                    >
                      {inviting === f.id
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Text style={{ color: done ? colors.mutedFg : "#fff", fontWeight: "600", fontSize: 13 }}>{done ? "Invited" : "Invite"}</Text>
                      }
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

function ProgressBar({ value, total }: { value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <View>
      <View style={pb.bar}><View style={[pb.fill, { width: `${pct}%` }]} /></View>
      <Text style={pb.label}>{pct}% complete</Text>
    </View>
  );
}
const pb = StyleSheet.create({
  bar: { height: 10, backgroundColor: colors.secondary, borderRadius: radius.full, overflow: "hidden", marginTop: 8 },
  fill: { height: 10, backgroundColor: colors.primary, borderRadius: radius.full },
  label: { color: colors.mutedFg, fontSize: 12, marginTop: 4 },
});

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<{ id?: number; full_name?: string | null; email?: string } | null>(null);
  const [habits, setHabits] = useState<HabitState[]>([]);
  const [heatmapCounts, setHeatmapCounts] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [addVisible, setAddVisible] = useState(false);
  const [editHabit, setEditHabit] = useState<HabitResponse | null>(null);
  const [shareHabitId, setShareHabitId] = useState<number | null>(null);
  const [shareHabitName, setShareHabitName] = useState("");
  const [shareInfoMap, setShareInfoMap] = useState<Map<number, ShareInfo>>(new Map());
  const [dailyInsight, setDailyInsight] = useState<string | null>(null);

  useEffect(() => { getToken().then(t => { setToken(t); if (t) init(t); }); }, []);

  async function loadDailyInsight(t: string, userId: number) {
    const today = todayStr();
    const key = `adet_insight_${userId}_${today}`;
    try {
      const cached = await SecureStore.getItemAsync(key);
      if (cached) { setDailyInsight(cached); return; }
      const { insight } = await api.ai.dailyInsight(t);
      setDailyInsight(insight);
      await SecureStore.setItemAsync(key, insight.slice(0, 2048));
    } catch {}
  }

  async function init(t: string) {
    try {
      const [rawHabits, heatmap, me] = await Promise.all([api.habits.list(t), api.analytics.heatmap(t), api.auth.me(t)]);
      setUser(me);
      loadDailyInsight(t, me.id);
      const counts = new Map<string, number>();
      heatmap.days.forEach(d => { if (d.count > 0) counts.set(d.date, d.count); });
      setHeatmapCounts(counts);
      const today = new Date();
      const from = new Date(today); from.setDate(today.getDate() - 180);
      const states: HabitState[] = await Promise.all(rawHabits.map(async (h, idx) => {
        try {
          const comps = await api.habits.listCompletions(t, h.id, { from_date: formatDate(from), to_date: formatDate(today) });
          const dates = new Set(comps.map(c => c.completed_date.slice(0, 10)));
          const todayComp = comps.find(c => c.completed_date.slice(0, 10) === todayStr());
          let streak = 0; const d = new Date(); d.setHours(0,0,0,0);
          while (dates.has(formatDate(d))) { streak++; d.setDate(d.getDate() - 1); }
          return { habit: h, dates, note: todayComp?.note ?? "", streak, index: idx };
        } catch { return { habit: h, dates: new Set<string>(), note: "", streak: 0, index: idx }; }
      }));
      setHabits(states);
      // load share info for all habits in parallel
      const infos = await Promise.allSettled(rawHabits.map(h => api.sharedHabits.shareInfo(t, h.id)));
      const infoMap = new Map<number, ShareInfo>();
      infos.forEach((r, i) => { if (r.status === "fulfilled") infoMap.set(rawHabits[i].id, r.value); });
      setShareInfoMap(infoMap);
    } catch { Alert.alert("Error", "Failed to load habits. Please try again."); }
    finally { setLoading(false); setRefreshing(false); }
  }

  async function toggleCompletion(hs: HabitState) {
    if (!token) return;
    const today = todayStr(); const done = hs.dates.has(today);
    setHabits(prev => prev.map(h =>
      h.habit.id === hs.habit.id ? {
        ...h, streak: done ? Math.max(0, h.streak - 1) : h.streak + 1,
        dates: (() => { const s = new Set(h.dates); done ? s.delete(today) : s.add(today); return s; })(),
      } : h
    ));
    setHeatmapCounts(prev => {
      const next = new Map(prev);
      const cur = next.get(today) ?? 0;
      const newVal = done ? Math.max(0, cur - 1) : cur + 1;
      if (newVal === 0) next.delete(today); else next.set(today, newVal);
      return next;
    });
    try {
      if (done) await api.habits.removeCompletion(token, hs.habit.id, today);
      else await api.habits.complete(token, hs.habit.id, today);
    } catch { if (token) init(token); }
  }

  const today = todayStr();
  const doneToday = habits.filter(h => h.dates.has(today)).length;
  const displayName = user?.full_name ?? user?.email?.split("@")[0] ?? "there";

  if (!token) return null;

  return (
    <View style={[ds.container, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={ds.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); if (token) init(token); }} tintColor={colors.primary} />}
      >
        <View style={ds.headerRow}>
          <View>
            <Text style={ds.greeting}>{getGreeting()}</Text>
            <Text style={ds.userName}>{displayName}</Text>
          </View>
          <TouchableOpacity style={ds.fab} onPress={() => setAddVisible(true)}>
            <Plus size={22} color="#fff" strokeWidth={2.5} />
          </TouchableOpacity>
        </View>

        {/* AI Insight banner */}
        <View style={[banner, { padding: 16, marginBottom: 16, flexDirection: "row", alignItems: "center", gap: 12 }]}>
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" }}>
            <Sparkles size={20} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>AI Insight</Text>
            <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 13, marginTop: 2 }}>
              {dailyInsight ?? "Loading your personalized insight…"}
            </Text>
          </View>
          <TrendingUp size={18} color="rgba(255,255,255,0.7)" />
        </View>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} size="large" />
        ) : (
          <>
            <View style={[card, ds.section]}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={ds.sectionLabel}>Today's Progress</Text>
                <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 14 }}>{doneToday}/{habits.length}</Text>
              </View>
              <ProgressBar value={doneToday} total={habits.length} />
            </View>

            <View style={[card, ds.section]}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <Text style={ds.sectionLabel}>Activity</Text>
                <Text style={{ color: colors.mutedFg, fontSize: 12 }}>
                  {Array.from(heatmapCounts.values()).reduce((a, b) => a + b, 0)} completions
                </Text>
              </View>
              <BigHeatmap counts={heatmapCounts} />
            </View>

            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <Text style={ds.sectionLabel}>Today's Habits</Text>
              <Text style={{ color: colors.mutedFg, fontSize: 12 }}>{habits.length} habits</Text>
            </View>

            {habits.length === 0 ? (
              <View style={[card, { padding: 32, alignItems: "center" }]}>
                <Sparkles size={32} color={colors.primary} style={{ marginBottom: 12 }} />
                <Text style={{ color: colors.foreground, fontWeight: "600", fontSize: 16, marginBottom: 4 }}>No habits yet</Text>
                <Text style={{ color: colors.mutedFg, textAlign: "center", fontSize: 14 }}>Tap + to create your first habit</Text>
              </View>
            ) : habits.map(hs => (
              <HabitCard
                key={hs.habit.id}
                hs={hs}
                token={token}
                shareInfo={shareInfoMap.get(hs.habit.id)}
                onToggle={() => toggleCompletion(hs)}
                onEdit={() => setEditHabit(hs.habit)}
                onShare={() => { setShareHabitId(hs.habit.id); setShareHabitName(hs.habit.name); }}
                onLeave={async () => {
                  const info = shareInfoMap.get(hs.habit.id);
                  if (!info?.group_id) return;
                  try {
                    await api.sharedHabits.leave(token, info.group_id);
                    init(token);
                  } catch (e: any) { Alert.alert("Error", e?.message); }
                }}
              />
            ))}
          </>
        )}
      </ScrollView>

      <AddModal visible={addVisible} token={token} onClose={() => setAddVisible(false)} onAdded={() => { setAddVisible(false); init(token); }} />
      <EditModal visible={!!editHabit} habit={editHabit} token={token} onClose={() => setEditHabit(null)} onSaved={() => { setEditHabit(null); init(token); }} onDeleted={() => { setEditHabit(null); init(token); }} />
      <ShareModal
        visible={shareHabitId !== null}
        habitId={shareHabitId}
        habitName={shareHabitName}
        token={token}
        onClose={() => setShareHabitId(null)}
      />
    </View>
  );
}

const ds = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: 16, paddingBottom: 100 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  greeting: { color: colors.mutedFg, fontSize: 14 },
  userName: { color: colors.foreground, fontSize: 24, fontWeight: "700", letterSpacing: -0.5 },
  fab: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 4 },
  section: { padding: 14, marginBottom: 12 },
  sectionLabel: { color: colors.foreground, fontSize: 14, fontWeight: "600" },
});
