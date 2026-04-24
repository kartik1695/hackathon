import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  RadialBarChart,
  RadialBar,
} from "recharts";

const API = import.meta.env.VITE_API_BASE ?? "http://localhost:8000/api";

function apiGet(token: string, path: string) {
  return fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());
}
function apiPost(token: string, path: string, body?: object) {
  return fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  }).then((r) => r.json());
}

interface Step {
  id: number;
  title: string;
  description: string;
  order: number;
  status: string;
  is_completed: boolean;
  phase: string;
  difficulty: string;
  duration: number;
  resource_url: string;
  resource_type: string;
  submission_notes: string;
  submission_url: string;
  feedback: string;
}

interface Roadmap {
  id: number;
  skill_name: string;
  description: string;
  status: string;
  created_at: string;
  updated_at: string;
  steps: Step[];
  employee_name: string;
  employee_id: number;
  step_count?: number;
  completed_steps?: number;
}

const STATUS_COLOR: Record<string, string> = {
  PENDING_APPROVAL: "#F59E0B",
  IN_PROGRESS: "#3B82F6",
  PENDING_REVIEW: "#8B5CF6",
  COMPLETED: "#10B981",
  ABANDONED: "#6B7280",
  REJECTED: "#EF4444",
};

const STEP_STATUS_COLOR: Record<string, string> = {
  PENDING: "#D1D5DB",
  IN_PROGRESS: "#3B82F6",
  SUBMITTED: "#8B5CF6",
  APPROVED: "#10B981",
  REJECTED: "#EF4444",
};

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLOR[status] ?? "#6B7280";
  return (
    <span
      className="text-[10px] font-bold px-2 py-0.5 rounded-full"
      style={{ background: color + "20", color }}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

function StepStatusDot({ status }: { status: string }) {
  const color = STEP_STATUS_COLOR[status] ?? "#D1D5DB";
  return (
    <span
      className="w-2 h-2 rounded-full inline-block flex-shrink-0 mt-1.5"
      style={{ background: color }}
    />
  );
}

function ProgressBar({ total, done }: { total: number; done: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="w-full h-1.5 rounded-full bg-gray-100 overflow-hidden">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${pct}%`, background: "var(--accent)" }}
      />
    </div>
  );
}

// ── Employee: single roadmap detail ─────────────────────────────────────────

function RoadmapDetail({
  roadmap,
  token,
  onBack,
  onRefresh,
}: {
  roadmap: Roadmap;
  token: string;
  onBack: () => void;
  onRefresh: () => void;
}) {
  const [submitting, setSubmitting] = useState<number | null>(null);
  const [submitData, setSubmitData] = useState<
    Record<number, { notes: string; url: string }>
  >({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const completedSteps = roadmap.steps.filter((s) => s.is_completed).length;

  async function handleSubmit(stepId: number) {
    const d = submitData[stepId] ?? { notes: "", url: "" };
    setSubmitting(stepId);
    setError("");
    try {
      const res = await apiPost(
        token,
        `/upskilling/steps/${stepId}/submit/`,
        d,
      );
      if (res.error) {
        setError(res.error);
      } else {
        setSuccess("Step submitted for review!");
        onRefresh();
      }
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div>
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm mb-5"
        style={{ color: "var(--accent)" }}
      >
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24">
          <path
            d="M19 12H5M12 19l-7-7 7-7"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Back to roadmaps
      </button>

      <div
        className="rounded-2xl p-5 mb-5"
        style={{
          background: "var(--card)",
          border: "1px solid var(--cardBorder)",
        }}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h2 className="text-lg font-bold" style={{ color: "var(--ink)" }}>
              {roadmap.skill_name}
            </h2>
            <p
              className="text-xs mt-1 leading-relaxed"
              style={{ color: "var(--muted)" }}
            >
              {roadmap.description}
            </p>
          </div>
          <StatusBadge status={roadmap.status} />
        </div>
        <div className="flex items-center gap-3">
          <ProgressBar total={roadmap.steps.length} done={completedSteps} />
          <span
            className="text-xs font-semibold whitespace-nowrap"
            style={{ color: "var(--muted)" }}
          >
            {completedSteps}/{roadmap.steps.length}
          </span>
        </div>
        {roadmap.status === "PENDING_APPROVAL" && (
          <div
            className="mt-3 text-xs px-3 py-2 rounded-xl"
            style={{ background: "#FEF3C7", color: "#92400E" }}
          >
            ⏳ Awaiting manager approval before you can start
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl text-sm text-red-700 bg-red-50 border border-red-100">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 px-4 py-3 rounded-xl text-sm text-green-700 bg-green-50 border border-green-100">
          {success}
        </div>
      )}

      <div className="space-y-4">
        {roadmap.steps.map((step, idx) => {
          const d = submitData[step.id] ?? { notes: "", url: "" };
          const canSubmit =
            step.status === "IN_PROGRESS" || step.status === "REJECTED";
          return (
            <div
              key={step.id}
              className="rounded-2xl p-5"
              style={{
                background: "var(--card)",
                border: "1px solid var(--cardBorder)",
                opacity: step.status === "PENDING" ? 0.6 : 1,
              }}
            >
              <div className="flex items-start gap-3">
                <div className="flex flex-col items-center gap-1 flex-shrink-0 mt-0.5">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{
                      background: step.is_completed
                        ? "#10B981"
                        : "var(--accentLight)",
                      color: step.is_completed ? "white" : "var(--accent)",
                    }}
                  >
                    {step.is_completed ? "✓" : idx + 1}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3
                      className="text-sm font-bold"
                      style={{ color: "var(--ink)" }}
                    >
                      {step.title}
                    </h3>
                    <span
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                      style={{
                        background:
                          (STEP_STATUS_COLOR[step.status] ?? "#D1D5DB") + "20",
                        color: STEP_STATUS_COLOR[step.status] ?? "#6B7280",
                      }}
                    >
                      {step.status.replace(/_/g, " ")}
                    </span>
                    {step.phase && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                        {step.phase}
                      </span>
                    )}
                  </div>
                  <p
                    className="text-xs leading-relaxed mb-2"
                    style={{ color: "var(--muted)" }}
                  >
                    {step.description}
                  </p>

                  <div
                    className="flex items-center gap-3 text-[10px] mb-3"
                    style={{ color: "var(--muted)" }}
                  >
                    {step.difficulty && <span>⚡ {step.difficulty}</span>}
                    {step.duration && <span>⏱ {step.duration}h</span>}
                    {step.resource_url && (
                      <a
                        href={step.resource_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 hover:underline"
                        style={{ color: "var(--accent)" }}
                      >
                        <svg
                          width="12"
                          height="12"
                          fill="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            d="M12 19.5v-15m0 0l-6.75 6.75M12 4.5l6.75 6.75"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            fill="none"
                          />
                        </svg>
                        {step.resource_type === "video"
                          ? "Watch Video"
                          : "Resource"}
                      </a>
                    )}
                  </div>

                  {step.feedback && (
                    <div
                      className="mb-3 px-3 py-2 rounded-xl text-xs"
                      style={{
                        background:
                          step.status === "REJECTED" ? "#FEF2F2" : "#F0FDF4",
                        color:
                          step.status === "REJECTED" ? "#991B1B" : "#166534",
                      }}
                    >
                      {step.status === "REJECTED"
                        ? "❌ Feedback: "
                        : "✅ Manager: "}
                      {step.feedback}
                    </div>
                  )}

                  {step.status === "SUBMITTED" && (
                    <div
                      className="px-3 py-2 rounded-xl text-xs mb-3"
                      style={{ background: "#EDE9FE", color: "#5B21B6" }}
                    >
                      🔍 Submitted for review — waiting for manager
                    </div>
                  )}

                  {canSubmit && (
                    <div
                      className="space-y-2 mt-2 pt-3 border-t"
                      style={{ borderColor: "var(--cardBorder)" }}
                    >
                      <textarea
                        rows={2}
                        placeholder="What did you learn? (notes)"
                        value={d.notes}
                        onChange={(e) =>
                          setSubmitData((prev) => ({
                            ...prev,
                            [step.id]: { ...d, notes: e.target.value },
                          }))
                        }
                        className="w-full text-xs px-3 py-2 rounded-xl resize-none focus:outline-none"
                        style={{
                          border: "1px solid var(--cardBorder)",
                          background: "transparent",
                          color: "var(--ink)",
                        }}
                      />
                      <input
                        type="url"
                        placeholder="Evidence link (GitHub or Dropbox URL)"
                        value={d.url}
                        onChange={(e) =>
                          setSubmitData((prev) => ({
                            ...prev,
                            [step.id]: { ...d, url: e.target.value },
                          }))
                        }
                        className="w-full text-xs px-3 py-2 rounded-xl focus:outline-none"
                        style={{
                          border: "1px solid var(--cardBorder)",
                          background: "transparent",
                          color: "var(--ink)",
                        }}
                      />
                      <button
                        onClick={() => handleSubmit(step.id)}
                        disabled={submitting === step.id || !d.url}
                        className="text-xs font-semibold px-4 py-2 rounded-xl transition-all disabled:opacity-50"
                        style={{ background: "var(--accent)", color: "white" }}
                      >
                        {submitting === step.id
                          ? "Submitting..."
                          : "Submit for Review"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Draft Roadmap Section ───────────────────────────────────────────────────

interface DraftRoadmap {
  id: number;
  skill_name: string;
  status: string;
  mentor_context: Record<string, string>;
  draft_description: string;
  draft_steps: {
    title: string;
    phase: string;
    difficulty: string;
    duration: number;
    description: string;
    resource_url: string;
  }[];
  updated_at: string;
}

function DraftsSection({
  token,
  onConfirmed,
}: {
  token: string;
  onConfirmed: () => void;
}) {
  const [drafts, setDrafts] = useState<DraftRoadmap[]>([]);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [discarding, setDiscarding] = useState<number | null>(null);
  const [msg, setMsg] = useState<{
    id: number;
    text: string;
    ok: boolean;
  } | null>(null);

  const load = useCallback(async () => {
    const res = await apiGet(token, "/upskilling/drafts/");
    setDrafts(Array.isArray(res.drafts) ? res.drafts : []);
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  if (drafts.length === 0) return null;

  const PHASE_COLORS: Record<string, string> = {
    Foundation: "#74B9FF",
    "Tactical Implementation": "#A29BFE",
    "Strategic Mastery": "#1DD1A1",
  };

  async function confirmDraft(id: number) {
    setConfirming(id);
    setMsg(null);
    const res = await apiPost(token, `/upskilling/drafts/${id}/confirm/`);
    setConfirming(null);
    if (res.status === "submitted") {
      setMsg({
        id,
        text: `✅ "${res.skill_name}" submitted for manager approval!`,
        ok: true,
      });
      setTimeout(() => {
        load();
        onConfirmed();
      }, 1500);
    } else {
      setMsg({ id, text: res.error || "Failed to submit", ok: false });
    }
  }

  async function discardDraft(id: number) {
    setDiscarding(id);
    await fetch(
      `${import.meta.env.VITE_API_BASE ?? "http://localhost:8000/api"}/upskilling/drafts/?id=${id}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    setDiscarding(null);
    load();
  }

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-4">
        <span
          className="text-sm font-bold"
          style={{ color: "var(--text-dark)" }}
        >
          📋 Draft Roadmaps
        </span>
        <span
          className="text-xs px-2 py-0.5 rounded-full font-semibold"
          style={{ background: "#FECA57", color: "#7d5a00" }}
        >
          {drafts.length} awaiting review
        </span>
      </div>

      <div className="space-y-6">
        {drafts.map((d) => {
          const ctx = d.mentor_context;
          return (
            <div
              key={d.id}
              className="rounded-2xl overflow-hidden"
              style={{
                background: "var(--card-bg)",
                border: "2px dashed #FECA57",
              }}
            >
              {/* ── Draft banner ── */}
              <div
                className="flex items-center justify-between px-5 py-3"
                style={{
                  background: "rgba(254,202,87,0.12)",
                  borderBottom: "1px dashed #FECA57",
                }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="text-[10px] font-bold tracking-widest px-2 py-0.5 rounded"
                    style={{ background: "#FECA57", color: "#7d5a00" }}
                  >
                    DRAFT
                  </span>
                  <span
                    className="text-sm font-bold uppercase tracking-wide"
                    style={{ color: "var(--text-dark)" }}
                  >
                    {d.skill_name}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {/* mentor context pills */}
                  <div className="hidden sm:flex gap-1.5">
                    {ctx.level && (
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full"
                        style={{
                          background: "var(--primary-pale)",
                          color: "var(--primary)",
                        }}
                      >
                        {ctx.level}
                      </span>
                    )}
                    {ctx.timeline && (
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full"
                        style={{
                          background: "rgba(29,209,161,0.15)",
                          color: "#1DD1A1",
                        }}
                      >
                        {ctx.timeline}
                      </span>
                    )}
                    {ctx.time_per_week && (
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full"
                        style={{
                          background: "rgba(116,185,255,0.15)",
                          color: "#74B9FF",
                        }}
                      >
                        {ctx.time_per_week}/wk
                      </span>
                    )}
                  </div>
                  {/* fake progress */}
                  <span
                    className="text-xs font-semibold"
                    style={{ color: "var(--text-muted)" }}
                  >
                    0/{d.draft_steps.length}
                  </span>
                </div>
              </div>

              {/* fake progress bar */}
              <div
                className="h-1 w-full"
                style={{ background: "var(--card-border)" }}
              >
                <div
                  className="h-full w-0 rounded-full"
                  style={{ background: "var(--primary)" }}
                />
              </div>

              {/* description */}
              {d.draft_description && (
                <p
                  className="text-xs px-5 pt-4 leading-relaxed"
                  style={{ color: "var(--text-muted)" }}
                >
                  {d.draft_description}
                </p>
              )}

              {/* ── Steps — same layout as RoadmapDetail ── */}
              <div className="px-5 py-4 space-y-3">
                {d.draft_steps.map((s, idx) => {
                  const phaseColor = PHASE_COLORS[s.phase] ?? "var(--primary)";
                  return (
                    <div
                      key={idx}
                      className="flex items-center gap-4 rounded-2xl px-4 py-3"
                      style={{
                        background: "var(--page-bg)",
                        border: "1px solid var(--card-border)",
                      }}
                    >
                      {/* number */}
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                        style={{
                          background: "var(--primary-pale)",
                          color: "var(--primary)",
                        }}
                      >
                        {idx + 1}
                      </div>

                      {/* title + phase badge */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className="text-sm font-semibold"
                            style={{ color: "var(--text-dark)" }}
                          >
                            {s.title}
                          </span>
                          {s.phase && (
                            <span
                              className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                              style={{
                                background: phaseColor + "22",
                                color: phaseColor,
                              }}
                            >
                              {s.phase}
                            </span>
                          )}
                        </div>
                        <div
                          className="flex items-center gap-3 mt-0.5 text-[11px]"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {s.difficulty && <span>⚡ {s.difficulty}</span>}
                          {s.duration > 0 && <span>⏱ {s.duration}h</span>}
                          <span
                            className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                            style={{
                              background: "rgba(254,202,87,0.2)",
                              color: "#b8860b",
                            }}
                          >
                            Pending
                          </span>
                        </div>
                      </div>

                      {/* ► play button → YouTube */}
                      {s.resource_url ? (
                        <a
                          href={s.resource_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Watch on YouTube"
                          className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all hover:scale-110"
                          style={{
                            background: "var(--primary)",
                            color: "white",
                          }}
                        >
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                          >
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </a>
                      ) : (
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{
                            background: "var(--card-border)",
                            color: "var(--text-muted)",
                          }}
                        >
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                          >
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* ── Actions ── */}
              {msg?.id === d.id && (
                <div
                  className="px-5 pb-2 text-xs font-semibold"
                  style={{ color: msg.ok ? "#1DD1A1" : "#FF6B6B" }}
                >
                  {msg.text}
                </div>
              )}
              <div className="flex gap-3 px-5 pb-5 pt-1">
                <button
                  onClick={() => confirmDraft(d.id)}
                  disabled={confirming === d.id}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all"
                  style={{
                    background:
                      confirming === d.id
                        ? "var(--primary-pale)"
                        : "var(--primary)",
                    color: confirming === d.id ? "var(--primary)" : "white",
                  }}
                >
                  {confirming === d.id
                    ? "Submitting..."
                    : "✅ Submit for Manager Approval"}
                </button>
                <button
                  onClick={() => discardDraft(d.id)}
                  disabled={discarding === d.id}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold border"
                  style={{
                    borderColor: "#FF6B6B",
                    color: "#FF6B6B",
                    background: "transparent",
                  }}
                >
                  {discarding === d.id ? "..." : "Discard"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Employee: roadmap list ───────────────────────────────────────────────────

function EmployeeView({ token }: { token: string }) {
  const [roadmaps, setRoadmaps] = useState<Roadmap[]>([]);
  const [selected, setSelected] = useState<Roadmap | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [skillInput, setSkillInput] = useState("");
  const [createError, setCreateError] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const loadRoadmaps = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet(token, "/upskilling/roadmaps/");
      setRoadmaps(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadRoadmaps();
  }, [loadRoadmaps]);

  async function loadDetail(id: number) {
    const data = await apiGet(token, `/upskilling/roadmaps/${id}/`);
    setSelected(data);
  }

  async function handleCreate() {
    if (!skillInput.trim()) return;
    setCreating(true);
    setCreateError("");
    try {
      const res = await apiPost(token, "/upskilling/roadmaps/", {
        skill_name: skillInput.trim(),
      });
      if (res.error) {
        setCreateError(res.error);
      } else {
        setShowCreate(false);
        setSkillInput("");
        await loadRoadmaps();
      }
    } finally {
      setCreating(false);
    }
  }

  if (selected) {
    return (
      <RoadmapDetail
        roadmap={selected}
        token={token}
        onBack={() => setSelected(null)}
        onRefresh={() => loadDetail(selected.id)}
      />
    );
  }

  return (
    <div>
      <DraftsSection token={token} onConfirmed={loadRoadmaps} />
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-bold" style={{ color: "var(--ink)" }}>
            My Upskilling Roadmaps
          </h2>
          <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
            AI-generated learning paths tailored to your career goals
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-xl"
          style={{ background: "var(--accent)", color: "white" }}
        >
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24">
            <path
              d="M12 5v14M5 12h14"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
          New Roadmap
        </button>
      </div>

      {showCreate && (
        <div
          className="mb-5 p-5 rounded-2xl"
          style={{
            background: "var(--card-bg)",
            border: "1px solid var(--card-border)",
          }}
        >
          <div
            className="flex items-start gap-3 mb-4 p-4 rounded-xl"
            style={{ background: "var(--primary-pale)" }}
          >
            <span className="text-xl">🎓</span>
            <div>
              <div
                className="text-sm font-bold"
                style={{ color: "var(--primary)" }}
              >
                Use AI Mentor in Chat (Recommended)
              </div>
              <div
                className="text-xs mt-1"
                style={{ color: "var(--text-muted)" }}
              >
                Go to <strong>AI Insights</strong> tab and say{" "}
                <em>"I want to learn [skill]"</em> — your AI mentor will guide
                you with questions and build a personalized roadmap before you
                submit.
              </div>
            </div>
          </div>
          <h3
            className="text-sm font-bold mb-3"
            style={{ color: "var(--text-dark)" }}
          >
            Or Quick-Create
          </h3>
          <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
            Enter a skill to instantly generate a standard 3-phase roadmap (no
            mentor Q&A).
          </p>
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="e.g. Machine Learning, React, Leadership..."
              value={skillInput}
              onChange={(e) => setSkillInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              className="flex-1 text-sm px-4 py-2.5 rounded-xl focus:outline-none"
              style={{
                border: "1px solid var(--cardBorder)",
                background: "transparent",
                color: "var(--ink)",
              }}
            />
            <button
              onClick={handleCreate}
              disabled={creating || !skillInput.trim()}
              className="text-sm font-semibold px-5 py-2.5 rounded-xl disabled:opacity-50"
              style={{ background: "var(--accent)", color: "white" }}
            >
              {creating ? "Generating..." : "Generate"}
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="text-sm px-4 py-2.5 rounded-xl"
              style={{
                background: "var(--accentLight)",
                color: "var(--accent)",
              }}
            >
              Cancel
            </button>
          </div>
          {createError && (
            <p className="mt-2 text-xs text-red-600">{createError}</p>
          )}
          {creating && (
            <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
              🤖 AI is designing your personalized roadmap... this takes ~15
              seconds.
            </p>
          )}
        </div>
      )}

      {loading ? (
        <div
          className="text-center py-16 text-sm"
          style={{ color: "var(--muted)" }}
        >
          Loading roadmaps...
        </div>
      ) : roadmaps.length === 0 ? (
        <div
          className="text-center py-16 rounded-2xl"
          style={{
            background: "var(--card)",
            border: "1px solid var(--cardBorder)",
          }}
        >
          <div className="text-4xl mb-3">🎯</div>
          <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
            No roadmaps yet
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
            Create your first AI-powered learning roadmap above
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {roadmaps.map((r) => (
            <button
              key={r.id}
              onClick={() => loadDetail(r.id)}
              className="text-left p-5 rounded-2xl transition-all hover:shadow-md"
              style={{
                background: "var(--card)",
                border: "1px solid var(--cardBorder)",
              }}
            >
              <div className="flex items-start justify-between mb-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                  style={{ background: "var(--accentLight)" }}
                >
                  🚀
                </div>
                <StatusBadge status={r.status} />
              </div>
              <h3
                className="text-sm font-bold mb-1"
                style={{ color: "var(--ink)" }}
              >
                {r.skill_name}
              </h3>
              <div className="flex items-center gap-2 mt-3">
                <ProgressBar
                  total={r.step_count ?? 0}
                  done={r.completed_steps ?? 0}
                />
                <span
                  className="text-[10px] whitespace-nowrap"
                  style={{ color: "var(--muted)" }}
                >
                  {r.completed_steps ?? 0}/{r.step_count ?? 0}
                </span>
              </div>
              <p className="text-[10px] mt-2" style={{ color: "var(--muted)" }}>
                {new Date(r.created_at).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Manager: approval panel ──────────────────────────────────────────────────

function ManagerView({ token }: { token: string }) {
  const [tab, setTab] = useState<"pending" | "team">("pending");
  const [pending, setPending] = useState<Roadmap[]>([]);
  const [team, setTeam] = useState<Roadmap[]>([]);
  const [selected, setSelected] = useState<Roadmap | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionState, setActionState] = useState<{
    id: number;
    type: "roadmap" | "step";
    action: "approve" | "reject";
  } | null>(null);
  const [feedback, setFeedback] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [p, t] = await Promise.all([
        apiGet(token, "/upskilling/roadmaps/pending/"),
        apiGet(token, "/upskilling/team/roadmaps/"),
      ]);
      setPending(Array.isArray(p) ? p : []);
      setTeam(Array.isArray(t) ? t : []);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function loadDetail(id: number) {
    const data = await apiGet(token, `/upskilling/roadmaps/${id}/`);
    setSelected(data);
  }

  async function handleRoadmapAction(id: number, action: "approve" | "reject") {
    setActionError("");
    if (action === "reject" && !feedback.trim()) {
      setActionError("Feedback required for rejection");
      return;
    }
    try {
      const res =
        action === "approve"
          ? await apiPost(token, `/upskilling/roadmaps/${id}/approve/`)
          : await apiPost(token, `/upskilling/roadmaps/${id}/reject/`, {
              feedback,
            });
      if (res.error) {
        setActionError(res.error);
      } else {
        setActionSuccess(
          action === "approve" ? "Roadmap approved!" : "Roadmap rejected.",
        );
        setActionState(null);
        setFeedback("");
        if (selected?.id === id) setSelected(null);
        await loadData();
      }
    } catch {
      setActionError("Action failed");
    }
  }

  async function handleStepAction(
    stepId: number,
    action: "approve" | "reject",
  ) {
    setActionError("");
    if (action === "reject" && !feedback.trim()) {
      setActionError("Feedback required for rejection");
      return;
    }
    try {
      const res =
        action === "approve"
          ? await apiPost(token, `/upskilling/steps/${stepId}/approve/`, {
              feedback: feedback || "Excellent work!",
            })
          : await apiPost(token, `/upskilling/steps/${stepId}/reject/`, {
              feedback,
            });
      if (res.error) {
        setActionError(res.error);
      } else {
        setActionSuccess(
          action === "approve"
            ? "Step approved!"
            : "Step rejected with feedback.",
        );
        setActionState(null);
        setFeedback("");
        if (selected) await loadDetail(selected.id);
        await loadData();
      }
    } catch {
      setActionError("Action failed");
    }
  }

  if (selected) {
    const submittedSteps = selected.steps.filter(
      (s) => s.status === "SUBMITTED",
    );
    return (
      <div>
        <button
          onClick={() => setSelected(null)}
          className="flex items-center gap-1.5 text-sm mb-5"
          style={{ color: "var(--accent)" }}
        >
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24">
            <path
              d="M19 12H5M12 19l-7-7 7-7"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Back
        </button>

        <div
          className="rounded-2xl p-5 mb-5"
          style={{
            background: "var(--card)",
            border: "1px solid var(--cardBorder)",
          }}
        >
          <div className="flex items-start justify-between gap-3 mb-2">
            <div>
              <h2 className="text-lg font-bold" style={{ color: "var(--ink)" }}>
                {selected.skill_name}
              </h2>
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                Employee: <strong>{selected.employee_name}</strong>
              </p>
            </div>
            <StatusBadge status={selected.status} />
          </div>
          <p
            className="text-xs leading-relaxed mb-3"
            style={{ color: "var(--muted)" }}
          >
            {selected.description}
          </p>
          <ProgressBar
            total={selected.steps.length}
            done={selected.steps.filter((s) => s.is_completed).length}
          />

          {selected.status === "PENDING_APPROVAL" && (
            <div className="flex gap-3 mt-4">
              {actionState?.id === selected.id &&
              actionState.type === "roadmap" &&
              actionState.action === "reject" ? (
                <div className="flex-1 space-y-2">
                  <textarea
                    rows={2}
                    placeholder="Rejection reason..."
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-xl resize-none focus:outline-none"
                    style={{
                      border: "1px solid var(--cardBorder)",
                      background: "transparent",
                      color: "var(--ink)",
                    }}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleRoadmapAction(selected.id, "reject")}
                      className="text-xs font-semibold px-4 py-2 rounded-xl bg-red-500 text-white"
                    >
                      Confirm Reject
                    </button>
                    <button
                      onClick={() => {
                        setActionState(null);
                        setFeedback("");
                      }}
                      className="text-xs px-4 py-2 rounded-xl"
                      style={{
                        background: "var(--accentLight)",
                        color: "var(--accent)",
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                  {actionError && (
                    <p className="text-xs text-red-600">{actionError}</p>
                  )}
                </div>
              ) : (
                <>
                  <button
                    onClick={() => handleRoadmapAction(selected.id, "approve")}
                    className="text-sm font-semibold px-5 py-2 rounded-xl"
                    style={{ background: "var(--accent)", color: "white" }}
                  >
                    ✓ Approve Roadmap
                  </button>
                  <button
                    onClick={() =>
                      setActionState({
                        id: selected.id,
                        type: "roadmap",
                        action: "reject",
                      })
                    }
                    className="text-sm font-semibold px-5 py-2 rounded-xl bg-red-100 text-red-700"
                  >
                    ✗ Reject
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {actionSuccess && (
          <div className="mb-4 px-4 py-3 rounded-xl text-sm text-green-700 bg-green-50 border border-green-100">
            {actionSuccess}
          </div>
        )}

        {submittedSteps.length > 0 && (
          <div
            className="mb-5 p-5 rounded-2xl"
            style={{ background: "#EDE9FE22", border: "1px solid #DDD6FE" }}
          >
            <h3 className="text-sm font-bold mb-3" style={{ color: "#5B21B6" }}>
              🔍 Pending Step Reviews ({submittedSteps.length})
            </h3>
            <div className="space-y-3">
              {submittedSteps.map((step) => (
                <div
                  key={step.id}
                  className="p-4 rounded-xl"
                  style={{
                    background: "var(--card)",
                    border: "1px solid var(--cardBorder)",
                  }}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4
                        className="text-sm font-semibold"
                        style={{ color: "var(--ink)" }}
                      >
                        Step {step.order}: {step.title}
                      </h4>
                      {step.submission_notes && (
                        <p
                          className="text-xs mt-1"
                          style={{ color: "var(--muted)" }}
                        >
                          Notes: {step.submission_notes}
                        </p>
                      )}
                      {step.submission_url && (
                        <a
                          href={step.submission_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs mt-1 flex items-center gap-1 hover:underline"
                          style={{ color: "var(--accent)" }}
                        >
                          🔗 View Evidence
                        </a>
                      )}
                    </div>
                  </div>
                  {actionState?.id === step.id &&
                  actionState.type === "step" ? (
                    <div className="space-y-2 mt-2">
                      <textarea
                        rows={2}
                        placeholder={
                          actionState.action === "approve"
                            ? "Feedback (optional)..."
                            : "Rejection reason (required)..."
                        }
                        value={feedback}
                        onChange={(e) => setFeedback(e.target.value)}
                        className="w-full text-xs px-3 py-2 rounded-xl resize-none focus:outline-none"
                        style={{
                          border: "1px solid var(--cardBorder)",
                          background: "transparent",
                          color: "var(--ink)",
                        }}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() =>
                            handleStepAction(step.id, actionState.action)
                          }
                          className={`text-xs font-semibold px-4 py-2 rounded-xl text-white ${actionState.action === "approve" ? "" : "bg-red-500"}`}
                          style={
                            actionState.action === "approve"
                              ? { background: "var(--accent)" }
                              : undefined
                          }
                        >
                          Confirm{" "}
                          {actionState.action === "approve"
                            ? "Approve"
                            : "Reject"}
                        </button>
                        <button
                          onClick={() => {
                            setActionState(null);
                            setFeedback("");
                          }}
                          className="text-xs px-4 py-2 rounded-xl"
                          style={{
                            background: "var(--accentLight)",
                            color: "var(--accent)",
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                      {actionError && (
                        <p className="text-xs text-red-600">{actionError}</p>
                      )}
                    </div>
                  ) : (
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => {
                          setActionState({
                            id: step.id,
                            type: "step",
                            action: "approve",
                          });
                          setFeedback("");
                        }}
                        className="text-xs font-semibold px-3 py-1.5 rounded-xl"
                        style={{ background: "var(--accent)", color: "white" }}
                      >
                        ✓ Approve
                      </button>
                      <button
                        onClick={() => {
                          setActionState({
                            id: step.id,
                            type: "step",
                            action: "reject",
                          });
                          setFeedback("");
                        }}
                        className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-red-100 text-red-700"
                      >
                        ✗ Reject
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <h3 className="text-sm font-bold mb-3" style={{ color: "var(--ink)" }}>
          All Steps
        </h3>
        <div className="space-y-3">
          {selected.steps.map((step, idx) => (
            <div
              key={step.id}
              className="flex gap-3 p-4 rounded-2xl"
              style={{
                background: "var(--card)",
                border: "1px solid var(--cardBorder)",
              }}
            >
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                style={{
                  background: "var(--accentLight)",
                  color: "var(--accent)",
                }}
              >
                {idx + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="text-xs font-semibold"
                    style={{ color: "var(--ink)" }}
                  >
                    {step.title}
                  </span>
                  <StepStatusDot status={step.status} />
                  <span
                    className="text-[10px]"
                    style={{ color: "var(--muted)" }}
                  >
                    {step.status.replace(/_/g, " ")}
                  </span>
                </div>
                {step.feedback && step.status !== "SUBMITTED" && (
                  <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                    Feedback: {step.feedback}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-xl font-bold" style={{ color: "var(--ink)" }}>
          Upskilling — Manager View
        </h2>
        <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
          Review and approve roadmaps and milestones from your direct reports
        </p>
      </div>

      {actionSuccess && (
        <div className="mb-4 px-4 py-3 rounded-xl text-sm text-green-700 bg-green-50 border border-green-100">
          {actionSuccess}
        </div>
      )}

      <div
        className="flex gap-1 mb-5 p-1 rounded-xl"
        style={{ background: "var(--accentLight)" }}
      >
        {(["pending", "team"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="flex-1 text-xs font-semibold py-2 rounded-lg transition-all"
            style={{
              background: tab === t ? "var(--accent)" : "transparent",
              color: tab === t ? "white" : "var(--muted)",
            }}
          >
            {t === "pending"
              ? `Pending Approvals${pending.length > 0 ? ` (${pending.length})` : ""}`
              : "Team Roadmaps"}
          </button>
        ))}
      </div>

      {loading ? (
        <div
          className="text-center py-16 text-sm"
          style={{ color: "var(--muted)" }}
        >
          Loading...
        </div>
      ) : tab === "pending" ? (
        pending.length === 0 ? (
          <div
            className="text-center py-16 rounded-2xl"
            style={{
              background: "var(--card)",
              border: "1px solid var(--cardBorder)",
            }}
          >
            <div className="text-4xl mb-3">✅</div>
            <p
              className="text-sm font-semibold"
              style={{ color: "var(--ink)" }}
            >
              All caught up
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
              No pending roadmap approvals
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {pending.map((r) => (
              <div
                key={r.id}
                className="p-5 rounded-2xl"
                style={{
                  background: "var(--card)",
                  border: "2px solid #FCD34D",
                }}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <h3
                      className="text-sm font-bold"
                      style={{ color: "var(--ink)" }}
                    >
                      {r.skill_name}
                    </h3>
                    <p
                      className="text-xs mt-0.5"
                      style={{ color: "var(--muted)" }}
                    >
                      Requested by <strong>{r.employee_name}</strong> ·{" "}
                      {r.step_count} milestones
                    </p>
                    <p
                      className="text-[10px] mt-1"
                      style={{ color: "var(--muted)" }}
                    >
                      {new Date(r.created_at).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                      })}
                    </p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
                <div className="flex gap-3 mt-3">
                  <button
                    onClick={() => loadDetail(r.id)}
                    className="text-xs px-4 py-2 rounded-xl"
                    style={{
                      background: "var(--accentLight)",
                      color: "var(--accent)",
                      fontWeight: 600,
                    }}
                  >
                    View Details
                  </button>
                  <button
                    onClick={async () => {
                      await handleRoadmapAction(r.id, "approve");
                    }}
                    className="text-xs font-semibold px-4 py-2 rounded-xl"
                    style={{ background: "var(--accent)", color: "white" }}
                  >
                    ✓ Quick Approve
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : team.length === 0 ? (
        <div
          className="text-center py-16 rounded-2xl"
          style={{
            background: "var(--card)",
            border: "1px solid var(--cardBorder)",
          }}
        >
          <div className="text-4xl mb-3">📚</div>
          <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
            No team roadmaps
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
            Your direct reports haven't created any roadmaps yet
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {team.map((r) => (
            <button
              key={r.id}
              onClick={() => loadDetail(r.id)}
              className="text-left p-5 rounded-2xl transition-all hover:shadow-md"
              style={{
                background: "var(--card)",
                border: "1px solid var(--cardBorder)",
              }}
            >
              <div className="flex items-start justify-between mb-2">
                <h3
                  className="text-sm font-bold"
                  style={{ color: "var(--ink)" }}
                >
                  {r.skill_name}
                </h3>
                <StatusBadge status={r.status} />
              </div>
              <p className="text-xs mb-3" style={{ color: "var(--muted)" }}>
                {r.employee_name}
              </p>
              <div className="flex items-center gap-2">
                <ProgressBar
                  total={r.step_count ?? 0}
                  done={r.completed_steps ?? 0}
                />
                <span
                  className="text-[10px] whitespace-nowrap"
                  style={{ color: "var(--muted)" }}
                >
                  {r.completed_steps ?? 0}/{r.step_count ?? 0}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Learning Insights (everyone) ─────────────────────────────────────────────

interface OrgInsights {
  trending_skills: { skill_name: string; count: number }[];
  dept_breakdown: {
    dept: string;
    count: number;
    completed: number;
    completion_rate: number;
  }[];
  status_distribution: { status: string; count: number }[];
  total_roadmaps: number;
  completed_roadmaps: number;
  in_progress_roadmaps: number;
  completion_rate: number;
  active_learners: number;
  new_this_month: number;
  new_this_week: number;
  skills_completed_month: number;
  top_learners: { name: string; steps_done: number }[];
  recent_activity: {
    skill: string;
    status: string;
    employee: string;
    created_at: string;
  }[];
  team_insights: {
    id: number;
    name: string;
    active_skills: { skill: string; status: string }[];
    steps_completed: number;
    steps_total: number;
    completion_pct: number;
  }[];
}

const STATUS_LABEL: Record<string, string> = {
  PENDING_APPROVAL: "Pending",
  IN_PROGRESS: "In Progress",
  PENDING_REVIEW: "In Review",
  COMPLETED: "Completed",
  ABANDONED: "Abandoned",
  REJECTED: "Rejected",
};
const PIE_COLORS = [
  "#3B82F6",
  "#10B981",
  "#8B5CF6",
  "#F59E0B",
  "#EF4444",
  "#6B7280",
];
const AV_COLORS = [
  "#0D9488",
  "#3B82F6",
  "#8B5CF6",
  "#F59E0B",
  "#EC4899",
  "#14B8A6",
];

function MiniBar({
  pct,
  color = "var(--accent)",
}: {
  pct: number;
  color?: string;
}) {
  return (
    <div
      className="flex-1 h-1.5 rounded-full overflow-hidden"
      style={{ background: "var(--accentLight)" }}
    >
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.min(100, pct)}%`, background: color }}
      />
    </div>
  );
}

function Kpi({
  icon,
  value,
  label,
  sub,
  accent = "var(--accent)",
}: {
  icon: string;
  value: string | number;
  label: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div
      className="p-5 rounded-2xl flex flex-col gap-2"
      style={{
        background: "var(--card)",
        border: "1px solid var(--cardBorder)",
      }}
    >
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center text-base"
        style={{ background: accent + "20" }}
      >
        {icon}
      </div>
      <div
        className="text-2xl font-black leading-none"
        style={{ color: "var(--ink)" }}
      >
        {value}
      </div>
      <div className="text-xs font-semibold" style={{ color: "var(--ink)" }}>
        {label}
      </div>
      {sub && (
        <div className="text-[10px]" style={{ color: "var(--muted)" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function LearningInsightsView({
  token,
  isManager,
}: {
  token: string;
  isManager: boolean;
}) {
  const [insights, setInsights] = useState<OrgInsights | null>(null);
  const [peers, setPeers] = useState<Roadmap[]>([]);
  const [loading, setLoading] = useState(true);
  const [copyState, setCopyState] = useState<
    Record<number, "idle" | "loading" | "done" | "err">
  >({});
  const [tab, setTab] = useState<"analytics" | "peers" | "team">("analytics");
  const [skillFilter, setSkillFilter] = useState("");

  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiGet(token, "/upskilling/org-insights/"),
      apiGet(token, "/upskilling/dept-peers/"),
    ])
      .then(([ins, p]) => {
        if (ins && !ins.error) setInsights(ins);
        if (Array.isArray(p)) setPeers(p);
      })
      .finally(() => setLoading(false));
  }, [token]);

  async function copyRoadmap(id: number) {
    setCopyState((s) => ({ ...s, [id]: "loading" }));
    try {
      const res = await apiPost(token, `/upskilling/roadmaps/${id}/copy/`);
      if (res.error) {
        setCopyState((s) => ({ ...s, [id]: "err" }));
        return;
      }
      setCopyState((s) => ({ ...s, [id]: "done" }));
    } catch {
      setCopyState((s) => ({ ...s, [id]: "err" }));
    }
  }

  const filteredPeers = useMemo(
    () =>
      peers.filter(
        (p) =>
          !skillFilter ||
          p.skill_name.toLowerCase().includes(skillFilter.toLowerCase()),
      ),
    [peers, skillFilter],
  );

  const TABS = [
    { id: "analytics", label: "📊 Org Analytics" },
    { id: "peers", label: "👥 Peer Learning" },
    ...(isManager ? [{ id: "team", label: "🎯 Team Progress" }] : []),
  ] as { id: string; label: string }[];

  if (loading)
    return (
      <div className="grid grid-cols-4 gap-4 mt-4">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div
            key={i}
            className="h-32 rounded-2xl animate-pulse"
            style={{
              background: "var(--accentLight)",
              gridColumn:
                i <= 4
                  ? undefined
                  : i === 5
                    ? "span 2"
                    : i === 7
                      ? "span 2"
                      : undefined,
            }}
          />
        ))}
      </div>
    );

  const pieData = (insights?.status_distribution ?? []).map((s) => ({
    name: STATUS_LABEL[s.status] ?? s.status,
    value: s.count,
  }));

  const trendData = (insights?.trending_skills ?? []).slice(0, 8).map((s) => ({
    name:
      s.skill_name.length > 18 ? s.skill_name.slice(0, 16) + "…" : s.skill_name,
    count: s.count,
  }));

  const deptData = (insights?.dept_breakdown ?? []).slice(0, 6).map((d) => ({
    name: d.dept.length > 14 ? d.dept.slice(0, 12) + "…" : d.dept,
    total: d.count,
    completed: d.completed,
  }));

  return (
    <div>
      {/* Sub-tab bar */}
      <div
        className="flex gap-1 mb-6 p-1 rounded-xl w-fit"
        style={{ background: "var(--accentLight)" }}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as typeof tab)}
            className="text-xs font-semibold px-4 py-2 rounded-lg transition-all"
            style={{
              background: tab === t.id ? "var(--accent)" : "transparent",
              color: tab === t.id ? "white" : "var(--muted)",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Analytics ── */}
      {tab === "analytics" && insights && (
        <div className="space-y-5">
          {/* KPI row — 6 metrics */}
          <div className="grid grid-cols-6 gap-3">
            <Kpi
              icon="📚"
              value={insights.total_roadmaps}
              label="Total Roadmaps"
              sub="org-wide"
            />
            <Kpi
              icon="✅"
              value={insights.completed_roadmaps}
              label="Completed"
              accent="#10B981"
            />
            <Kpi
              icon="⚡"
              value={insights.in_progress_roadmaps}
              label="In Progress"
              accent="#3B82F6"
            />
            <Kpi
              icon="👥"
              value={insights.active_learners}
              label="Active Learners"
              accent="#8B5CF6"
            />
            <Kpi
              icon="🆕"
              value={insights.new_this_month}
              label="New This Month"
              sub={`${insights.new_this_week} this week`}
              accent="#F59E0B"
            />
            <Kpi
              icon="🎯"
              value={`${insights.completion_rate}%`}
              label="Completion Rate"
              accent="#10B981"
            />
          </div>

          {/* Row 2: Trending bar chart + Pie status */}
          <div className="grid grid-cols-3 gap-4">
            <div
              className="col-span-2 p-5 rounded-2xl"
              style={{
                background: "var(--card)",
                border: "1px solid var(--cardBorder)",
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <h3
                  className="text-sm font-bold"
                  style={{ color: "var(--ink)" }}
                >
                  🔥 Trending Skills Across Org
                </h3>
                <span
                  className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                  style={{
                    background: "var(--accentLight)",
                    color: "var(--accent)",
                  }}
                >
                  Top {trendData.length}
                </span>
              </div>
              {trendData.length === 0 ? (
                <div
                  className="text-center py-10 text-xs"
                  style={{ color: "var(--muted)" }}
                >
                  No roadmap data yet
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={trendData} barSize={22} layout="vertical">
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--cardBorder)"
                      horizontal={false}
                    />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 10, fill: "var(--muted)" }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 10, fill: "var(--ink)" }}
                      axisLine={false}
                      tickLine={false}
                      width={110}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--card)",
                        border: "1px solid var(--cardBorder)",
                        borderRadius: 12,
                        fontSize: 12,
                      }}
                      formatter={(v: number) => [v, "Learners"]}
                    />
                    <Bar
                      dataKey="count"
                      fill="var(--accent)"
                      radius={[0, 6, 6, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div
              className="p-5 rounded-2xl"
              style={{
                background: "var(--card)",
                border: "1px solid var(--cardBorder)",
              }}
            >
              <h3
                className="text-sm font-bold mb-4"
                style={{ color: "var(--ink)" }}
              >
                📋 Status Breakdown
              </h3>
              {pieData.length === 0 ? (
                <div
                  className="text-center py-10 text-xs"
                  style={{ color: "var(--muted)" }}
                >
                  No data yet
                </div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={72}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {pieData.map((_, i) => (
                          <Cell
                            key={i}
                            fill={PIE_COLORS[i % PIE_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: "var(--card)",
                          border: "1px solid var(--cardBorder)",
                          borderRadius: 10,
                          fontSize: 11,
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1.5 mt-2">
                    {pieData.map((d, i) => (
                      <div
                        key={d.name}
                        className="flex items-center justify-between"
                      >
                        <div className="flex items-center gap-1.5">
                          <div
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{
                              background: PIE_COLORS[i % PIE_COLORS.length],
                            }}
                          />
                          <span
                            className="text-[10px]"
                            style={{ color: "var(--muted)" }}
                          >
                            {d.name}
                          </span>
                        </div>
                        <span
                          className="text-[10px] font-bold"
                          style={{ color: "var(--ink)" }}
                        >
                          {d.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Row 3: Dept chart + Top learners + Recent activity */}
          <div className="grid grid-cols-3 gap-4">
            <div
              className="col-span-2 p-5 rounded-2xl"
              style={{
                background: "var(--card)",
                border: "1px solid var(--cardBorder)",
              }}
            >
              <h3
                className="text-sm font-bold mb-4"
                style={{ color: "var(--ink)" }}
              >
                🏢 Learning Activity by Department
              </h3>
              {deptData.length === 0 ? (
                <div
                  className="text-center py-10 text-xs"
                  style={{ color: "var(--muted)" }}
                >
                  No department data yet
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={deptData} barGap={3} barCategoryGap="28%">
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--cardBorder)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 10, fill: "var(--muted)" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "var(--muted)" }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--card)",
                        border: "1px solid var(--cardBorder)",
                        borderRadius: 12,
                        fontSize: 11,
                      }}
                    />
                    <Bar
                      dataKey="total"
                      name="Active"
                      fill="#3B82F6"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="completed"
                      name="Completed"
                      fill="#10B981"
                      radius={[4, 4, 0, 0]}
                    />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="flex flex-col gap-4">
              {/* Top learners */}
              <div
                className="p-5 rounded-2xl flex-1"
                style={{
                  background: "var(--card)",
                  border: "1px solid var(--cardBorder)",
                }}
              >
                <h3
                  className="text-sm font-bold mb-3"
                  style={{ color: "var(--ink)" }}
                >
                  🏆 Top Learners
                </h3>
                {insights.top_learners.length === 0 ? (
                  <p
                    className="text-xs text-center py-4"
                    style={{ color: "var(--muted)" }}
                  >
                    No completions yet
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {insights.top_learners.map((l, i) => (
                      <div key={l.name} className="flex items-center gap-2">
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black text-white flex-shrink-0"
                          style={{
                            background:
                              i === 0
                                ? "#F59E0B"
                                : i === 1
                                  ? "#9CA3AF"
                                  : i === 2
                                    ? "#B45309"
                                    : "var(--accent)",
                          }}
                        >
                          {i + 1}
                        </div>
                        <span
                          className="text-xs font-medium flex-1 truncate"
                          style={{ color: "var(--ink)" }}
                        >
                          {l.name.split(" ")[0]}
                        </span>
                        <span
                          className="text-[10px] font-bold"
                          style={{ color: "var(--accent)" }}
                        >
                          {l.steps_done} steps
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Skills completed this month */}
              <div
                className="p-4 rounded-2xl"
                style={{
                  background:
                    "linear-gradient(135deg, var(--navPill), var(--primary))",
                  border: "none",
                }}
              >
                <div className="text-white/60 text-[10px] font-semibold uppercase tracking-wide">
                  Steps Completed
                </div>
                <div className="text-3xl font-black text-white mt-1">
                  {insights.skills_completed_month}
                </div>
                <div className="text-white/60 text-[10px] mt-0.5">
                  last 30 days
                </div>
              </div>
            </div>
          </div>

          {/* Row 4: Recent activity feed */}
          <div
            className="p-5 rounded-2xl"
            style={{
              background: "var(--card)",
              border: "1px solid var(--cardBorder)",
            }}
          >
            <h3
              className="text-sm font-bold mb-4"
              style={{ color: "var(--ink)" }}
            >
              ⚡ Recent Learning Activity
            </h3>
            {insights.recent_activity.length === 0 ? (
              <p
                className="text-xs text-center py-6"
                style={{ color: "var(--muted)" }}
              >
                No activity yet
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-x-8 gap-y-2">
                {insights.recent_activity.map((a, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 py-1.5"
                    style={{
                      borderBottom:
                        i < insights.recent_activity.length - 2
                          ? "1px solid var(--cardBorder)"
                          : undefined,
                    }}
                  >
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{
                        background: STATUS_COLOR[a.status] ?? "#9CA3AF",
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <span
                        className="text-xs font-semibold truncate block"
                        style={{ color: "var(--ink)" }}
                      >
                        {a.skill}
                      </span>
                      <span
                        className="text-[10px]"
                        style={{ color: "var(--muted)" }}
                      >
                        {a.employee} · {STATUS_LABEL[a.status] ?? a.status}
                      </span>
                    </div>
                    <span
                      className="text-[10px] flex-shrink-0"
                      style={{ color: "var(--muted)" }}
                    >
                      {a.created_at
                        ? new Date(a.created_at).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                          })
                        : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Peer learning ── */}
      {tab === "peers" && (
        <div>
          <div className="flex items-center gap-3 mb-5">
            <input
              type="text"
              placeholder="Search skills…"
              value={skillFilter}
              onChange={(e) => setSkillFilter(e.target.value)}
              className="text-sm px-4 py-2.5 rounded-xl border outline-none"
              style={{
                borderColor: "var(--cardBorder)",
                background: "var(--card)",
                color: "var(--ink)",
                minWidth: 240,
              }}
            />
            <span
              className="text-xs px-3 py-1.5 rounded-lg font-semibold"
              style={{
                background: "var(--accentLight)",
                color: "var(--accent)",
              }}
            >
              {filteredPeers.length} roadmap
              {filteredPeers.length !== 1 ? "s" : ""} in your dept
            </span>
          </div>
          {filteredPeers.length === 0 ? (
            <div
              className="text-center py-24 rounded-2xl"
              style={{
                background: "var(--card)",
                border: "1px solid var(--cardBorder)",
              }}
            >
              <div className="text-5xl mb-4">👥</div>
              <p
                className="text-base font-bold"
                style={{ color: "var(--ink)" }}
              >
                No peer roadmaps yet
              </p>
              <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
                Your department colleagues haven't shared roadmaps yet
              </p>
            </div>
          ) : (
            <div
              className="grid gap-4"
              style={{
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              }}
            >
              {filteredPeers.map((r) => {
                const cs = copyState[r.id] ?? "idle";
                const pct = r.step_count
                  ? Math.round(((r.completed_steps ?? 0) / r.step_count) * 100)
                  : 0;
                return (
                  <div
                    key={r.id}
                    className="p-5 rounded-2xl flex flex-col gap-3 hover:shadow-md transition-shadow"
                    style={{
                      background: "var(--card)",
                      border: "1px solid var(--cardBorder)",
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h4
                          className="text-sm font-bold"
                          style={{ color: "var(--ink)" }}
                        >
                          {r.skill_name}
                        </h4>
                        <p
                          className="text-[11px] mt-0.5 font-medium"
                          style={{ color: "var(--muted)" }}
                        >
                          by {r.employee_name}
                        </p>
                      </div>
                      <StatusBadge status={r.status} />
                    </div>
                    <div>
                      <div className="flex justify-between mb-1">
                        <span
                          className="text-[10px]"
                          style={{ color: "var(--muted)" }}
                        >
                          {r.completed_steps ?? 0}/{r.step_count ?? 0} steps
                        </span>
                        <span
                          className="text-[10px] font-bold"
                          style={{ color: "var(--accent)" }}
                        >
                          {pct}%
                        </span>
                      </div>
                      <MiniBar pct={pct} />
                    </div>
                    {r.description && (
                      <p
                        className="text-[11px] line-clamp-2 leading-relaxed"
                        style={{ color: "var(--muted)" }}
                      >
                        {r.description}
                      </p>
                    )}
                    <button
                      onClick={() => copyRoadmap(r.id)}
                      disabled={cs === "loading" || cs === "done"}
                      className="w-full text-xs font-bold py-2.5 rounded-xl transition-all disabled:opacity-60 mt-auto"
                      style={{
                        background:
                          cs === "done"
                            ? "#D1FAE5"
                            : cs === "err"
                              ? "#FEE2E2"
                              : "var(--accent)",
                        color:
                          cs === "done"
                            ? "#065F46"
                            : cs === "err"
                              ? "#991B1B"
                              : "white",
                      }}
                    >
                      {cs === "loading"
                        ? "Copying…"
                        : cs === "done"
                          ? "✓ Copied — awaiting manager approval"
                          : cs === "err"
                            ? "⚠ Already have this skill active"
                            : "📋 Copy to my roadmap"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Team progress (manager) ── */}
      {tab === "team" && isManager && insights && (
        <div>
          {insights.team_insights.length === 0 ? (
            <div
              className="text-center py-24 rounded-2xl"
              style={{
                background: "var(--card)",
                border: "1px solid var(--cardBorder)",
              }}
            >
              <div className="text-5xl mb-4">🎯</div>
              <p
                className="text-base font-bold"
                style={{ color: "var(--ink)" }}
              >
                No team learning data yet
              </p>
              <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
                Your direct reports haven't started any roadmaps
              </p>
            </div>
          ) : (
            <>
              {/* Radial chart overview */}
              <div
                className="p-5 rounded-2xl mb-5"
                style={{
                  background: "var(--card)",
                  border: "1px solid var(--cardBorder)",
                }}
              >
                <h3
                  className="text-sm font-bold mb-4"
                  style={{ color: "var(--ink)" }}
                >
                  📊 Team Step Completion Overview
                </h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart
                    data={insights.team_insights.map((m) => ({
                      name: m.name.split(" ")[0],
                      pct: m.completion_pct,
                      steps: m.steps_total,
                    }))}
                    barSize={32}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--cardBorder)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11, fill: "var(--ink)" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "var(--muted)" }}
                      axisLine={false}
                      tickLine={false}
                      domain={[0, 100]}
                      unit="%"
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--card)",
                        border: "1px solid var(--cardBorder)",
                        borderRadius: 12,
                        fontSize: 11,
                      }}
                      formatter={(v: number) => [`${v}%`, "Completion"]}
                    />
                    <Bar dataKey="pct" radius={[6, 6, 0, 0]}>
                      {insights.team_insights.map((_, i) => (
                        <Cell key={i} fill={AV_COLORS[i % AV_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Per-member cards */}
              <div
                className="grid gap-4"
                style={{
                  gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                }}
              >
                {insights.team_insights.map((m, i) => (
                  <div
                    key={m.id}
                    className="p-5 rounded-2xl"
                    style={{
                      background: "var(--card)",
                      border: "1px solid var(--cardBorder)",
                    }}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black text-white flex-shrink-0"
                        style={{ background: AV_COLORS[i % AV_COLORS.length] }}
                      >
                        {m.name
                          .split(" ")
                          .map((w) => w[0])
                          .slice(0, 2)
                          .join("")
                          .toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div
                          className="text-sm font-bold"
                          style={{ color: "var(--ink)" }}
                        >
                          {m.name}
                        </div>
                        <div
                          className="text-[11px]"
                          style={{ color: "var(--muted)" }}
                        >
                          {m.active_skills.length} skill
                          {m.active_skills.length !== 1 ? "s" : ""} ·{" "}
                          {m.steps_completed}/{m.steps_total} steps
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div
                          className="text-lg font-black"
                          style={{ color: AV_COLORS[i % AV_COLORS.length] }}
                        >
                          {m.completion_pct}%
                        </div>
                      </div>
                    </div>
                    <MiniBar
                      pct={m.completion_pct}
                      color={AV_COLORS[i % AV_COLORS.length]}
                    />
                    {m.active_skills.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {m.active_skills.slice(0, 4).map((s) => (
                          <span
                            key={s.skill}
                            className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                            style={{
                              background: "var(--accentLight)",
                              color: "var(--accent)",
                            }}
                          >
                            {s.skill.length > 18
                              ? s.skill.slice(0, 16) + "…"
                              : s.skill}
                          </span>
                        ))}
                        {m.active_skills.length > 4 && (
                          <span
                            className="text-[10px] px-2 py-0.5 rounded-full"
                            style={{
                              background: "var(--cardBorder)",
                              color: "var(--muted)",
                            }}
                          >
                            +{m.active_skills.length - 4}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main export ──────────────────────────────────────────────────────────────

export default function UpskillPage({
  token,
  role,
}: {
  token: string;
  role: string;
}) {
  const isManager = ["manager", "hr", "cfo", "admin"].includes(role);
  const [view, setView] = useState<"my" | "team" | "insights">("my");

  const VIEWS = [
    { id: "my", label: "My Roadmaps" },
    ...(isManager ? [{ id: "team", label: "Team Approvals" }] : []),
    { id: "insights", label: "📊 Learning Insights" },
  ] as { id: string; label: string }[];

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div
        className="flex gap-1 mb-6 p-1 rounded-xl w-fit"
        style={{ background: "var(--accentLight)" }}
      >
        {VIEWS.map((v) => (
          <button
            key={v.id}
            onClick={() => setView(v.id as typeof view)}
            className="text-xs font-semibold px-5 py-2 rounded-lg transition-all"
            style={{
              background: view === v.id ? "var(--accent)" : "transparent",
              color: view === v.id ? "white" : "var(--muted)",
            }}
          >
            {v.label}
          </button>
        ))}
      </div>
      {view === "my" && <EmployeeView token={token} />}
      {view === "team" && isManager && <ManagerView token={token} />}
      {view === "insights" && (
        <LearningInsightsView token={token} isManager={isManager} />
      )}
    </div>
  );
}
