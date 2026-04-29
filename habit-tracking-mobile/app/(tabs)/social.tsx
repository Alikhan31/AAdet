import { useEffect, useState, useRef } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, ActivityIndicator, Alert, RefreshControl, Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Heart, MessageCircle, Search, UserPlus, UserCheck, UserX, Send, ChevronDown, ChevronUp, Users, Zap, Trophy, Check, X,
} from "lucide-react-native";
import { getToken } from "../../lib/auth";
import { api, FriendResponse, FriendSearchResult, ActivityFeedItemResponse, HabitResponse, HeatmapDay, SharedHabitInvitation } from "../../lib/api";
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

function FeedTab({ token, userId }: { token: string; userId: number }) {
  const [items, setItems] = useState<ActivityFeedItemResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState("");
  const [commentText, setCommentText] = useState<Record<number, string>>({});
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [likedIds, setLikedIds] = useState<Set<number>>(new Set());

  async function load() {
    try {
      const page = await api.feed.list(token, false, 0, PAGE_SIZE);
      setItems(page);
      setHasMore(page.length === PAGE_SIZE);
      const liked = new Set<number>();
      for (const item of page) {
        if (item.reactions.some(r => r.user_id === userId && r.type === "like")) liked.add(item.id);
      }
      setLikedIds(liked);
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
      setLikedIds(prev => {
        const n = new Set(prev);
        for (const item of page) {
          if (item.reactions.some(r => r.user_id === userId && r.type === "like")) n.add(item.id);
        }
        return n;
      });
    } catch {}
    finally { setLoadingMore(false); }
  }

  async function toggleLike(item: ActivityFeedItemResponse) {
    const liked = likedIds.has(item.id);
    setLikedIds(prev => { const n = new Set(prev); liked ? n.delete(item.id) : n.add(item.id); return n; });
    setItems(prev => prev.map(i => {
      if (i.id !== item.id) return i;
      const reactions = liked
        ? i.reactions.filter(r => !(r.user_id === userId && r.type === "like"))
        : [...i.reactions, { id: -Date.now(), event_id: i.id, user_id: userId, type: "like", created_at: new Date().toISOString() }];
      return { ...i, reactions };
    }));
    try {
      if (liked) {
        await fetch(`http://192.168.0.30:8001/api/feed/${item.id}/react?reaction_type=like`, {
          method: "DELETE", headers: { Authorization: `Bearer ${token}` },
        });
      } else {
        await fetch(`http://192.168.0.30:8001/api/feed/${item.id}/react`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ type: "like" }),
        });
      }
    } catch {
      setLikedIds(prev => { const n = new Set(prev); liked ? n.add(item.id) : n.delete(item.id); return n; });
      setItems(prev => prev.map(i => {
        if (i.id !== item.id) return i;
        const reactions = liked
          ? [...i.reactions, { id: -Date.now(), event_id: i.id, user_id: userId, type: "like", created_at: new Date().toISOString() }]
          : i.reactions.filter(r => !(r.user_id === userId && r.type === "like"));
        return { ...i, reactions };
      }));
    }
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
                  <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 4 }} onPress={() => toggleLike(item)}>
                    <Heart
                      size={14}
                      color={likedIds.has(item.id) ? "#ef4444" : colors.mutedFg}
                      fill={likedIds.has(item.id) ? "#ef4444" : "transparent"}
                    />
                    <Text style={[fd.reactionCount, likedIds.has(item.id) && { color: "#ef4444" }]}>
                      {item.reactions.filter(r => r.type === "like").length}
                    </Text>
                  </TouchableOpacity>
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

// ── Friend heatmap ────────────────────────────────────────────────────────────
function FriendHeatmap({ days }: { days: HeatmapDay[] }) {
  const today = new Date();
  const grid: { date: string; count: number }[] = [];
  for (let i = 89; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().split("T")[0];
    const found = days.find(x => x.date === iso);
    grid.push({ date: iso, count: found?.count ?? 0 });
  }
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 3 }}>
      {grid.map((d, i) => (
        <View
          key={i}
          style={{
            width: 9, height: 9, borderRadius: 2,
            backgroundColor: d.count > 0 ? colors.primary : colors.muted,
            opacity: d.count > 0 ? Math.min(0.4 + d.count * 0.2, 1) : 1,
          }}
        />
      ))}
    </View>
  );
}

// ── Friend profile modal ───────────────────────────────────────────────────────
function FriendProfileModal({ friend, token, xp, onClose }: { friend: FriendResponse | null; token: string; xp?: number; onClose: () => void }) {
  const [habits, setHabits] = useState<HabitResponse[]>([]);
  const [heatmap, setHeatmap] = useState<HeatmapDay[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!friend) return;
    setLoading(true);
    Promise.all([
      api.habits.publicList(token, friend.id),
      api.analytics.heatmap(token, 90, friend.id).catch(() => ({ days: [] })),
    ]).then(([h, hm]) => { setHabits(h); setHeatmap(hm.days); })
      .catch(() => { setHabits([]); setHeatmap([]); })
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
          {xp !== undefined ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.primary + "18", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
              <Zap size={12} color={colors.primary} />
              <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700" }}>{xp} XP</Text>
            </View>
          ) : <View style={{ width: 28 }} />}
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          <View style={{ alignItems: "center", paddingVertical: 16 }}>
            <Avatar name={name} size={60} colorIndex={(friend?.id ?? 0) % 5} />
            <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 18, marginTop: 10 }}>{friend?.full_name ?? "No name"}</Text>
            <Text style={{ color: colors.mutedFg, fontSize: 14 }}>{friend?.email}</Text>
          </View>

          {/* Heatmap */}
          {heatmap.length > 0 && (
            <View style={[card, { padding: 14 }]}>
              <Text style={{ color: colors.mutedFg, fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Last 90 days</Text>
              <FriendHeatmap days={heatmap} />
            </View>
          )}

          <Text style={{ color: colors.mutedFg, fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 }}>Public Habits</Text>
          {loading ? <ActivityIndicator color={colors.primary} /> : habits.length === 0 ? (
            <Text style={{ color: colors.mutedFg, textAlign: "center", padding: 20 }}>No public habits</Text>
          ) : habits.map(h => (
            <View key={h.id} style={[card, { padding: 14 }]}>
              <Text style={{ color: colors.foreground, fontWeight: "600", fontSize: 15 }}>{h.name}</Text>
              {h.description && <Text style={{ color: colors.mutedFg, fontSize: 13, marginTop: 4 }}>{h.description}</Text>}
              {h.category && <Text style={{ color: colors.primary, fontSize: 11, marginTop: 4, fontWeight: "500" }}>{h.category}</Text>}
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
  const [friendXpMap, setFriendXpMap] = useState<Map<number, number>>(new Map());
  const [searchResults, setSearchResults] = useState<FriendSearchResult[]>([]);
  const [searchQ, setSearchQ] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState<FriendResponse | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function load() {
    try {
      const [f, r, lb] = await Promise.all([
        api.friends.list(token),
        api.friends.requests(token),
        api.analytics.leaderboard(token, { friends_only: true }).catch(() => null),
      ]);
      setFriends(f); setRequests(r);
      if (lb) {
        const map = new Map<number, number>();
        for (const e of lb.entries) map.set(e.user_id, e.total_xp);
        setFriendXpMap(map);
      }
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
        ) : friends.map((f, idx) => {
          const xp = friendXpMap.get(f.id);
          return (
            <TouchableOpacity key={f.id} style={[fr.personRow, { marginTop: 10 }]} onPress={() => setSelectedFriend(f)}>
              <Avatar name={f.full_name ?? f.email} colorIndex={idx} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={fr.personName}>{f.full_name ?? f.email}</Text>
                <Text style={fr.personSub}>{f.email}</Text>
              </View>
              {xp !== undefined && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: colors.primary + "18", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, marginRight: 6 }}>
                  <Zap size={11} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "700" }}>{xp}</Text>
                </View>
              )}
              <ChevronDown size={16} color={colors.mutedFg} style={{ transform: [{ rotate: "-90deg" }] }} />
            </TouchableOpacity>
          );
        })}
      </View>

      <FriendProfileModal
        friend={selectedFriend}
        token={token}
        xp={selectedFriend ? friendXpMap.get(selectedFriend.id) : undefined}
        onClose={() => setSelectedFriend(null)}
      />
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

// ── Leaderboard tab ───────────────────────────────────────────────────────────
function LeaderboardTab({ token }: { token: string }) {
  const [entries, setEntries] = useState<{ user_id: number; total_xp: number; name: string; rank: number; is_me: boolean }[]>([]);
  const [friendsOnly, setFriendsOnly] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load(fo: boolean) {
    setLoading(true);
    try {
      const lb = await api.analytics.leaderboard(token, { friends_only: fo });
      setEntries(lb.entries);
    } catch {} finally { setLoading(false); }
  }

  useEffect(() => { load(friendsOnly); }, [friendsOnly]);

  const rankColors: Record<number, string> = { 1: "#f59e0b", 2: "#94a3b8", 3: "#b45309" };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100, gap: 10 }}>
      <View style={[card, { padding: 4, flexDirection: "row" }]}>
        {(["global", "friends"] as const).map(opt => {
          const active = (opt === "friends") === friendsOnly;
          return (
            <TouchableOpacity key={opt} style={[lb.toggle, active && lb.toggleActive]} onPress={() => setFriendsOnly(opt === "friends")}>
              <Text style={[lb.toggleTxt, active && lb.toggleTxtActive]}>{opt === "friends" ? "Friends" : "Global"}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : entries.length === 0 ? (
        <View style={[card, { padding: 32, alignItems: "center" }]}>
          <Trophy size={32} color={colors.mutedFg} style={{ marginBottom: 12 }} />
          <Text style={{ color: colors.mutedFg, fontSize: 14 }}>No data yet</Text>
        </View>
      ) : entries.map((e, idx) => {
        const medalColor = rankColors[e.rank];
        return (
          <View key={e.user_id} style={[card, { padding: 14, flexDirection: "row", alignItems: "center", gap: 12, borderWidth: e.is_me ? 1.5 : 0, borderColor: e.is_me ? colors.primary : "transparent" }]}>
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: medalColor ? medalColor + "25" : colors.muted, alignItems: "center", justifyContent: "center" }}>
              {medalColor
                ? <Trophy size={16} color={medalColor} />
                : <Text style={{ color: colors.mutedFg, fontSize: 13, fontWeight: "700" }}>#{e.rank}</Text>
              }
            </View>
            <Avatar name={e.name} colorIndex={idx} size={36} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.foreground, fontWeight: e.is_me ? "700" : "500", fontSize: 14 }}>
                {e.name}{e.is_me ? " (you)" : ""}
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.primary + "18", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 }}>
              <Zap size={13} color={colors.primary} />
              <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 13 }}>{e.total_xp}</Text>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const lb = StyleSheet.create({
  toggle: { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: radius.md },
  toggleActive: { backgroundColor: colors.primary },
  toggleTxt: { color: colors.mutedFg, fontWeight: "500", fontSize: 14 },
  toggleTxtActive: { color: "#fff", fontWeight: "600" },
});

// ── Shared habit invitations tab ──────────────────────────────────────────────
function SharedInvitationsTab({ token }: { token: string }) {
  const [invitations, setInvitations] = useState<SharedHabitInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    try { setInvitations(await api.sharedHabits.invitations(token)); }
    catch {} finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function respond(groupId: number, accept: boolean) {
    setBusy(groupId);
    try {
      if (accept) await api.sharedHabits.accept(token, groupId);
      else await api.sharedHabits.decline(token, groupId);
      setInvitations(prev => prev.filter(i => i.group_id !== groupId));
    } catch (e: any) { Alert.alert("Error", e?.message); }
    finally { setBusy(null); }
  }

  if (loading) return <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100, gap: 10 }} refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.primary} />}>
      {invitations.length === 0 ? (
        <View style={[card, { padding: 32, alignItems: "center" }]}>
          <Users size={32} color={colors.mutedFg} style={{ marginBottom: 12 }} />
          <Text style={{ color: colors.mutedFg, fontSize: 14 }}>No pending invitations</Text>
        </View>
      ) : invitations.map((inv, idx) => (
        <View key={inv.group_id} style={[card, { padding: 14 }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <Avatar name={inv.owner_name ?? inv.owner_email} colorIndex={idx} size={40} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 15 }}>{inv.habit_name}</Text>
              <Text style={{ color: colors.mutedFg, fontSize: 12, marginTop: 2 }}>from {inv.owner_name ?? inv.owner_email}</Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TouchableOpacity
              onPress={() => respond(inv.group_id, true)}
              disabled={busy === inv.group_id}
              style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.primary }}
            >
              {busy === inv.group_id ? <ActivityIndicator size="small" color="#fff" /> : <><Check size={16} color="#fff" /><Text style={{ color: "#fff", fontWeight: "600" }}>Accept</Text></>}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => respond(inv.group_id, false)}
              disabled={busy === inv.group_id}
              style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.muted }}
            >
              <X size={16} color={colors.mutedFg} /><Text style={{ color: colors.mutedFg, fontWeight: "600" }}>Decline</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

// ── Social screen ─────────────────────────────────────────────────────────────

export default function SocialScreen() {
  const insets = useSafeAreaInsets();
  const [token, setToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<number>(0);
  const [tab, setTab] = useState<"feed" | "friends" | "leaderboard" | "shared">("feed");

  useEffect(() => {
    getToken().then(async t => {
      if (!t) return;
      setToken(t);
      try { const me = await api.auth.me(t); setUserId(me.id); } catch {}
    });
  }, []);

  if (!token) return null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 0 }}>
        <Text style={{ color: colors.foreground, fontSize: 24, fontWeight: "700", letterSpacing: -0.5, marginBottom: 12 }}>Social</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(["feed", "friends", "leaderboard", "shared"] as const).map(t => (
              <TouchableOpacity key={t} style={[ss.pill, tab === t && ss.pillActive]} onPress={() => setTab(t)}>
                <Text style={[ss.pillTxt, tab === t && ss.pillTxtActive]}>
                  {t === "feed" ? "Feed" : t === "friends" ? "Friends" : t === "leaderboard" ? "Leaderboard" : "Shared"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>
      {tab === "feed" && <FeedTab token={token} userId={userId} />}
      {tab === "friends" && <FriendsTab token={token} />}
      {tab === "leaderboard" && <LeaderboardTab token={token} />}
      {tab === "shared" && <SharedInvitationsTab token={token} />}
    </View>
  );
}

const ss = StyleSheet.create({
  pill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillTxt: { color: colors.mutedFg, fontWeight: "500", fontSize: 14 },
  pillTxtActive: { color: "#fff", fontWeight: "600" },
});
