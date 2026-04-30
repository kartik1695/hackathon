import React, { useCallback, useEffect, useMemo, useState } from "react";
import { NavPage } from "../layout/Sidebar";

const BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8002/api";

async function safeJson(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function apiGet(token: string, path: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return safeJson(res);
}

async function apiPostJson(token: string, path: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return safeJson(res);
}

async function apiPostForm(token: string, path: string, body: FormData) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body,
  });
  return safeJson(res);
}

type PostImage = { id: number; url: string };

type FeedPost = {
  id: number;
  author_id: number;
  author_name: string;
  text: string;
  kudos_to: number | null;
  kudos_to_name: string;
  created_at: string;
  images: PostImage[];
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
};

type FeedComment = {
  id: number;
  author_id: number;
  author_name: string;
  text: string;
  created_at: string;
};

type TeamMember = {
  id: number;
  name: string;
  title: string;
  department: string;
  status: string;
};

function initials(name: string) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function timeAgo(iso: string) {
  try {
    const d = new Date(iso);
    const s = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const days = Math.floor(h / 24);
    return `${days}d ago`;
  } catch {
    return "";
  }
}

export default function FeedPage({
  token,
  role,
  onNav,
}: {
  token: string;
  role: string;
  onNav: (p: NavPage) => void;
}) {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [composerText, setComposerText] = useState("");
  const [composerImage, setComposerImage] = useState<File | null>(null);
  const [composerImageUrl, setComposerImageUrl] = useState("");
  const [kudosTo, setKudosTo] = useState<string>("");
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [openComments, setOpenComments] = useState<Record<number, boolean>>({});
  const [commentsByPost, setCommentsByPost] = useState<Record<number, FeedComment[]>>(
    {},
  );
  const [commentDraft, setCommentDraft] = useState<Record<number, string>>({});

  const kudosOptions = useMemo(() => {
    const uniq = new Map<number, TeamMember>();
    team.forEach((t) => uniq.set(t.id, t));
    return Array.from(uniq.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [team]);

  const load = useCallback(async () => {
    setLoading(true);
    const [feed, teamStatus] = await Promise.all([
      apiGet(token, "/feed/posts/?page=1&page_size=50"),
      apiGet(token, "/employees/team-status/"),
    ]);
    setPosts((feed?.results ?? []) as FeedPost[]);
    const dr = (teamStatus?.direct_reports ?? []) as TeamMember[];
    const peers = (teamStatus?.peers ?? []) as TeamMember[];
    setTeam([...dr, ...peers]);
    setLoading(false);
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function submitPost() {
    if (submitting) return;
    setSubmitting(true);
    try {
      if (!composerText.trim() && !composerImage && !composerImageUrl.trim() && !kudosTo) {
        setSubmitting(false);
        return;
      }
      const body = new FormData();
      if (composerText.trim()) body.append("text", composerText.trim());
      if (kudosTo) body.append("kudos_to", kudosTo);
      if (composerImage) body.append("image", composerImage);
      if (composerImageUrl.trim()) body.append("image_url", composerImageUrl.trim());
      const created = (await apiPostForm(token, "/feed/posts/", body)) as FeedPost | null;
      if (created && created.id) {
        setPosts((prev) => [created, ...prev]);
        setComposerText("");
        setComposerImage(null);
        setComposerImageUrl("");
        setKudosTo("");
      } else {
        await load();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleLike(post: FeedPost) {
    const prev = posts;
    setPosts((cur) =>
      cur.map((p) =>
        p.id === post.id
          ? {
              ...p,
              liked_by_me: !p.liked_by_me,
              like_count: p.like_count + (p.liked_by_me ? -1 : 1),
            }
          : p,
      ),
    );
    try {
      const res = await apiPostJson(token, `/feed/posts/${post.id}/like/`, {});
      if (res && typeof res.liked === "boolean") {
        setPosts((cur) =>
          cur.map((p) =>
            p.id === post.id
              ? { ...p, liked_by_me: res.liked, like_count: res.like_count ?? p.like_count }
              : p,
          ),
        );
      }
    } catch {
      setPosts(prev);
    }
  }

  async function ensureComments(postId: number) {
    if (commentsByPost[postId]) return;
    const res = await apiGet(token, `/feed/posts/${postId}/comments/`);
    setCommentsByPost((prev) => ({
      ...prev,
      [postId]: (res?.results ?? []) as FeedComment[],
    }));
  }

  async function submitComment(post: FeedPost) {
    const text = (commentDraft[post.id] ?? "").trim();
    if (!text) return;
    setCommentDraft((prev) => ({ ...prev, [post.id]: "" }));
    const created = (await apiPostJson(token, `/feed/posts/${post.id}/comments/`, {
      text,
    })) as FeedComment | null;
    if (created && created.id) {
      setCommentsByPost((prev) => ({
        ...prev,
        [post.id]: [...(prev[post.id] ?? []), created],
      }));
      setPosts((cur) =>
        cur.map((p) =>
          p.id === post.id ? { ...p, comment_count: p.comment_count + 1 } : p,
        ),
      );
    }
  }

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "12px 0 60px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "var(--ink)" }}>Feed</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            Share updates, celebrate wins, and keep engagement high.
          </div>
        </div>
        <button
          onClick={() => onNav("chat")}
          style={{
            background: "var(--primary)",
            color: "white",
            border: "none",
            padding: "10px 14px",
            borderRadius: 12,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Ask AI
        </button>
      </div>

      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--cardBorder)",
          boxShadow: "var(--cardShadow)",
          borderRadius: 18,
          padding: 14,
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 14,
              background: "var(--primary)",
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              flexShrink: 0,
            }}
          >
            ✦
          </div>
          <div style={{ flex: 1 }}>
            <textarea
              value={composerText}
              onChange={(e) => setComposerText(e.target.value)}
              placeholder="Share an update, a win, or give kudos to someone…"
              style={{
                width: "100%",
                minHeight: 70,
                borderRadius: 14,
                border: "1px solid var(--cardBorder)",
                background: "var(--surface2)",
                padding: 12,
                outline: "none",
                color: "var(--ink)",
                resize: "vertical",
                fontSize: 13,
              }}
            />
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10, alignItems: "center" }}>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setComposerImage(e.target.files?.[0] ?? null)}
              />
              <input
                value={composerImageUrl}
                onChange={(e) => setComposerImageUrl(e.target.value)}
                placeholder="…or paste an image URL"
                style={{
                  flex: 1,
                  minWidth: 220,
                  borderRadius: 12,
                  border: "1px solid var(--cardBorder)",
                  background: "var(--surface2)",
                  padding: "9px 10px",
                  outline: "none",
                  color: "var(--ink)",
                  fontSize: 12.5,
                }}
              />
              <select
                value={kudosTo}
                onChange={(e) => setKudosTo(e.target.value)}
                style={{
                  borderRadius: 12,
                  border: "1px solid var(--cardBorder)",
                  background: "var(--surface2)",
                  padding: "9px 10px",
                  color: "var(--ink)",
                  fontSize: 12.5,
                }}
              >
                <option value="">Kudos (optional)</option>
                {kudosOptions.map((o) => (
                  <option key={o.id} value={String(o.id)}>
                    {o.name} • {o.department}
                  </option>
                ))}
              </select>
              <button
                onClick={submitPost}
                disabled={submitting}
                style={{
                  background: submitting ? "rgba(0,0,0,0.15)" : "var(--primary)",
                  color: "white",
                  border: "none",
                  padding: "10px 14px",
                  borderRadius: 12,
                  fontWeight: 800,
                  cursor: submitting ? "not-allowed" : "pointer",
                }}
              >
                {submitting ? "Posting…" : "Post"}
              </button>
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: "var(--muted)" }}>
              Tip: Use the kudos dropdown to celebrate someone. This boosts engagement signals.
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ color: "var(--muted)", fontSize: 13 }}>Loading feed…</div>
      ) : posts.length === 0 ? (
        <div style={{ color: "var(--muted)", fontSize: 13 }}>No posts yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {posts.map((p) => (
            <div
              key={p.id}
              style={{
                background: "var(--card)",
                border: "1px solid var(--cardBorder)",
                boxShadow: "var(--cardShadow)",
                borderRadius: 18,
                padding: 14,
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 16,
                    background: "var(--accent)",
                    color: "white",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 900,
                    flexShrink: 0,
                  }}
                >
                  {initials(p.author_name || "U")}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 800, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.author_name || "Employee"}
                        {p.kudos_to_name ? (
                          <span style={{ fontWeight: 700, color: "var(--muted)" }}>
                            {" "}
                            • kudos to{" "}
                            <span style={{ color: "var(--primary)" }}>{p.kudos_to_name}</span>
                          </span>
                        ) : null}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>{timeAgo(p.created_at)}</div>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>
                      {role ? role.toUpperCase() : ""}
                    </div>
                  </div>

                  {p.text ? (
                    <div style={{ marginTop: 10, fontSize: 13, color: "var(--ink)", lineHeight: 1.4, whiteSpace: "pre-wrap" }}>
                      {p.text}
                    </div>
                  ) : null}

                  {p.images?.length ? (
                    <div style={{ marginTop: 10 }}>
                      <img
                        src={p.images[0].url}
                        style={{
                          width: "100%",
                          maxHeight: 360,
                          objectFit: "cover",
                          borderRadius: 14,
                          border: "1px solid var(--cardBorder)",
                        }}
                      />
                    </div>
                  ) : null}

                  <div style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "center" }}>
                    <button
                      onClick={() => toggleLike(p)}
                      style={{
                        borderRadius: 12,
                        border: "1px solid var(--cardBorder)",
                        background: p.liked_by_me ? "var(--accentLight)" : "transparent",
                        padding: "8px 10px",
                        cursor: "pointer",
                        fontWeight: 800,
                        color: "var(--ink)",
                      }}
                    >
                      {p.liked_by_me ? "♥ Liked" : "♡ Like"} • {p.like_count}
                    </button>
                    <button
                      onClick={async () => {
                        const next = !openComments[p.id];
                        setOpenComments((prev) => ({ ...prev, [p.id]: next }));
                        if (next) await ensureComments(p.id);
                      }}
                      style={{
                        borderRadius: 12,
                        border: "1px solid var(--cardBorder)",
                        background: "transparent",
                        padding: "8px 10px",
                        cursor: "pointer",
                        fontWeight: 800,
                        color: "var(--ink)",
                      }}
                    >
                      💬 Comments • {p.comment_count}
                    </button>
                  </div>

                  {openComments[p.id] ? (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ display: "flex", gap: 8 }}>
                        <input
                          value={commentDraft[p.id] ?? ""}
                          onChange={(e) =>
                            setCommentDraft((prev) => ({ ...prev, [p.id]: e.target.value }))
                          }
                          placeholder="Write a comment…"
                          style={{
                            flex: 1,
                            borderRadius: 12,
                            border: "1px solid var(--cardBorder)",
                            background: "var(--surface2)",
                            padding: "10px 12px",
                            outline: "none",
                            color: "var(--ink)",
                            fontSize: 12.5,
                          }}
                        />
                        <button
                          onClick={() => submitComment(p)}
                          style={{
                            background: "var(--primary)",
                            color: "white",
                            border: "none",
                            padding: "10px 12px",
                            borderRadius: 12,
                            fontWeight: 900,
                            cursor: "pointer",
                          }}
                        >
                          Send
                        </button>
                      </div>
                      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                        {(commentsByPost[p.id] ?? []).map((c) => (
                          <div
                            key={c.id}
                            style={{
                              padding: "10px 12px",
                              borderRadius: 14,
                              border: "1px solid var(--cardBorder)",
                              background: "var(--surface2)",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                              <div style={{ fontSize: 12.5, fontWeight: 800, color: "var(--ink)" }}>
                                {c.author_name || "Employee"}
                              </div>
                              <div style={{ fontSize: 11, color: "var(--muted)" }}>{timeAgo(c.created_at)}</div>
                            </div>
                            <div style={{ marginTop: 4, fontSize: 12.5, color: "var(--ink)", lineHeight: 1.35 }}>
                              {c.text}
                            </div>
                          </div>
                        ))}
                        {(commentsByPost[p.id] ?? []).length === 0 ? (
                          <div style={{ fontSize: 12, color: "var(--muted)" }}>
                            Be the first to comment.
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
