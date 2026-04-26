import { useEffect, useState, useRef } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, ActivityIndicator, Alert, RefreshControl, Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Heart, MessageCircle, Search, UserPlus, UserCheck, UserX, Send, ChevronDown, ChevronUp, Users,
} from "lucide-react-native";
import { getToken } from "../../lib/auth";
import { api, FriendResponse, FriendSearchResult, ActivityFeedItemResponse, HabitResponse } from "../../lib/api";
import { colors, card, radius, avatarColors } from "../../lib/theme";

function Avatar({ name, size = 36, colorIndex = 0 }: { name: string; size?: number; colorIndex?: number }) {
  const letter = (name?.[0] ?? "?").toUpperCase();
  const bg = avatarColors[colorIndex % avatarColors.length];
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#fff", fontWeight: "700", fontSize: size * 0.38 }}>{letter}</Text>
    </View>
  );
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Feed ──────────────────────────────────────────────────────────────────────
const PAGE_SIZE = 10;

function FeedTab({ token }: { token: string }) {
  const [items, setItems] = useState<ActivityFeedItemResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState("");
  const [commentText, setCommentText] = useState<Record<number, string>>({});
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  async function load() {
    try {
      const page = await api.feed.list(token, false, 0, PAGE_SIZE);
      setItems(page);
      setHasMore(page.length === PAGE_SIZE);
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const page = await api.feed.list(token, false, items.length, PAGE_SIZE);
      setItems(prev => [...prev, ...page]);
      setHasMore(page.length === PAGE_SIZE);
    } catch {}
    finally { setLoadingMore(false); }
  }

  useEffect(() => { load(); }, []);

  const filtered = search.trim()
    ? items.filter(item => {
        const name = (item.user_full_name ?? item.user_email ?? "").toLowerCase();
        return name.includes(search.trim().toLowerCase());
      })
    : items;

  async function sendComment(id: number) {
    const text = (commentText[id] ?? "").trim();
    if (!text) return;
    try { await api.feed.addComment(token, id, text); setCommentText(p => ({ ...p, [id]: "" })); load(); }
    catch (e: any) { Alert.alert("Error", e?.message); }
  }

  function toggle(id: number) {
    setExpanded(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }

  function habitName(item: ActivityFeedItemResponse) {
    const p = item.payload as any;
    return p?.habit_name ?? p?.name ?? "a habit";
  }

  return (
    <View style={{ flex: 1 }}>
      {/* Search bar */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Search size={16} color={colors.mutedFg} />
        <TextInput
          style={{ flex: 1, color: colors.foreground, fontSize: 14 }}
          placeholder="Search by name…"
          placeholderTextColor={colors.mutedFg}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {loading ? <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} /> : (
    <ScrollView
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
      contentContainerStyle={{ padding: 16, paddingBottom: 100, gap: 10 }}
    >
      {filtered.length === 0 && (
        <View style={{ alignItems: "center", paddingTop: 60 }}>
          <Users size={48} color={colors.border} style={{ marginBottom: 12 }} />
          <Text style={{ color: colors.foreground, fontWeight: "600", fontSize: 16 }}>
            {search ? "No results" : "No activity yet"}
          </Text>
          <Text style={{ color: colors.mutedFg, textAlign: "center", marginTop: 4, fontSize: 14 }}>
            {search ? `Nobody named "${search}" found` : "Add some friends to see their activity here"}
          </Text>
        </View>
      )}
      {filtered.map((item, idx) => {
        const exp = expanded.has(item.id);
        const name = item.user_full_name ?? item.user_email ?? "Someone";
        return (
          <View key={item.id} style={card}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 12 }}>
              <Avatar name={name} colorIndex={idx} />
              <View style={{ flex: 1 }}>
                <Text style={fd.eventText}>
                  <Text style={{ fontWeight: "700" }}>{name}</Text>
                  <Text style={{ color: colors.mutedFg }}> completed </Text>
                  <Text style={{ fontWeight: "700", color: colors.primary }}>{habitName(item)}</Text>
                </Text>
                <Text style={fd.time}>{timeAgo(item.created_at)}</Text>
                <View style={fd.reactionRow}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Heart size={14} color={colors.mutedFg} />
                    <Text style={fd.reactionCount}>{item.reactions?.length ?? 0}</Text>
                  </View>
                  <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 4 }} onPress={() => toggle(item.id)}>
                    <MessageCircle size={14} color={colors.mutedFg} />
                    <Text style={fd.reactionCount}>{item.comments_count}</Text>
                    {exp ? <ChevronUp size={12} color={colors.mutedFg} /> : <ChevronDown size={12} color={colors.mutedFg} />}
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {exp && (
              <View style={{ borderTopWidth: 1, borderTopColor: colors.border, padding: 12, gap: 8 }}>
                {item.comments.map(c => (
                  <View key={c.id} style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
                    <Avatar name={c.user_full_name ?? c.user_email ?? "?"} size={28} colorIndex={c.user_id % 5} />
                    <View style={{ flex: 1, backgroundColor: colors.muted, borderRadius: radius.md, padding: 8 }}>
                      <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "600" }}>{c.user_full_name ?? c.user_email}</Text>
                      <Text style={{ color: colors.foreground, fontSize: 13, marginTop: 2 }}>{c.text}</Text>
                    </View>
                  </View>
                ))}
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TextInput
                    style={fd.commentInput}
                    placeholder="Write a comment..."
                    placeholderTextColor={colors.mutedFg}
                    value={commentText[item.id] ?? ""}
                    onChangeText={t => setCommentText(p => ({ ...p, [item.id]: t }))}
                  />
                  <TouchableOpacity style={fd.sendBtn} onPress={() => sendComment(item.id)}>
                    <Send size={16} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        );
      })}

      {/* Pagination */}
      {!search && (hasMore ? (
        <TouchableOpacity
          style={fd.loadMoreBtn}
          onPress={loadMore}
          disabled={loadingMore}
        >
          {loadingMore
            ? <ActivityIndicator size="small" color={colors.primary} />
            : <Text style={fd.loadMoreText}>Load more</Text>}
        </TouchableOpacity>
      ) : items.length > 0 ? (
        <Text style={fd.endText}>You're all caught up</Text>
      ) : null)}
    </ScrollView>
      )}
    </View>
  );
}

// ── Friend profile modal ───────────────────────────────────────────────────────
function FriendProfileModal({ friend, token, onClose }: { friend: FriendResponse | null; token: string; onClose: () => void }) {
  const [habits, setHabits] = useState<HabitResponse[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!friend) return;
    setLoading(true);
    api.habits.publicList(token, friend.id)
      .then(setHabits).catch(() => setHabits([]))
      .finally(() => setLoading(false));
  }, [friend?.id]);

  const name = friend?.full_name ?? friend?.email ?? "";

  return (
    <Modal visible={!!friend} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
            <UserX size={20} color={colors.mutedFg} />
          </TouchableOpacity>
          <Text style={{ color: colors.foreground, fontSize: 17, fontWeight: "600" }}>{name}</Text>
          <View style={{ width: 28 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
          <View style={{ alignItems: "center", paddingVertical: 20 }}>
            <Avatar name={name} size={60} colorIndex={(friend?.id ?? 0) % 5} />
            <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 18, marginTop: 10 }}>{friend?.full_name ?? "No name"}</Text>
            <Text style={{ color: colors.mutedFg, fontSize: 14 }}>{friend?.email}</Text>
          </View>
          <Text style={{ color: colors.mutedFg, fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 }}>Public Habits</Text>
          {loading ? <ActivityIndicator color={colors.primary} /> : habits.length === 0 ? (
            <Text style={{ color: colors.mutedFg, textAlign: "center", padding: 20 }}>No public habits</Text>
          ) : habits.map(h => (
            <View key={h.id} style={[card, { padding: 14 }]}>
              <Text style={{ color: colors.foreground, fontWeight: "600", fontSize: 15 }}>{h.name}</Text>
              {h.description && <Text style={{ color: colors.mutedFg, fontSize: 13, marginTop: 4 }}>{h.description}</Text>}
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Friends tab ───────────────────────────────────────────────────────────────
function FriendsTab({ token }: { token: string }) {
  const [friends, setFriends] = useState<FriendResponse[]>([]);
  const [requests, setRequests] = useState<FriendResponse[]>([]);
  const [searchResults, setSearchResults] = useState<FriendSearchResult[]>([]);
  const [searchQ, setSearchQ] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState<FriendResponse | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function load() {
    try {
      const [f, r] = await Promise.all([api.friends.list(token), api.friends.requests(token)]);
      setFriends(f); setRequests(r);
    } catch {} finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  function handleSearch(q: string) {
    setSearchQ(q);
    if (timer.current) clearTimeout(timer.current);
    if (!q.trim()) { setSearchResults([]); return; }
    timer.current = setTimeout(async () => {
      setSearchLoading(true);
      try { setSearchResults(await api.friends.search(token, q.trim())); }
      catch { setSearchResults([]); }
      finally { setSearchLoading(false); }
    }, 400);
  }

  async function sendRequest() {
    if (!addEmail.trim()) return;
    try { await api.friends.add(token, addEmail.trim()); setAddEmail(""); Alert.alert("Sent!", "Friend request sent."); }
    catch (e: any) { Alert.alert("Error", e?.message); }
  }

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100, gap: 10 }}>
      {/* Search */}
      <View style={[card, { padding: 14 }]}>
        <Text style={fr.sectionTitle}>Find people</Text>
        <View style={[fr.searchBox, { marginTop: 8 }]}>
          <Search size={16} color={colors.mutedFg} />
          <TextInput
            style={{ flex: 1, color: colors.foreground, fontSize: 15, marginLeft: 8 }}
            placeholder="Search by name or email..."
            placeholderTextColor={colors.mutedFg}
            value={searchQ}
            onChangeText={handleSearch}
            autoCapitalize="none"
          />
        </View>
        {searchLoading && <ActivityIndicator color={colors.primary} style={{ marginTop: 8 }} />}
        {searchResults.map((u, idx) => (
          <View key={u.id} style={[fr.personRow, { marginTop: 10 }]}>
            <Avatar name={u.full_name ?? u.email} colorIndex={idx} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={fr.personName}>{u.full_name ?? u.email}</Text>
              <Text style={fr.personSub}>{u.email}</Text>
            </View>
            {!u.friendship_status ? (
              <TouchableOpacity style={fr.actionBtn} onPress={() => { setAddEmail(u.email); setSearchQ(""); setSearchResults([]); }}>
                <UserPlus size={16} color={colors.primary} />
              </TouchableOpacity>
            ) : (
              <View style={fr.actionBtn}>
                <UserCheck size={16} color={colors.mutedFg} />
              </View>
            )}
          </View>
        ))}
      </View>

      {/* Add by email */}
      <View style={[card, { padding: 14 }]}>
        <Text style={fr.sectionTitle}>Add by email</Text>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          <TextInput
            style={[fr.emailInput, { flex: 1 }]}
            placeholder="friend@email.com"
            placeholderTextColor={colors.mutedFg}
            value={addEmail}
            onChangeText={setAddEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TouchableOpacity style={fr.sendBtn} onPress={sendRequest}>
            <UserPlus size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Pending requests */}
      {requests.length > 0 && (
        <View style={[card, { padding: 14 }]}>
          <Text style={fr.sectionTitle}>Friend requests ({requests.length})</Text>
          {requests.map((r, idx) => (
            <View key={r.id} style={[fr.personRow, { marginTop: 10 }]}>
              <Avatar name={r.full_name ?? r.email} colorIndex={idx} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={fr.personName}>{r.full_name ?? r.email}</Text>
                <Text style={fr.personSub}>{r.email}</Text>
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity style={[fr.actionBtn, { backgroundColor: colors.primary + "18" }]}
                  onPress={async () => { try { await api.friends.accept(token, r.id); load(); } catch (e: any) { Alert.alert("Error", e?.message); } }}>
                  <UserCheck size={16} color={colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity style={[fr.actionBtn, { backgroundColor: colors.destructive + "15" }]}
                  onPress={async () => { try { await api.friends.reject(token, r.id); load(); } catch (e: any) { Alert.alert("Error", e?.message); } }}>
                  <UserX size={16} color={colors.destructive} />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Friends list */}
      <View style={[card, { padding: 14 }]}>
        <Text style={fr.sectionTitle}>My friends ({friends.length})</Text>
        {friends.length === 0 ? (
          <Text style={{ color: colors.mutedFg, textAlign: "center", paddingVertical: 20, fontSize: 14 }}>No friends yet</Text>
        ) : friends.map((f, idx) => (
          <TouchableOpacity key={f.id} style={[fr.personRow, { marginTop: 10 }]} onPress={() => setSelectedFriend(f)}>
            <Avatar name={f.full_name ?? f.email} colorIndex={idx} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={fr.personName}>{f.full_name ?? f.email}</Text>
              <Text style={fr.personSub}>{f.email}</Text>
            </View>
            <ChevronDown size={16} color={colors.mutedFg} style={{ transform: [{ rotate: "-90deg" }] }} />
          </TouchableOpacity>
        ))}
      </View>

      <FriendProfileModal friend={selectedFriend} token={token} onClose={() => setSelectedFriend(null)} />
    </ScrollView>
  );
}

const fd = StyleSheet.create({
  eventText: { fontSize: 14, color: colors.foreground, lineHeight: 20 },
  time: { color: colors.mutedFg, fontSize: 12, marginTop: 3 },
  reactionRow: { flexDirection: "row", gap: 16, marginTop: 8, alignItems: "center" },
  reactionCount: { color: colors.mutedFg, fontSize: 13 },
  commentInput: { flex: 1, backgroundColor: colors.muted, borderRadius: radius.full, paddingHorizontal: 14, paddingVertical: 8, color: colors.foreground, fontSize: 14 },
  sendBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  loadMoreBtn: { alignItems: "center", paddingVertical: 14, marginTop: 4 },
  loadMoreText: { color: colors.primary, fontWeight: "600", fontSize: 14 },
  endText: { textAlign: "center", color: colors.mutedFg, fontSize: 13, paddingVertical: 14 },
});

const fr = StyleSheet.create({
  sectionTitle: { color: colors.foreground, fontWeight: "600", fontSize: 14 },
  searchBox: { flexDirection: "row", alignItems: "center", backgroundColor: colors.muted, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10 },
  emailInput: { backgroundColor: colors.muted, borderRadius: radius.md, padding: 10, color: colors.foreground, fontSize: 14 },
  sendBtn: { width: 42, height: 42, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  personRow: { flexDirection: "row", alignItems: "center" },
  personName: { color: colors.foreground, fontWeight: "600", fontSize: 14 },
  personSub: { color: colors.mutedFg, fontSize: 12, marginTop: 1 },
  actionBtn: { width: 34, height: 34, borderRadius: radius.md, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" },
});

// ── Social screen ─────────────────────────────────────────────────────────────

export default function SocialScreen() {
  const insets = useSafeAreaInsets();
  const [token, setToken] = useState<string | null>(null);
  const [tab, setTab] = useState<"feed" | "friends">("feed");

  useEffect(() => { getToken().then(setToken); }, []);

  if (!token) return null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 0 }}>
        <Text style={{ color: colors.foreground, fontSize: 24, fontWeight: "700", letterSpacing: -0.5, marginBottom: 12 }}>Friends</Text>
        <View style={ss.tabBar}>
          {(["feed", "friends"] as const).map(t => (
            <TouchableOpacity key={t} style={[ss.tabItem, tab === t && ss.tabItemActive]} onPress={() => setTab(t)}>
              <Text style={[ss.tabText, tab === t && ss.tabTextActive]}>{t === "feed" ? "Feed" : "Friends"}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      {tab === "feed" ? <FeedTab token={token} /> : <FriendsTab token={token} />}
    </View>
  );
}

const ss = StyleSheet.create({
  tabBar: { flexDirection: "row", backgroundColor: colors.muted, borderRadius: radius.lg, padding: 3, marginBottom: 8 },
  tabItem: { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: radius.md },
  tabItemActive: { backgroundColor: colors.card, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  tabText: { color: colors.mutedFg, fontWeight: "500", fontSize: 14 },
  tabTextActive: { color: colors.foreground, fontWeight: "600" },
});
