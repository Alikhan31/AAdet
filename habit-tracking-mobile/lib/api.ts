// API base – point to your backend
export const API_BASE = "http://192.168.0.30:8001";

export type ApiError = { status: number; message: string; details?: unknown };

async function apiFetch<T>(
  path: string,
  opts?: { method?: string; token?: string | null; body?: unknown; form?: Record<string, string> }
): Promise<T> {
  const method = opts?.method ?? (opts?.body || opts?.form ? "POST" : "GET");
  const headers: Record<string, string> = {};
  if (opts?.token) headers.Authorization = `Bearer ${opts.token}`;

  let body: string | undefined;
  if (opts?.form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(opts.form).toString();
  } else if (opts?.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }

  const url = `${API_BASE}${path}`;
  const res = await fetch(url, { method, headers, body });

  if (!res.ok) {
    let details: unknown;
    try { details = await res.json(); } catch { details = await res.text().catch(() => undefined); }
    const message =
      (typeof details === "object" && details !== null && "detail" in details &&
        typeof (details as any).detail === "string" && (details as any).detail) ||
      `${res.status} ${res.statusText}`;
    throw { status: res.status, message, details } as ApiError;
  }
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json() as Promise<T>;
  return res.text() as Promise<T>;
}

// ---- Types ----
export type UserResponse = { id: number; email: string; full_name: string | null; is_active: boolean };
export type TokenResponse = { access_token: string; token_type: string };
export type HabitResponse = {
  id: number; user_id: number; name: string; description: string | null;
  frequency: string; target_count: number; days_of_week: number[];
  visibility: "friends" | "selected" | "private";
  category: string | null; icon: string | null;
  created_at: string; updated_at: string;
};
export type HabitCompletionResponse = {
  id: number; habit_id: number; completed_date: string; count: number;
  note: string | null; created_at: string;
};
export type AnalyticsSummaryResponse = {
  stats: { total_xp: number; level: number; current_streak_days: number; longest_streak_days: number; updated_at: string };
  completions_today: number;
  completions_this_week: number;
  possible_this_week: number;
  total_completions: number;
  habits_count: number;
  last_7_days: { date: string; count: number }[];
  best_weekday: string | null;
};
export type FriendResponse = { id: number; email: string; full_name: string | null; status: string; created_at: string };
export type FriendSearchResult = { id: number; email: string; full_name: string | null; friendship_status: string | null };
export type FeedCommentResponse = {
  id: number; event_id: number; user_id: number;
  user_email: string | null; user_full_name: string | null; text: string; created_at: string;
};
export type ActivityFeedItemResponse = {
  id: number; user_id: number; user_email: string | null; user_full_name: string | null;
  event_type: string; payload: Record<string, unknown> | null; created_at: string;
  reactions: { id: number; event_id: number; user_id: number; type: string; created_at: string }[];
  comments: FeedCommentResponse[]; comments_count: number;
};
export type HeatmapDay = { date: string; count: number };
export type HeatmapResponse = { days: HeatmapDay[] };

// ---- API ----
export const api = {
  auth: {
    login: (email: string, password: string) =>
      apiFetch<TokenResponse>("/api/auth/login", { form: { username: email, password } }),
    register: (email: string, password: string, full_name?: string) =>
      apiFetch<UserResponse>("/api/auth/register", { body: { email, password, full_name } }),
    me: (token: string) => apiFetch<UserResponse>("/api/auth/me", { token }),
  },
  habits: {
    list: (token: string) => apiFetch<HabitResponse[]>("/api/habits", { token }),
    create: (token: string, payload: { name: string; description?: string | null; days_of_week?: number[]; visibility?: string; category?: string | null; icon?: string | null }) =>
      apiFetch<HabitResponse>("/api/habits", { token, body: payload }),
    update: (token: string, id: number, payload: Partial<{ name: string; description: string | null; days_of_week: number[]; visibility: string; category: string | null; icon: string | null }>) =>
      apiFetch<HabitResponse>(`/api/habits/${id}`, { method: "PATCH", token, body: payload }),
    delete: (token: string, id: number) =>
      apiFetch<void>(`/api/habits/${id}`, { method: "DELETE", token }),
    listCompletions: (token: string, id: number, params?: { from_date?: string; to_date?: string }) => {
      const qs = new URLSearchParams();
      if (params?.from_date) qs.set("from_date", params.from_date);
      if (params?.to_date) qs.set("to_date", params.to_date);
      const s = qs.toString() ? `?${qs}` : "";
      return apiFetch<HabitCompletionResponse[]>(`/api/habits/${id}/completions${s}`, { token });
    },
    complete: (token: string, id: number, date: string) =>
      apiFetch<HabitCompletionResponse>(`/api/habits/${id}/completions`, { token, body: { completed_date: date, count: 1 } }),
    removeCompletion: (token: string, id: number, date: string) =>
      apiFetch<void>(`/api/habits/${id}/completions/${date}`, { method: "DELETE", token }),
    updateNote: (token: string, id: number, date: string, note: string | null) =>
      apiFetch<HabitCompletionResponse>(`/api/habits/${id}/completions/${date}`, { method: "PATCH", token, body: { note } }),
    publicList: (token: string, userId: number) =>
      apiFetch<HabitResponse[]>(`/api/habits/public/${userId}`, { token }),
    getVisibleTo: (token: string, id: number) =>
      apiFetch<number[]>(`/api/habits/${id}/visible-to`, { token }),
    setVisibleTo: (token: string, id: number, userIds: number[]) =>
      apiFetch<void>(`/api/habits/${id}/visible-to`, { method: "PUT", token, body: userIds }),
  },
  analytics: {
    summary: (token: string) => apiFetch<AnalyticsSummaryResponse>("/api/analytics/summary", { token }),
    heatmap: (token: string) => apiFetch<HeatmapResponse>("/api/analytics/heatmap", { token }),
  },
  friends: {
    list: (token: string) => apiFetch<FriendResponse[]>("/api/friends", { token }),
    requests: (token: string) => apiFetch<FriendResponse[]>("/api/friends/requests", { token }),
    search: (token: string, q: string) =>
      apiFetch<FriendSearchResult[]>(`/api/friends/search?q=${encodeURIComponent(q)}`, { token }),
    add: (token: string, email: string) =>
      apiFetch<FriendResponse>("/api/friends", { token, body: { email } }),
    accept: (token: string, id: number) =>
      apiFetch<FriendResponse>(`/api/friends/${id}/accept`, { method: "PATCH", token }),
    reject: (token: string, id: number) =>
      apiFetch<void>(`/api/friends/${id}/reject`, { method: "PATCH", token }),
    remove: (token: string, id: number) =>
      apiFetch<void>(`/api/friends/${id}`, { method: "DELETE", token }),
  },
  feed: {
    list: (token: string, friendsOnly = false, skip = 0, limit = 10) =>
      apiFetch<ActivityFeedItemResponse[]>(
        `/api/feed?friends_only=${friendsOnly}&skip=${skip}&limit=${limit}`,
        { token },
      ),
    addComment: (token: string, eventId: number, text: string) =>
      apiFetch<FeedCommentResponse>(`/api/feed/${eventId}/comments`, { token, body: { text } }),
    deleteComment: (token: string, eventId: number, commentId: number) =>
      apiFetch<void>(`/api/feed/${eventId}/comments/${commentId}`, { method: "DELETE", token }),
  },
};
