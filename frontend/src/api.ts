const BASE = "http://localhost:8002/api";

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
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.detail || `Error ${res.status}`);
  }
  return res.json();
}
