import { useEffect, useState, useCallback, useMemo } from "react";
import RegularizationForm from "./RegularizationForm";
import WFHForm from "./WFHForm";

const BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8002/api";

const darkTeal = "var(--navPill)";
const teal = "var(--accent)";
const tealPale = "var(--accentLight)";
const pageBg = "transparent";
const textMuted = "var(--muted)";
const cardBorder = "var(--cardBorder)";

interface AttendancePageProps {
  token: string;
  role: string;
}

interface WeekDay {
  date: string;
  weekday: string;
  weekday_short: string;
  status: string;
  check_in: string | null;
  check_out: string | null;
  hours: number;
  is_leave: boolean;
  is_today: boolean;
  is_future: boolean;
}

interface Regularization {
  id: number;
  date: string;
  status: string;
  requested_check_in: string | null;
  requested_check_out: string | null;
  reason: string;
  employee_name?: string;
  created_at?: string;
}

interface WFHRequest {
  id: number;
  dates: string[];
  status: string;
  reason: string;
  employee_name?: string;
  created_at?: string;
}

interface Penalty {
  id: number;
  date: string;
  penalty_type: string;
  days_deducted: number;
  status: string;
  reason: string;
  payroll_locked?: boolean;
}

interface TodayLog {
  id: number;
  date: string;
  status: string;
  check_in: string | null;
  check_out: string | null;
}

type Tab = "week" | "regularization" | "wfh" | "penalties";
type Modal = "reg" | "wfh" | null;

const STATUS_STYLE: Record<
  string,
  { bg: string; text: string; label: string; dot: string }
> = {
  PRESENT: { bg: "#D1FAE5", text: "#065F46", label: "Present", dot: "#10B981" },
  ABSENT: { bg: "#FEE2E2", text: "#991B1B", label: "Absent", dot: "#EF4444" },
  WFH: { bg: "#DBEAFE", text: "#1E40AF", label: "WFH", dot: "#3B82F6" },
  ON_LEAVE: {
    bg: "#EDE9FE",
    text: "#5B21B6",
    label: "On Leave",
    dot: "#8B5CF6",
  },
  REGULARIZED: {
    bg: tealPale,
    text: "#0F766E",
    label: "Regularized",
    dot: teal,
  },
  WFH_PENDING: {
    bg: "#FEF3C7",
    text: "#92400E",
    label: "WFH Pending",
    dot: "#F59E0B",
  },
  HALF_DAY: {
    bg: "#FFEDD5",
    text: "#9A3412",
    label: "Half Day",
    dot: "#F97316",
  },
};

function StatusBadge({ status, small }: { status: string; small?: boolean }) {
  const s = STATUS_STYLE[status] || {
    bg: "#F3F4F6",
    text: "#6B7280",
    label: status,
    dot: "#9CA3AF",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 font-semibold rounded-full ${small ? "text-[9px] px-1.5 py-0.5" : "text-[10px] px-2 py-0.5"}`}
      style={{ background: s.bg, color: s.text }}
    >
      <span
        className="w-1 h-1 rounded-full flex-shrink-0"
        style={{ background: s.dot }}
      />
      {s.label}
    </span>
  );
}

function fmt(t: string | null): string {
  if (!t) return "—";
  try {
    return new Date(`1970-01-01T${t}`).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return t;
  }
}

async function apiFetch(token: string, path: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const text = await res.text();
  if (!text) return null;
  return JSON.parse(text);
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
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl ${className}`}
      style={{
        background: "var(--card)",
        border: `1px solid ${cardBorder}`,
      }}
    >
      {children}
    </div>
  );
}

export default function AttendancePage({ token, role }: AttendancePageProps) {
  const isManager = ["manager", "hr", "cfo", "admin"].includes(role);
  const [tab, setTab] = useState<Tab>("week");
  const [week, setWeek] = useState<WeekDay[]>([]);
  const [today, setToday] = useState<TodayLog | null>(null);
  const [regularizations, setRegularizations] = useState<Regularization[]>([]);
  const [wfhRequests, setWfhRequests] = useState<WFHRequest[]>([]);
  const [penalties, setPenalties] = useState<Penalty[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // Filters
  const [regFromDate, setRegFromDate] = useState("");
  const [regToDate, setRegToDate] = useState("");
  const [regName, setRegName] = useState("");
  const [wfhFromDate, setWfhFromDate] = useState("");
  const [wfhToDate, setWfhToDate] = useState("");
  const [wfhName, setWfhName] = useState("");

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    const [todayData, weekData, regsData, wfhData, penData] = await Promise.all(
      [
        apiFetch(token, "/attendance/today/"),
        apiFetch(token, "/attendance/week/"),
        apiFetch(token, "/attendance/regularization/"),
        apiFetch(token, "/attendance/wfh/"),
        apiFetch(token, "/attendance/penalties/"),
      ],
    );
    const toArr = (d: unknown) =>
      Array.isArray(d) ? d : ((d as { results?: unknown[] })?.results ?? []);
    setToday(todayData);
    setWeek(Array.isArray(weekData) ? weekData : []);
    setRegularizations(toArr(regsData) as Regularization[]);
    setWfhRequests(toArr(wfhData) as WFHRequest[]);
    setPenalties(toArr(penData) as Penalty[]);
    setLoading(false);
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleApproveReg(id: number) {
    await apiPost(token, `/attendance/regularization/${id}/approve/`);
    showToast("Regularization approved");
    load();
  }
  async function handleRejectReg(id: number) {
    const reason = prompt("Rejection reason:") ?? "";
    await apiPost(token, `/attendance/regularization/${id}/reject/`, {
      reason,
    });
    showToast("Regularization rejected", false);
    load();
  }
  async function handleApproveWFH(id: number) {
    await apiPost(token, `/attendance/wfh/${id}/approve/`);
    showToast("WFH approved");
    load();
  }
  async function handleRejectWFH(id: number) {
    await apiPost(token, `/attendance/wfh/${id}/reject/`, {
      reason: "Not approved",
    });
    showToast("WFH rejected", false);
    load();
  }

  const filteredRegs = useMemo(
    () =>
      regularizations.filter((r) => {
        if (regFromDate && r.date < regFromDate) return false;
        if (regToDate && r.date > regToDate) return false;
        if (
          regName &&
          !(r.employee_name ?? "").toLowerCase().includes(regName.toLowerCase())
        )
          return false;
        return true;
      }),
    [regularizations, regFromDate, regToDate, regName],
  );

  const filteredWFH = useMemo(
    () =>
      wfhRequests.filter((w) => {
        const firstDate = Array.isArray(w.dates) ? w.dates[0] : String(w.dates);
        if (wfhFromDate && firstDate < wfhFromDate) return false;
        if (wfhToDate && firstDate > wfhToDate) return false;
        if (
          wfhName &&
          !(w.employee_name ?? "").toLowerCase().includes(wfhName.toLowerCase())
        )
          return false;
        return true;
      }),
    [wfhRequests, wfhFromDate, wfhToDate, wfhName],
  );

  function exportRegCSV() {
    const headers = isManager
      ? ["Employee", "Date", "Checkout", "Status", "Reason"]
      : ["Date", "Checkout", "Status", "Reason"];
    const rows = filteredRegs.map((r) =>
      isManager
        ? [
            r.employee_name ?? "",
            r.date,
            r.requested_check_out ?? "",
            r.status,
            `"${(r.reason ?? "").replace(/"/g, '""')}"`,
          ]
        : [
            r.date,
            r.requested_check_out ?? "",
            r.status,
            `"${(r.reason ?? "").replace(/"/g, '""')}"`,
          ],
    );
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "regularizations.csv";
    a.click();
  }

  function exportWFHCSV() {
    const headers = isManager
      ? ["Employee", "Dates", "Status", "Reason"]
      : ["Dates", "Status", "Reason"];
    const rows = filteredWFH.map((w) => {
      const dates = Array.isArray(w.dates)
        ? w.dates.join(";")
        : String(w.dates);
      return isManager
        ? [
            w.employee_name ?? "",
            dates,
            w.status,
            `"${(w.reason ?? "").replace(/"/g, '""')}"`,
          ]
        : [dates, w.status, `"${(w.reason ?? "").replace(/"/g, '""')}"`];
    });
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "wfh_requests.csv";
    a.click();
  }

  const todayStr = new Date().toISOString().split("T")[0];
  const todayWeek = week.find((w) => w.is_today);
  const presentDays = week.filter(
    (w) =>
      w.status === "PRESENT" ||
      w.status === "WFH" ||
      w.status === "REGULARIZED",
  ).length;
  const totalHours = week.reduce((s, d) => s + (d.hours || 0), 0);
  const pendingRegs = regularizations.filter(
    (r) => r.status === "PENDING",
  ).length;
  const pendingWFH = wfhRequests.filter((w) => w.status === "PENDING").length;
  const activeTabStyle = { background: darkTeal, color: "#FFFFFF" };
  const inactiveTabStyle = { color: textMuted, background: "transparent" };

  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: "week", label: "This Week" },
    { id: "regularization", label: "Regularizations", count: pendingRegs },
    { id: "wfh", label: "WFH Requests", count: pendingWFH },
    {
      id: "penalties",
      label: "Penalties",
      count: penalties.filter((p) => p.status === "ACTIVE").length || undefined,
    },
  ];

  return (
    <div className="h-full overflow-y-auto" style={{ background: pageBg }}>
      {/* Toast */}
      {toast && (
        <div
          className="fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-semibold shadow-xl"
          style={{
            background: toast.ok ? darkTeal : "#DC2626",
            color: "white",
          }}
        >
          {toast.ok ? "✓" : "✗"} {toast.msg}
        </div>
      )}

      {/* Modals */}
      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{
            background: "rgba(13,61,54,0.2)",
            backdropFilter: "blur(4px)",
          }}
        >
          {modal === "reg" && (
            <RegularizationForm
              token={token}
              onSuccess={() => {
                setModal(null);
                showToast("Regularization submitted");
                load();
              }}
              onCancel={() => setModal(null)}
            />
          )}
          {modal === "wfh" && (
            <WFHForm
              token={token}
              onSuccess={() => {
                setModal(null);
                showToast("WFH request submitted");
                load();
              }}
              onCancel={() => setModal(null)}
            />
          )}
        </div>
      )}

      <div className="p-6 max-w-5xl mx-auto space-y-5">
        {/* Page header */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold" style={{ color: darkTeal }}>
              Attendance
            </h2>
            <p className="text-xs mt-0.5" style={{ color: textMuted }}>
              {new Date().toLocaleDateString("en-IN", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setModal("wfh")}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-all hover:opacity-90"
              style={{
                border: `1px solid ${teal}`,
                color: teal,
                background: "white",
              }}
            >
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24">
                <path
                  d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
                <polyline
                  points="9,22 9,12 15,12 15,22"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
              </svg>
              Apply WFH
            </button>
            <button
              onClick={() => setModal("reg")}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold text-white transition-all hover:opacity-90"
              style={{ background: darkTeal }}
            >
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24">
                <path
                  d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <path
                  d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
              Regularize
            </button>
          </div>
        </div>

        {/* Stat chips row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Today */}
          <Card className="col-span-2 p-4">
            <div className="flex items-start justify-between">
              <div>
                <div
                  className="text-[10px] font-semibold uppercase tracking-wider mb-1.5"
                  style={{ color: textMuted }}
                >
                  Today · {todayStr}
                </div>
                {today ? (
                  <>
                    <StatusBadge status={today.status} />
                    <div className="flex gap-4 mt-2">
                      {today.check_in && (
                        <div className="text-xs" style={{ color: textMuted }}>
                          <span
                            className="font-semibold"
                            style={{ color: darkTeal }}
                          >
                            In
                          </span>{" "}
                          {fmt(today.check_in)}
                        </div>
                      )}
                      {today.check_out && (
                        <div className="text-xs" style={{ color: textMuted }}>
                          <span
                            className="font-semibold"
                            style={{ color: darkTeal }}
                          >
                            Out
                          </span>{" "}
                          {fmt(today.check_out)}
                        </div>
                      )}
                      {today.check_in && !today.check_out && (
                        <div
                          className="text-xs font-semibold"
                          style={{ color: teal }}
                        >
                          Still checked in
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-sm mt-1" style={{ color: textMuted }}>
                    No log yet today
                  </div>
                )}
              </div>
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: tealPale }}
              >
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24">
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    stroke={teal}
                    strokeWidth="1.8"
                  />
                  <polyline
                    points="12,6 12,12 16,14"
                    stroke={teal}
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div
              className="text-[10px] font-semibold uppercase tracking-wider mb-1"
              style={{ color: textMuted }}
            >
              Days Present
            </div>
            <div className="text-3xl font-bold" style={{ color: darkTeal }}>
              {presentDays}
            </div>
            <div className="text-[10px] mt-0.5" style={{ color: textMuted }}>
              this week
            </div>
          </Card>

          <Card className="p-4">
            <div
              className="text-[10px] font-semibold uppercase tracking-wider mb-1"
              style={{ color: textMuted }}
            >
              Hours Logged
            </div>
            <div className="text-3xl font-bold" style={{ color: darkTeal }}>
              {totalHours.toFixed(1)}
            </div>
            <div className="text-[10px] mt-0.5" style={{ color: textMuted }}>
              this week
            </div>
          </Card>
        </div>

        {/* Main card with tabs */}
        <Card>
          {/* Tab bar */}
          <div
            className="flex items-center gap-0.5 px-4 pt-3 pb-0"
            style={{ borderBottom: `1px solid ${cardBorder}` }}
          >
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-t-lg text-xs font-semibold transition-all relative"
                style={
                  tab === t.id
                    ? {
                        color: darkTeal,
                        borderBottom: `2px solid ${darkTeal}`,
                        background: "transparent",
                      }
                    : {
                        color: textMuted,
                        borderBottom: "2px solid transparent",
                        background: "transparent",
                      }
                }
              >
                {t.label}
                {t.count != null && t.count > 0 && (
                  <span
                    className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{ background: teal, color: "white" }}
                  >
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="p-5">
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="h-10 rounded-xl animate-pulse"
                    style={{ background: "var(--accentLight)" }}
                  />
                ))}
              </div>
            ) : (
              <>
                {/* Week view */}
                {tab === "week" && (
                  <div className="space-y-0">
                    {week.length === 0 && (
                      <div
                        className="py-10 text-center text-sm"
                        style={{ color: textMuted }}
                      >
                        No week data available
                      </div>
                    )}
                    {week.map((day, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-3 py-3 px-2 rounded-xl transition-colors"
                        style={{
                          background: day.is_today
                            ? "var(--accentLight)"
                            : "transparent",
                          borderBottom:
                            idx < week.length - 1
                              ? `1px solid var(--accentLight)`
                              : "none",
                        }}
                      >
                        {/* Day indicator */}
                        <div className="w-10 flex-shrink-0">
                          <div
                            className="text-[10px] font-semibold uppercase"
                            style={{ color: day.is_today ? teal : textMuted }}
                          >
                            {day.weekday_short}
                          </div>
                          <div
                            className="text-xs font-bold mt-0.5"
                            style={{
                              color: day.is_today ? darkTeal : "#374151",
                            }}
                          >
                            {new Date(day.date).getDate()}
                          </div>
                        </div>

                        {/* Status bar */}
                        <div className="flex-1">
                          {day.is_future ? (
                            <div
                              className="text-xs"
                              style={{ color: "#D1D5DB" }}
                            >
                              —
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <StatusBadge status={day.status} small />
                              {day.status === "ABSENT" && !day.is_future && (
                                <button
                                  onClick={() => setModal("reg")}
                                  className="text-[9px] font-semibold px-2 py-0.5 rounded-full transition-all hover:opacity-80"
                                  style={{
                                    border: `1px solid ${teal}`,
                                    color: teal,
                                    background: "transparent",
                                  }}
                                >
                                  Regularize
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Times */}
                        <div
                          className="flex items-center gap-3 text-[11px]"
                          style={{ color: textMuted }}
                        >
                          {day.check_in && (
                            <>
                              <span>
                                <span
                                  className="font-semibold"
                                  style={{ color: darkTeal }}
                                >
                                  In
                                </span>{" "}
                                {fmt(day.check_in)}
                              </span>
                              {day.check_out ? (
                                <span>
                                  <span
                                    className="font-semibold"
                                    style={{ color: darkTeal }}
                                  >
                                    Out
                                  </span>{" "}
                                  {fmt(day.check_out)}
                                </span>
                              ) : day.is_today ? (
                                <span
                                  className="font-semibold"
                                  style={{ color: teal }}
                                >
                                  Active
                                </span>
                              ) : null}
                            </>
                          )}
                        </div>

                        {/* Hours */}
                        <div
                          className="w-12 text-right text-xs font-mono font-semibold"
                          style={{
                            color: day.hours > 0 ? darkTeal : "#D1D5DB",
                          }}
                        >
                          {day.hours > 0 ? `${day.hours.toFixed(1)}h` : "—"}
                        </div>

                        {/* Today highlight */}
                        {day.is_today && (
                          <div
                            className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                            style={{ background: tealPale, color: darkTeal }}
                          >
                            TODAY
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Regularizations */}
                {tab === "regularization" && (
                  <div>
                    {/* Filter bar */}
                    <div className="flex flex-wrap items-center gap-2 mb-4">
                      <input
                        type="date"
                        value={regFromDate}
                        onChange={(e) => setRegFromDate(e.target.value)}
                        className="text-xs px-3 py-2 rounded-xl border outline-none"
                        style={{
                          borderColor: "var(--cardBorder)",
                          background: "var(--card)",
                          color: "var(--ink)",
                        }}
                        title="From date"
                      />
                      <input
                        type="date"
                        value={regToDate}
                        onChange={(e) => setRegToDate(e.target.value)}
                        className="text-xs px-3 py-2 rounded-xl border outline-none"
                        style={{
                          borderColor: "var(--cardBorder)",
                          background: "var(--card)",
                          color: "var(--ink)",
                        }}
                        title="To date"
                      />
                      {isManager && (
                        <input
                          type="text"
                          value={regName}
                          onChange={(e) => setRegName(e.target.value)}
                          placeholder="Search name…"
                          className="text-xs px-3 py-2 rounded-xl border outline-none"
                          style={{
                            borderColor: "var(--cardBorder)",
                            background: "var(--card)",
                            color: "var(--ink)",
                          }}
                        />
                      )}
                      {(regFromDate || regToDate || regName) && (
                        <button
                          onClick={() => {
                            setRegFromDate("");
                            setRegToDate("");
                            setRegName("");
                          }}
                          className="text-xs px-3 py-2 rounded-xl font-semibold"
                          style={{
                            background: "var(--accentLight)",
                            color: "var(--accent)",
                          }}
                        >
                          Clear
                        </button>
                      )}
                      <div className="flex-1" />
                      <button
                        onClick={exportRegCSV}
                        disabled={filteredRegs.length === 0}
                        className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl font-semibold disabled:opacity-40"
                        style={{ background: darkTeal, color: "white" }}
                      >
                        <svg
                          className="w-3.5 h-3.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                          />
                        </svg>
                        Export CSV{" "}
                        {filteredRegs.length !== regularizations.length &&
                          `(${filteredRegs.length})`}
                      </button>
                    </div>
                    {filteredRegs.length === 0 ? (
                      <div className="py-10 text-center">
                        <div
                          className="text-sm mb-1"
                          style={{ color: textMuted }}
                        >
                          No regularization requests
                        </div>
                        <button
                          onClick={() => setModal("reg")}
                          className="text-xs font-semibold"
                          style={{ color: teal }}
                        >
                          Submit one now →
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-0">
                        {filteredRegs.map((r, idx) => (
                          <div
                            key={r.id}
                            className="flex items-center gap-3 py-3 px-2 rounded-xl transition-colors group hover:bg-[var(--accentLight)]"
                            style={{
                              borderBottom:
                                idx < filteredRegs.length - 1
                                  ? `1px solid var(--accentLight)`
                                  : "none",
                            }}
                          >
                            <div className="flex-1 min-w-0">
                              {isManager && r.employee_name && (
                                <div
                                  className="text-xs font-bold mb-0.5"
                                  style={{ color: darkTeal }}
                                >
                                  {r.employee_name}
                                </div>
                              )}
                              <div
                                className="text-sm font-semibold"
                                style={{ color: darkTeal }}
                              >
                                {r.date}
                              </div>
                              <div
                                className="text-xs mt-0.5 truncate"
                                style={{ color: textMuted }}
                              >
                                {r.reason}
                              </div>
                            </div>
                            {r.requested_check_out && (
                              <div
                                className="text-[11px] font-mono"
                                style={{ color: textMuted }}
                              >
                                Out: {r.requested_check_out}
                              </div>
                            )}
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full`}
                              style={
                                r.status === "PENDING"
                                  ? { background: "#FEF3C7", color: "#92400E" }
                                  : r.status === "APPROVED"
                                    ? {
                                        background: "#D1FAE5",
                                        color: "#065F46",
                                      }
                                    : {
                                        background: "#FEE2E2",
                                        color: "#991B1B",
                                      }
                              }
                            >
                              {r.status}
                            </span>
                            {isManager && r.status === "PENDING" && (
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => handleApproveReg(r.id)}
                                  className="px-3 py-1 rounded-full text-[10px] font-semibold text-white transition-all"
                                  style={{ background: darkTeal }}
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => handleRejectReg(r.id)}
                                  className="px-3 py-1 rounded-full text-[10px] font-semibold text-white transition-all"
                                  style={{ background: "#DC2626" }}
                                >
                                  Reject
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* WFH Requests */}
                {tab === "wfh" && (
                  <div>
                    {/* Filter bar */}
                    <div className="flex flex-wrap items-center gap-2 mb-4">
                      <input
                        type="date"
                        value={wfhFromDate}
                        onChange={(e) => setWfhFromDate(e.target.value)}
                        className="text-xs px-3 py-2 rounded-xl border outline-none"
                        style={{
                          borderColor: "var(--cardBorder)",
                          background: "var(--card)",
                          color: "var(--ink)",
                        }}
                        title="From date"
                      />
                      <input
                        type="date"
                        value={wfhToDate}
                        onChange={(e) => setWfhToDate(e.target.value)}
                        className="text-xs px-3 py-2 rounded-xl border outline-none"
                        style={{
                          borderColor: "var(--cardBorder)",
                          background: "var(--card)",
                          color: "var(--ink)",
                        }}
                        title="To date"
                      />
                      {isManager && (
                        <input
                          type="text"
                          value={wfhName}
                          onChange={(e) => setWfhName(e.target.value)}
                          placeholder="Search name…"
                          className="text-xs px-3 py-2 rounded-xl border outline-none"
                          style={{
                            borderColor: "var(--cardBorder)",
                            background: "var(--card)",
                            color: "var(--ink)",
                          }}
                        />
                      )}
                      {(wfhFromDate || wfhToDate || wfhName) && (
                        <button
                          onClick={() => {
                            setWfhFromDate("");
                            setWfhToDate("");
                            setWfhName("");
                          }}
                          className="text-xs px-3 py-2 rounded-xl font-semibold"
                          style={{
                            background: "var(--accentLight)",
                            color: "var(--accent)",
                          }}
                        >
                          Clear
                        </button>
                      )}
                      <div className="flex-1" />
                      <button
                        onClick={exportWFHCSV}
                        disabled={filteredWFH.length === 0}
                        className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl font-semibold disabled:opacity-40"
                        style={{ background: darkTeal, color: "white" }}
                      >
                        <svg
                          className="w-3.5 h-3.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                          />
                        </svg>
                        Export CSV{" "}
                        {filteredWFH.length !== wfhRequests.length &&
                          `(${filteredWFH.length})`}
                      </button>
                    </div>
                    {filteredWFH.length === 0 ? (
                      <div className="py-10 text-center">
                        <div
                          className="text-sm mb-1"
                          style={{ color: textMuted }}
                        >
                          No WFH requests
                        </div>
                        <button
                          onClick={() => setModal("wfh")}
                          className="text-xs font-semibold"
                          style={{ color: teal }}
                        >
                          Apply for WFH →
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-0">
                        {filteredWFH.map((w, idx) => (
                          <div
                            key={w.id}
                            className="flex items-center gap-3 py-3 px-2 rounded-xl transition-colors group hover:bg-[var(--accentLight)]"
                            style={{
                              borderBottom:
                                idx < filteredWFH.length - 1
                                  ? `1px solid var(--accentLight)`
                                  : "none",
                            }}
                          >
                            <div
                              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                              style={{ background: "#DBEAFE" }}
                            >
                              <svg
                                width="13"
                                height="13"
                                fill="none"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"
                                  stroke="#1E40AF"
                                  strokeWidth="1.8"
                                />
                              </svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              {isManager && w.employee_name && (
                                <div
                                  className="text-xs font-bold mb-0.5"
                                  style={{ color: darkTeal }}
                                >
                                  {w.employee_name}
                                </div>
                              )}
                              <div
                                className="text-sm font-semibold"
                                style={{ color: darkTeal }}
                              >
                                {Array.isArray(w.dates)
                                  ? w.dates.length === 1
                                    ? w.dates[0]
                                    : `${w.dates[0]} – ${w.dates[w.dates.length - 1]} (${w.dates.length}d)`
                                  : w.dates}
                              </div>
                              <div
                                className="text-xs mt-0.5 truncate"
                                style={{ color: textMuted }}
                              >
                                {w.reason}
                              </div>
                            </div>
                            <span
                              className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                              style={
                                w.status === "PENDING"
                                  ? { background: "#FEF3C7", color: "#92400E" }
                                  : w.status === "APPROVED"
                                    ? {
                                        background: "#DBEAFE",
                                        color: "#1E40AF",
                                      }
                                    : {
                                        background: "#FEE2E2",
                                        color: "#991B1B",
                                      }
                              }
                            >
                              {w.status}
                            </span>
                            {isManager && w.status === "PENDING" && (
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => handleApproveWFH(w.id)}
                                  className="px-3 py-1 rounded-full text-[10px] font-semibold text-white"
                                  style={{ background: "#1E40AF" }}
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => handleRejectWFH(w.id)}
                                  className="px-3 py-1 rounded-full text-[10px] font-semibold text-white"
                                  style={{ background: "#DC2626" }}
                                >
                                  Reject
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Penalties */}
                {tab === "penalties" && (
                  <div>
                    {penalties.length === 0 ? (
                      <div
                        className="py-10 text-center text-sm"
                        style={{ color: textMuted }}
                      >
                        No penalties — great attendance record!
                      </div>
                    ) : (
                      <div className="space-y-0">
                        {penalties.map((p, idx) => (
                          <div
                            key={p.id}
                            className="flex items-center gap-3 py-3 px-2 rounded-xl hover:bg-[var(--accentLight)] transition-colors"
                            style={{
                              borderBottom:
                                idx < penalties.length - 1
                                  ? `1px solid var(--accentLight)`
                                  : "none",
                            }}
                          >
                            <div
                              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                              style={{
                                background:
                                  p.status === "ACTIVE" ? "#FEE2E2" : "#D1FAE5",
                              }}
                            >
                              <svg
                                width="13"
                                height="13"
                                fill="none"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                                  stroke={
                                    p.status === "ACTIVE"
                                      ? "#DC2626"
                                      : "#065F46"
                                  }
                                  strokeWidth="1.8"
                                  strokeLinecap="round"
                                />
                              </svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span
                                  className="text-sm font-semibold"
                                  style={{ color: darkTeal }}
                                >
                                  {p.date}
                                </span>
                                <span
                                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                                  style={{
                                    background: "#F3F4F6",
                                    color: "#6B7280",
                                  }}
                                >
                                  {p.penalty_type}
                                </span>
                                {p.payroll_locked && (
                                  <span
                                    className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                                    style={{
                                      background: "#FEF3C7",
                                      color: "#92400E",
                                    }}
                                  >
                                    LOCKED
                                  </span>
                                )}
                              </div>
                              <div
                                className="text-xs mt-0.5 truncate"
                                style={{ color: textMuted }}
                              >
                                {p.reason}
                              </div>
                            </div>
                            <div
                              className="text-sm font-bold font-mono"
                              style={{ color: "#DC2626" }}
                            >
                              -{p.days_deducted}d
                            </div>
                            <span
                              className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                              style={
                                p.status === "ACTIVE"
                                  ? { background: "#FEE2E2", color: "#991B1B" }
                                  : p.status === "REVERSED"
                                    ? {
                                        background: "#D1FAE5",
                                        color: "#065F46",
                                      }
                                    : {
                                        background: "#F3F4F6",
                                        color: "#6B7280",
                                      }
                              }
                            >
                              {p.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </Card>

        {/* Quick actions strip for employees */}
        {!isManager && (
          <div className="flex gap-3">
            <button
              onClick={() => setModal("reg")}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold transition-all hover:opacity-90"
              style={{
                border: `1px solid ${cardBorder}`,
                color: darkTeal,
                background: "white",
              }}
            >
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24">
                <path
                  d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <path
                  d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
              Raise Regularization
            </button>
            <button
              onClick={() => setModal("wfh")}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold text-white transition-all hover:opacity-90"
              style={{ background: teal }}
            >
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24">
                <path
                  d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
                <polyline
                  points="9,22 9,12 15,12 15,22"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
              </svg>
              Apply WFH
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
