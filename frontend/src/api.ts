const BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8002/api";
export const WS_BASE: string = import.meta.env.VITE_WS_BASE ?? "ws://localhost:8001";

export interface TokenPair {
  access: string;
  refresh: string;
}

export interface ChatResponse {
  reply: string;
  session_id: string;
  collection_stage?: string | null;
  collecting_index?: number;
  leave_items?: unknown[];
  policy_violations?: unknown[];
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export async function login(email: string, password: string): Promise<TokenPair> {
  const res = await fetch(`${BASE}/auth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Login failed");
  }
  return res.json();
}

export async function refreshToken(refresh: string): Promise<string> {
  const res = await fetch(`${BASE}/auth/token/refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
  });
  if (!res.ok) throw new Error("Session expired");
  const data = await res.json();
  return data.access;
}

// ── Me ────────────────────────────────────────────────────────────────────────

export interface UserProfile {
  name: string;
  role: string;
  title: string;
  department?: { name: string };
}

export async function fetchMe(token: string): Promise<UserProfile | null> {
  const res = await fetch(`${BASE}/employees/me/`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return {
    name: data.user?.name || "",
    role: data.role || "",
    title: data.title || "",
    department: data.department,
  };
}

// ── Sessions ──────────────────────────────────────────────────────────────────

export interface SessionMeta {
  session_id: string;
  title: string;
  last_active_at: string;
  created_at: string;
}

export async function fetchSessions(token: string): Promise<SessionMeta[]> {
  const res = await fetch(`${BASE}/ai/sessions/`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new Error("401 Unauthorized");
  if (!res.ok) return [];
  const data = await res.json();
  return data.sessions as SessionMeta[];
}

export interface BackendMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export async function fetchSessionMessages(token: string, sessionId: string): Promise<BackendMessage[]> {
  const res = await fetch(`${BASE}/ai/sessions/${sessionId}/messages/`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new Error("401 Unauthorized");
  if (!res.ok) return [];
  const data = await res.json();
  return data.messages as BackendMessage[];
}

// ── Notifications ─────────────────────────────────────────────────────────────

export interface NotificationItem {
  id: number;
  subject: string;
  body: string;
  metadata: Record<string, unknown>;
  read: boolean;
  created_at: string;
}

export async function fetchUnreadNotifications(token: string): Promise<NotificationItem[]> {
  const res = await fetch(`${BASE}/notifications/?unread=true&limit=20`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export interface RenotifyResult {
  status: "re_pushed" | "new_reminder" | "limit_reached" | "cooldown" | "not_found" | "error";
  manager_read?: boolean;
  renotify_count?: number;
  reminders_left?: number;
  next_available_in_minutes?: number;
  error?: string;
}

export async function renotifyLeave(token: string, leaveId: number): Promise<RenotifyResult> {
  const res = await fetch(`${BASE}/notifications/renotify/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ leave_id: leaveId }),
  });
  if (res.status === 401) throw new Error("401 Unauthorized");
  const data = await res.json();
  if (!res.ok) {
    return { status: "error", error: data.error || `Error ${res.status}` };
  }
  return data as RenotifyResult;
}

// ── Chat ──────────────────────────────────────────────────────────────────────

export async function sendMessage(
  token: string,
  message: string,
  sessionId: string | null,
  collectionState: {
    collection_stage?: string | null;
    collecting_index?: number;
    leave_items?: unknown[];
    policy_violations?: unknown[];
  } = {}
): Promise<ChatResponse> {
  const body: Record<string, unknown> = { message, ...collectionState };
  if (sessionId) body.session_id = sessionId;

  const res = await fetch(`${BASE}/ai/chat/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    if (res.status === 401) throw new Error("401 Unauthorized");
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.detail || `Error ${res.status}`);
  }
  return res.json();
}
