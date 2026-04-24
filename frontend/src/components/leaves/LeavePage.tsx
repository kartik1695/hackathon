import React, { useEffect, useState, useCallback } from "react";
import ApplyLeaveForm from "./ApplyLeaveForm";
import LeaveTable from "./LeaveTable";

const BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8002/api";

interface LeavePageProps {
  token: string;
  role: string;
}

interface LeaveBalance {
  casual_remaining: number;
  privilege_remaining: number;
  sick_remaining: number;
  comp_off_remaining: number;
}

interface LeavePolicy {
  leave_type: string;
  annual_allocation: number;
  accrual_per_month: number;
  requires_balance: boolean;
  allow_backdate_days: number;
}

interface Leave {
  id: number;
  leave_type: string;
  from_date: string;
  to_date: string;
  days_count: number;
  status: string;
  reason: string;
  is_half_day?: boolean;
  employee_name?: string;
}

async function apiFetch(token: string, path: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return res.json();
}

async function apiPost(token: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

function ProgressBar({
  value,
  max,
  color = "#E8D44D",
}: {
  value: number;
  max: number;
  color?: string;
}) {
  const pct = Math.min(100, (value / Math.max(max, 1)) * 100);
  return (
    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mt-2">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

const STATUS_OPTIONS = ["ALL", "PENDING", "APPROVED", "REJECTED", "CANCELLED"];

// ── My Leaves view ───────────────────────────────────────────────────────────

function MyLeavesView({ token }: { token: string }) {
  const [tab, setTab] = useState<"active" | "history">("active");
  const [showForm, setShowForm] = useState(false);
  const [balance, setBalance] = useState<LeaveBalance | null>(null);
  const [policyMax, setPolicyMax] = useState<Record<string, number>>({});
  const [myLeaves, setMyLeaves] = useState<Leave[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    const [bal, mine, types] = await Promise.all([
      apiFetch(token, "/leaves/balance/"),
      apiFetch(token, "/leaves/"),
      apiFetch(token, "/leaves/types/"),
    ]);
    if (bal) setBalance(bal);
    if (Array.isArray(types)) {
      const maxByType: Record<string, number> = {};
      (types as LeavePolicy[]).forEach((p) => {
        maxByType[String(p.leave_type || "").toUpperCase()] = Number(
          p.annual_allocation ?? 0,
        );
      });
      setPolicyMax(maxByType);
    }
    const list = mine?.results ?? (Array.isArray(mine) ? mine : []);
    setMyLeaves(list);
    setLoading(false);
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCancel(id: number) {
    if (!confirm("Cancel this leave request?")) return;
    await fetch(`${BASE}/leaves/${id}/cancel/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    showToast("Leave cancelled");
    load();
  }

  const maxCL = policyMax.CL || 12;
  const maxPL = policyMax.PL || 18;
  const maxSL = policyMax.SL || 10;
  const maxCO = policyMax.CO || 10;

  const BALANCE_TILES = [
    {
      label: "Casual Leave",
      value: balance?.casual_remaining ?? 0,
      max: maxCL,
      color: "#E8D44D",
      dark: false,
    },
    {
      label: "Privilege Leave",
      value: balance?.privilege_remaining ?? 0,
      max: maxPL,
      color: "var(--accent)",
      dark: true,
    },
    {
      label: "Sick Leave",
      value: balance?.sick_remaining ?? 0,
      max: maxSL,
      color: "#F87171",
      dark: false,
    },
    {
      label: "Comp Off",
      value: balance?.comp_off_remaining ?? 0,
      max: maxCO,
      color: "#34D399",
      dark: false,
    },
  ];

  const active = myLeaves.filter((l) => l.status === "PENDING");
  const history = myLeaves.filter((l) =>
    ["APPROVED", "REJECTED", "CANCELLED"].includes(l.status),
  );

  return (
    <div>
      {toast && (
        <div
          className="fixed top-5 right-5 z-50 px-4 py-3 text-white text-sm font-semibold rounded-2xl shadow-2xl"
          style={{ background: "var(--navPill)" }}
        >
          {toast}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <ApplyLeaveForm
            token={token}
            onSuccess={() => {
              setShowForm(false);
              showToast("Leave applied ✓");
              load();
            }}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      <div className="flex items-center justify-between mb-5">
        <div>
          <h2
            className="text-xl"
            style={{
              color: "var(--ink)",
              fontWeight: 250,
              letterSpacing: "-0.01em",
            }}
          >
            My Leaves
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
            Your leave balance and requests
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 text-white text-sm font-semibold rounded-full transition-colors shadow-sm"
          style={{ background: "var(--accent)" }}
        >
          <span className="text-lg leading-none">+</span>
          Apply Leave
        </button>
      </div>

      {/* Balance tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {BALANCE_TILES.map((b) => (
          <div
            key={b.label}
            className="rounded-2xl p-5"
            style={{
              background: b.dark ? "var(--navPill)" : "var(--card)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              border: "1px solid var(--cardBorder)",
              boxShadow: "var(--cardShadow)",
            }}
          >
            <div
              className={`text-[10px] font-semibold uppercase tracking-wider mb-1 ${b.dark ? "text-white/40" : "text-gray-400"}`}
            >
              {b.label}
            </div>
            <div
              className={`text-4xl font-bold ${b.dark ? "text-white" : ""}`}
              style={b.dark ? undefined : { color: "var(--ink)" }}
            >
              {loading ? "—" : b.value}
            </div>
            <div
              className={`text-[10px] mt-0.5 ${b.dark ? "text-white/30" : "text-gray-400"}`}
            >
              of {b.max} days
            </div>
            <ProgressBar
              value={loading ? 0 : b.value}
              max={b.max}
              color={b.dark ? "white" : b.color}
            />
          </div>
        ))}
      </div>

      {/* Table */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: "var(--card)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid var(--cardBorder)",
          boxShadow: "var(--cardShadow)",
        }}
      >
        <div
          className="flex items-center px-5 py-4"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div
            className="flex items-center gap-1 rounded-full p-1"
            style={{ background: "var(--accentLight)" }}
          >
            {(["active", "history"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="px-4 py-1.5 rounded-full text-xs font-semibold transition-all capitalize"
                style={
                  tab === t
                    ? { background: "var(--navPill)", color: "white" }
                    : { color: "var(--muted)" }
                }
              >
                {t === "active"
                  ? `Active${active.length > 0 ? ` (${active.length})` : ""}`
                  : "History"}
              </button>
            ))}
          </div>
        </div>
        <div className="p-5">
          {tab === "active" && (
            <LeaveTable
              leaves={active}
              loading={loading}
              onCancel={handleCancel}
            />
          )}
          {tab === "history" && (
            <LeaveTable leaves={history} loading={loading} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Team Leaves view (manager) ───────────────────────────────────────────────

function TeamLeavesView({ token }: { token: string }) {
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [teamLeaves, setTeamLeaves] = useState<Leave[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    const path =
      statusFilter === "ALL"
        ? "/leaves/team/all/"
        : `/leaves/team/all/?status=${statusFilter}`;
    const data = await apiFetch(token, path);
    const list = data?.results ?? (Array.isArray(data) ? data : []);
    setTeamLeaves(list);
    setLoading(false);
  }, [token, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleApprove(id: number) {
    await apiPost(token, `/leaves/${id}/approve/`);
    showToast("Leave approved ✓");
    load();
  }

  async function handleReject(id: number) {
    const reason = prompt("Reason for rejection (optional):") ?? "";
    await apiPost(token, `/leaves/${id}/reject/`, { reason });
    showToast("Leave rejected");
    load();
  }

  const pendingCount = teamLeaves.filter((l) => l.status === "PENDING").length;

  return (
    <div>
      {toast && (
        <div
          className="fixed top-5 right-5 z-50 px-4 py-3 text-white text-sm font-semibold rounded-2xl shadow-2xl"
          style={{ background: "var(--navPill)" }}
        >
          {toast}
        </div>
      )}

      <div className="flex items-center justify-between mb-5">
        <div>
          <h2
            className="text-xl"
            style={{
              color: "var(--ink)",
              fontWeight: 250,
              letterSpacing: "-0.01em",
            }}
          >
            Team Leaves
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
            Direct reports leave requests
            {pendingCount > 0 && statusFilter !== "PENDING" && (
              <span
                className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
                style={{ background: "#F59E0B" }}
              >
                {pendingCount} pending
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Status filter tabs */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: "var(--card)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid var(--cardBorder)",
          boxShadow: "var(--cardShadow)",
        }}
      >
        <div
          className="flex items-center gap-1 px-5 py-4 overflow-x-auto"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div
            className="flex items-center gap-1 rounded-full p-1 flex-shrink-0"
            style={{ background: "var(--accentLight)" }}
          >
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className="px-4 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap"
                style={
                  statusFilter === s
                    ? { background: "var(--navPill)", color: "white" }
                    : { color: "var(--muted)" }
                }
              >
                {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="p-5">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-16 rounded-xl animate-pulse"
                  style={{ background: "var(--accentLight)" }}
                />
              ))}
            </div>
          ) : teamLeaves.length === 0 ? (
            <div className="py-16 text-center">
              <div className="text-3xl mb-3">✅</div>
              <p
                className="text-sm font-semibold"
                style={{ color: "var(--ink)" }}
              >
                No {statusFilter === "ALL" ? "" : statusFilter.toLowerCase()}{" "}
                leaves
              </p>
            </div>
          ) : (
            <LeaveTable
              leaves={teamLeaves}
              loading={false}
              isManager={statusFilter === "PENDING" || statusFilter === "ALL"}
              onApprove={handleApprove}
              onReject={handleReject}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function LeavePage({ token, role }: LeavePageProps) {
  const isManager = ["manager", "hr", "cfo", "admin"].includes(role);
  const [view, setView] = useState<"my" | "team">("my");

  return (
    <div
      className="h-full overflow-y-auto p-5"
      style={{ background: "transparent" }}
    >
      {isManager && (
        <div
          className="flex gap-1 mb-6 p-1 rounded-full w-fit"
          style={{ background: "var(--accentLight)" }}
        >
          <button
            onClick={() => setView("my")}
            className="text-xs font-semibold px-5 py-2 rounded-full transition-all"
            style={{
              background: view === "my" ? "var(--navPill)" : "transparent",
              color: view === "my" ? "white" : "var(--muted)",
            }}
          >
            My Leaves
          </button>
          <button
            onClick={() => setView("team")}
            className="text-xs font-semibold px-5 py-2 rounded-full transition-all"
            style={{
              background: view === "team" ? "var(--navPill)" : "transparent",
              color: view === "team" ? "white" : "var(--muted)",
            }}
          >
            Team Leaves
          </button>
        </div>
      )}

      {(view === "my" || !isManager) && <MyLeavesView token={token} />}
      {view === "team" && isManager && <TeamLeavesView token={token} />}
    </div>
  );
}
