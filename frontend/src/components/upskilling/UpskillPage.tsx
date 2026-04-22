import React, { useEffect, useState, useCallback } from "react";

const API = import.meta.env.VITE_API_BASE ?? "http://localhost:8002/api";

function apiGet(token: string, path: string) {
  return fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
}
function apiPost(token: string, path: string, body?: object) {
  return fetch(`${API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  }).then(r => r.json());
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
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: color + "20", color }}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function StepStatusDot({ status }: { status: string }) {
  const color = STEP_STATUS_COLOR[status] ?? "#D1D5DB";
  return <span className="w-2 h-2 rounded-full inline-block flex-shrink-0 mt-1.5" style={{ background: color }} />;
}

function ProgressBar({ total, done }: { total: number; done: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="w-full h-1.5 rounded-full bg-gray-100 overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: "var(--primary)" }} />
    </div>
  );
}

// ── Employee: single roadmap detail ─────────────────────────────────────────

function RoadmapDetail({ roadmap, token, onBack, onRefresh }: {
  roadmap: Roadmap; token: string; onBack: () => void; onRefresh: () => void;
}) {
  const [submitting, setSubmitting] = useState<number | null>(null);
  const [submitData, setSubmitData] = useState<Record<number, { notes: string; url: string }>>({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const completedSteps = roadmap.steps.filter(s => s.is_completed).length;

  async function handleSubmit(stepId: number) {
    const d = submitData[stepId] ?? { notes: "", url: "" };
    setSubmitting(stepId);
    setError("");
    try {
      const res = await apiPost(token, `/upskilling/steps/${stepId}/submit/`, d);
      if (res.error) { setError(res.error); }
      else { setSuccess("Step submitted for review!"); onRefresh(); }
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm mb-5" style={{ color: "var(--primary)" }}>
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        Back to roadmaps
      </button>

      <div className="rounded-2xl p-5 mb-5" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h2 className="text-lg font-bold" style={{ color: "var(--text-dark)" }}>{roadmap.skill_name}</h2>
            <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--text-muted)" }}>{roadmap.description}</p>
          </div>
          <StatusBadge status={roadmap.status} />
        </div>
        <div className="flex items-center gap-3">
          <ProgressBar total={roadmap.steps.length} done={completedSteps} />
          <span className="text-xs font-semibold whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
            {completedSteps}/{roadmap.steps.length}
          </span>
        </div>
        {roadmap.status === "PENDING_APPROVAL" && (
          <div className="mt-3 text-xs px-3 py-2 rounded-xl" style={{ background: "#FEF3C7", color: "#92400E" }}>
            ⏳ Awaiting manager approval before you can start
          </div>
        )}
      </div>

      {error && <div className="mb-4 px-4 py-3 rounded-xl text-sm text-red-700 bg-red-50 border border-red-100">{error}</div>}
      {success && <div className="mb-4 px-4 py-3 rounded-xl text-sm text-green-700 bg-green-50 border border-green-100">{success}</div>}

      <div className="space-y-4">
        {roadmap.steps.map((step, idx) => {
          const d = submitData[step.id] ?? { notes: "", url: "" };
          const canSubmit = step.status === "IN_PROGRESS" || step.status === "REJECTED";
          return (
            <div key={step.id} className="rounded-2xl p-5" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", opacity: step.status === "PENDING" ? 0.6 : 1 }}>
              <div className="flex items-start gap-3">
                <div className="flex flex-col items-center gap-1 flex-shrink-0 mt-0.5">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ background: step.is_completed ? "#10B981" : "var(--primary-pale)", color: step.is_completed ? "white" : "var(--primary)" }}
                  >
                    {step.is_completed ? "✓" : idx + 1}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="text-sm font-bold" style={{ color: "var(--text-dark)" }}>{step.title}</h3>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: (STEP_STATUS_COLOR[step.status] ?? "#D1D5DB") + "20", color: STEP_STATUS_COLOR[step.status] ?? "#6B7280" }}>
                      {step.status.replace(/_/g, " ")}
                    </span>
                    {step.phase && <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{step.phase}</span>}
                  </div>
                  <p className="text-xs leading-relaxed mb-2" style={{ color: "var(--text-muted)" }}>{step.description}</p>

                  <div className="flex items-center gap-3 text-[10px] mb-3" style={{ color: "var(--text-muted)" }}>
                    {step.difficulty && <span>⚡ {step.difficulty}</span>}
                    {step.duration && <span>⏱ {step.duration}h</span>}
                    {step.resource_url && (
                      <a href={step.resource_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:underline" style={{ color: "var(--primary)" }}>
                        <svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24"><path d="M12 19.5v-15m0 0l-6.75 6.75M12 4.5l6.75 6.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
                        {step.resource_type === "video" ? "Watch Video" : "Resource"}
                      </a>
                    )}
                  </div>

                  {step.feedback && (
                    <div className="mb-3 px-3 py-2 rounded-xl text-xs" style={{ background: step.status === "REJECTED" ? "#FEF2F2" : "#F0FDF4", color: step.status === "REJECTED" ? "#991B1B" : "#166534" }}>
                      {step.status === "REJECTED" ? "❌ Feedback: " : "✅ Manager: "}{step.feedback}
                    </div>
                  )}

                  {step.status === "SUBMITTED" && (
                    <div className="px-3 py-2 rounded-xl text-xs mb-3" style={{ background: "#EDE9FE", color: "#5B21B6" }}>
                      🔍 Submitted for review — waiting for manager
                    </div>
                  )}

                  {canSubmit && (
                    <div className="space-y-2 mt-2 pt-3 border-t" style={{ borderColor: "var(--card-border)" }}>
                      <textarea
                        rows={2}
                        placeholder="What did you learn? (notes)"
                        value={d.notes}
                        onChange={e => setSubmitData(prev => ({ ...prev, [step.id]: { ...d, notes: e.target.value } }))}
                        className="w-full text-xs px-3 py-2 rounded-xl resize-none focus:outline-none"
                        style={{ border: "1px solid var(--card-border)", background: "var(--page-bg)", color: "var(--text-dark)" }}
                      />
                      <input
                        type="url"
                        placeholder="Evidence link (GitHub or Dropbox URL)"
                        value={d.url}
                        onChange={e => setSubmitData(prev => ({ ...prev, [step.id]: { ...d, url: e.target.value } }))}
                        className="w-full text-xs px-3 py-2 rounded-xl focus:outline-none"
                        style={{ border: "1px solid var(--card-border)", background: "var(--page-bg)", color: "var(--text-dark)" }}
                      />
                      <button
                        onClick={() => handleSubmit(step.id)}
                        disabled={submitting === step.id || !d.url}
                        className="text-xs font-semibold px-4 py-2 rounded-xl transition-all disabled:opacity-50"
                        style={{ background: "var(--primary)", color: "white" }}
                      >
                        {submitting === step.id ? "Submitting..." : "Submit for Review"}
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

  useEffect(() => { loadRoadmaps(); }, [loadRoadmaps]);

  async function loadDetail(id: number) {
    const data = await apiGet(token, `/upskilling/roadmaps/${id}/`);
    setSelected(data);
  }

  async function handleCreate() {
    if (!skillInput.trim()) return;
    setCreating(true);
    setCreateError("");
    try {
      const res = await apiPost(token, "/upskilling/roadmaps/", { skill_name: skillInput.trim() });
      if (res.error) { setCreateError(res.error); }
      else {
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
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-bold" style={{ color: "var(--text-dark)" }}>My Upskilling Roadmaps</h2>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>AI-generated learning paths tailored to your career goals</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-xl"
          style={{ background: "var(--primary)", color: "white" }}
        >
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
          New Roadmap
        </button>
      </div>

      {showCreate && (
        <div className="mb-5 p-5 rounded-2xl" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
          <h3 className="text-sm font-bold mb-3" style={{ color: "var(--text-dark)" }}>Create AI Roadmap</h3>
          <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
            Enter a skill you want to learn — our AI will generate a structured 3-phase roadmap with curated resources.
          </p>
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="e.g. Machine Learning, React, Leadership..."
              value={skillInput}
              onChange={e => setSkillInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleCreate()}
              className="flex-1 text-sm px-4 py-2.5 rounded-xl focus:outline-none"
              style={{ border: "1px solid var(--card-border)", background: "var(--page-bg)", color: "var(--text-dark)" }}
            />
            <button
              onClick={handleCreate}
              disabled={creating || !skillInput.trim()}
              className="text-sm font-semibold px-5 py-2.5 rounded-xl disabled:opacity-50"
              style={{ background: "var(--primary)", color: "white" }}
            >
              {creating ? "Generating..." : "Generate"}
            </button>
            <button onClick={() => setShowCreate(false)} className="text-sm px-4 py-2.5 rounded-xl" style={{ background: "var(--primary-pale)", color: "var(--primary)" }}>
              Cancel
            </button>
          </div>
          {createError && <p className="mt-2 text-xs text-red-600">{createError}</p>}
          {creating && (
            <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
              🤖 AI is designing your personalized roadmap... this takes ~15 seconds.
            </p>
          )}
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-sm" style={{ color: "var(--text-muted)" }}>Loading roadmaps...</div>
      ) : roadmaps.length === 0 ? (
        <div className="text-center py-16 rounded-2xl" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
          <div className="text-4xl mb-3">🎯</div>
          <p className="text-sm font-semibold" style={{ color: "var(--text-dark)" }}>No roadmaps yet</p>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Create your first AI-powered learning roadmap above</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {roadmaps.map(r => (
            <button
              key={r.id}
              onClick={() => loadDetail(r.id)}
              className="text-left p-5 rounded-2xl transition-all hover:shadow-md"
              style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0" style={{ background: "var(--primary-pale)" }}>
                  🚀
                </div>
                <StatusBadge status={r.status} />
              </div>
              <h3 className="text-sm font-bold mb-1" style={{ color: "var(--text-dark)" }}>{r.skill_name}</h3>
              <div className="flex items-center gap-2 mt-3">
                <ProgressBar total={r.step_count ?? 0} done={r.completed_steps ?? 0} />
                <span className="text-[10px] whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                  {r.completed_steps ?? 0}/{r.step_count ?? 0}
                </span>
              </div>
              <p className="text-[10px] mt-2" style={{ color: "var(--text-muted)" }}>
                {new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
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
  const [actionState, setActionState] = useState<{ id: number; type: "roadmap" | "step"; action: "approve" | "reject" } | null>(null);
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

  useEffect(() => { loadData(); }, [loadData]);

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
      const res = action === "approve"
        ? await apiPost(token, `/upskilling/roadmaps/${id}/approve/`)
        : await apiPost(token, `/upskilling/roadmaps/${id}/reject/`, { feedback });
      if (res.error) { setActionError(res.error); }
      else {
        setActionSuccess(action === "approve" ? "Roadmap approved!" : "Roadmap rejected.");
        setActionState(null);
        setFeedback("");
        if (selected?.id === id) setSelected(null);
        await loadData();
      }
    } catch { setActionError("Action failed"); }
  }

  async function handleStepAction(stepId: number, action: "approve" | "reject") {
    setActionError("");
    if (action === "reject" && !feedback.trim()) {
      setActionError("Feedback required for rejection");
      return;
    }
    try {
      const res = action === "approve"
        ? await apiPost(token, `/upskilling/steps/${stepId}/approve/`, { feedback: feedback || "Excellent work!" })
        : await apiPost(token, `/upskilling/steps/${stepId}/reject/`, { feedback });
      if (res.error) { setActionError(res.error); }
      else {
        setActionSuccess(action === "approve" ? "Step approved!" : "Step rejected with feedback.");
        setActionState(null);
        setFeedback("");
        if (selected) await loadDetail(selected.id);
        await loadData();
      }
    } catch { setActionError("Action failed"); }
  }

  if (selected) {
    const submittedSteps = selected.steps.filter(s => s.status === "SUBMITTED");
    return (
      <div>
        <button onClick={() => setSelected(null)} className="flex items-center gap-1.5 text-sm mb-5" style={{ color: "var(--primary)" }}>
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Back
        </button>

        <div className="rounded-2xl p-5 mb-5" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
          <div className="flex items-start justify-between gap-3 mb-2">
            <div>
              <h2 className="text-lg font-bold" style={{ color: "var(--text-dark)" }}>{selected.skill_name}</h2>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Employee: <strong>{selected.employee_name}</strong></p>
            </div>
            <StatusBadge status={selected.status} />
          </div>
          <p className="text-xs leading-relaxed mb-3" style={{ color: "var(--text-muted)" }}>{selected.description}</p>
          <ProgressBar total={selected.steps.length} done={selected.steps.filter(s => s.is_completed).length} />

          {selected.status === "PENDING_APPROVAL" && (
            <div className="flex gap-3 mt-4">
              {actionState?.id === selected.id && actionState.type === "roadmap" && actionState.action === "reject" ? (
                <div className="flex-1 space-y-2">
                  <textarea
                    rows={2} placeholder="Rejection reason..."
                    value={feedback}
                    onChange={e => setFeedback(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-xl resize-none focus:outline-none"
                    style={{ border: "1px solid var(--card-border)", background: "var(--page-bg)", color: "var(--text-dark)" }}
                  />
                  <div className="flex gap-2">
                    <button onClick={() => handleRoadmapAction(selected.id, "reject")} className="text-xs font-semibold px-4 py-2 rounded-xl bg-red-500 text-white">Confirm Reject</button>
                    <button onClick={() => { setActionState(null); setFeedback(""); }} className="text-xs px-4 py-2 rounded-xl" style={{ background: "var(--primary-pale)", color: "var(--primary)" }}>Cancel</button>
                  </div>
                  {actionError && <p className="text-xs text-red-600">{actionError}</p>}
                </div>
              ) : (
                <>
                  <button onClick={() => handleRoadmapAction(selected.id, "approve")} className="text-sm font-semibold px-5 py-2 rounded-xl" style={{ background: "var(--primary)", color: "white" }}>
                    ✓ Approve Roadmap
                  </button>
                  <button onClick={() => setActionState({ id: selected.id, type: "roadmap", action: "reject" })} className="text-sm font-semibold px-5 py-2 rounded-xl bg-red-100 text-red-700">
                    ✗ Reject
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {actionSuccess && <div className="mb-4 px-4 py-3 rounded-xl text-sm text-green-700 bg-green-50 border border-green-100">{actionSuccess}</div>}

        {submittedSteps.length > 0 && (
          <div className="mb-5 p-5 rounded-2xl" style={{ background: "#EDE9FE22", border: "1px solid #DDD6FE" }}>
            <h3 className="text-sm font-bold mb-3" style={{ color: "#5B21B6" }}>🔍 Pending Step Reviews ({submittedSteps.length})</h3>
            <div className="space-y-3">
              {submittedSteps.map(step => (
                <div key={step.id} className="p-4 rounded-xl" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4 className="text-sm font-semibold" style={{ color: "var(--text-dark)" }}>Step {step.order}: {step.title}</h4>
                      {step.submission_notes && <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Notes: {step.submission_notes}</p>}
                      {step.submission_url && (
                        <a href={step.submission_url} target="_blank" rel="noopener noreferrer" className="text-xs mt-1 flex items-center gap-1 hover:underline" style={{ color: "var(--primary)" }}>
                          🔗 View Evidence
                        </a>
                      )}
                    </div>
                  </div>
                  {actionState?.id === step.id && actionState.type === "step" ? (
                    <div className="space-y-2 mt-2">
                      <textarea
                        rows={2}
                        placeholder={actionState.action === "approve" ? "Feedback (optional)..." : "Rejection reason (required)..."}
                        value={feedback}
                        onChange={e => setFeedback(e.target.value)}
                        className="w-full text-xs px-3 py-2 rounded-xl resize-none focus:outline-none"
                        style={{ border: "1px solid var(--card-border)", background: "var(--page-bg)", color: "var(--text-dark)" }}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleStepAction(step.id, actionState.action)}
                          className={`text-xs font-semibold px-4 py-2 rounded-xl text-white ${actionState.action === "approve" ? "" : "bg-red-500"}`}
                          style={actionState.action === "approve" ? { background: "var(--primary)" } : undefined}
                        >
                          Confirm {actionState.action === "approve" ? "Approve" : "Reject"}
                        </button>
                        <button onClick={() => { setActionState(null); setFeedback(""); }} className="text-xs px-4 py-2 rounded-xl" style={{ background: "var(--primary-pale)", color: "var(--primary)" }}>Cancel</button>
                      </div>
                      {actionError && <p className="text-xs text-red-600">{actionError}</p>}
                    </div>
                  ) : (
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => { setActionState({ id: step.id, type: "step", action: "approve" }); setFeedback(""); }} className="text-xs font-semibold px-3 py-1.5 rounded-xl" style={{ background: "var(--primary)", color: "white" }}>✓ Approve</button>
                      <button onClick={() => { setActionState({ id: step.id, type: "step", action: "reject" }); setFeedback(""); }} className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-red-100 text-red-700">✗ Reject</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <h3 className="text-sm font-bold mb-3" style={{ color: "var(--text-dark)" }}>All Steps</h3>
        <div className="space-y-3">
          {selected.steps.map((step, idx) => (
            <div key={step.id} className="flex gap-3 p-4 rounded-2xl" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0" style={{ background: "var(--primary-pale)", color: "var(--primary)" }}>{idx + 1}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold" style={{ color: "var(--text-dark)" }}>{step.title}</span>
                  <StepStatusDot status={step.status} />
                  <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{step.status.replace(/_/g, " ")}</span>
                </div>
                {step.feedback && step.status !== "SUBMITTED" && (
                  <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Feedback: {step.feedback}</p>
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
        <h2 className="text-xl font-bold" style={{ color: "var(--text-dark)" }}>Upskilling — Manager View</h2>
        <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Review and approve roadmaps and milestones from your direct reports</p>
      </div>

      {actionSuccess && <div className="mb-4 px-4 py-3 rounded-xl text-sm text-green-700 bg-green-50 border border-green-100">{actionSuccess}</div>}

      <div className="flex gap-1 mb-5 p-1 rounded-xl" style={{ background: "var(--primary-pale)" }}>
        {(["pending", "team"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className="flex-1 text-xs font-semibold py-2 rounded-lg transition-all"
            style={{ background: tab === t ? "var(--primary)" : "transparent", color: tab === t ? "white" : "var(--text-muted)" }}>
            {t === "pending" ? `Pending Approvals${pending.length > 0 ? ` (${pending.length})` : ""}` : "Team Roadmaps"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16 text-sm" style={{ color: "var(--text-muted)" }}>Loading...</div>
      ) : tab === "pending" ? (
        pending.length === 0 ? (
          <div className="text-center py-16 rounded-2xl" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
            <div className="text-4xl mb-3">✅</div>
            <p className="text-sm font-semibold" style={{ color: "var(--text-dark)" }}>All caught up</p>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>No pending roadmap approvals</p>
          </div>
        ) : (
          <div className="space-y-4">
            {pending.map(r => (
              <div key={r.id} className="p-5 rounded-2xl" style={{ background: "var(--card-bg)", border: "2px solid #FCD34D" }}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <h3 className="text-sm font-bold" style={{ color: "var(--text-dark)" }}>{r.skill_name}</h3>
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>Requested by <strong>{r.employee_name}</strong> · {r.step_count} milestones</p>
                    <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
                      {new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
                <div className="flex gap-3 mt-3">
                  <button onClick={() => loadDetail(r.id)} className="text-xs px-4 py-2 rounded-xl" style={{ background: "var(--primary-pale)", color: "var(--primary)", fontWeight: 600 }}>
                    View Details
                  </button>
                  <button onClick={async () => { await handleRoadmapAction(r.id, "approve"); }} className="text-xs font-semibold px-4 py-2 rounded-xl" style={{ background: "var(--primary)", color: "white" }}>
                    ✓ Quick Approve
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        team.length === 0 ? (
          <div className="text-center py-16 rounded-2xl" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
            <div className="text-4xl mb-3">📚</div>
            <p className="text-sm font-semibold" style={{ color: "var(--text-dark)" }}>No team roadmaps</p>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Your direct reports haven't created any roadmaps yet</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {team.map(r => (
              <button key={r.id} onClick={() => loadDetail(r.id)} className="text-left p-5 rounded-2xl transition-all hover:shadow-md"
                style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-sm font-bold" style={{ color: "var(--text-dark)" }}>{r.skill_name}</h3>
                  <StatusBadge status={r.status} />
                </div>
                <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>{r.employee_name}</p>
                <div className="flex items-center gap-2">
                  <ProgressBar total={r.step_count ?? 0} done={r.completed_steps ?? 0} />
                  <span className="text-[10px] whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                    {r.completed_steps ?? 0}/{r.step_count ?? 0}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )
      )}
    </div>
  );
}

// ── Main export ──────────────────────────────────────────────────────────────

export default function UpskillPage({ token, role }: { token: string; role: string }) {
  const isManager = ["manager", "hr", "cfo", "admin"].includes(role);
  const [view, setView] = useState<"my" | "team">("my");

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {isManager && (
        <div className="flex gap-1 mb-6 p-1 rounded-xl w-fit" style={{ background: "var(--primary-pale)" }}>
          <button
            onClick={() => setView("my")}
            className="text-xs font-semibold px-5 py-2 rounded-lg transition-all"
            style={{ background: view === "my" ? "var(--primary)" : "transparent", color: view === "my" ? "white" : "var(--text-muted)" }}
          >
            My Roadmaps
          </button>
          <button
            onClick={() => setView("team")}
            className="text-xs font-semibold px-5 py-2 rounded-lg transition-all"
            style={{ background: view === "team" ? "var(--primary)" : "transparent", color: view === "team" ? "white" : "var(--text-muted)" }}
          >
            Team Approvals
          </button>
        </div>
      )}
      {(view === "my" || !isManager) && <EmployeeView token={token} />}
      {view === "team" && isManager && <ManagerView token={token} />}
    </div>
  );
}
