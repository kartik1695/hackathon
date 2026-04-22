import { useEffect, useState, useRef, useCallback } from "react";
import { NavPage } from "../layout/Sidebar";

const BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8002/api";

const C = {
  pageBg:     "var(--page-bg)",
  cardBg:     "var(--card-bg)",
  darkTeal:   "var(--primary-dark)",
  teal:       "var(--primary)",
  tealLight:  "var(--primary)",
  tealPale:   "var(--primary-pale)",
  tealBorder: "var(--card-border)",
  textDark:   "var(--text-dark)",
  textMuted:  "var(--text-muted)",
};

interface DashboardProps { token: string; role: string; userName: string; onNav: (p: NavPage) => void; }
interface LeaveBalance { casual_remaining: number; privilege_remaining: number; sick_remaining: number; comp_off_remaining: number; }
interface PendingLeave { id: number; employee_name: string; leave_type: string; days_count: number; from_date: string; to_date?: string; }
interface MyLeave { id: number; leave_type: string; from_date: string; to_date: string; days_count: number; status: string; }
interface TeamMember { id: number; name: string; title: string; department: string; status: "PRESENT"|"WFH"|"ABSENT"|"ON_LEAVE"; }
interface TeamStatus { direct_reports: TeamMember[]; peers: TeamMember[]; }
interface TodayLog { id: number; check_in: string|null; check_out: string|null; status: string; }
interface WeekDay { date: string; weekday_short: string; status: string|null; hours: number|null; is_leave: boolean; is_today: boolean; is_future: boolean; }
interface OrgStats { total: number; by_dept: { name: string; count: number }[]; by_status: { present: number; wfh: number; on_leave: number; absent: number }; }

async function apiFetch(token: string, path: string) {
  try {
    const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}
async function apiPost(token: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

// ── Male SVG Avatar ────────────────────────────────────────────────────────────
function MaleAvatarSVG() {
  return (
    <svg width="110" height="130" viewBox="0 0 110 130" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* skin */}
      <ellipse cx="55" cy="58" rx="22" ry="25" fill="#FDDBB4"/>
      {/* neck */}
      <rect x="46" y="80" width="18" height="14" rx="4" fill="#FDDBB4"/>
      {/* shirt / collar */}
      <path d="M20 130 Q20 98 55 95 Q90 98 90 130 Z" fill="#0D9488"/>
      <path d="M55 95 L44 108 L55 120 L66 108 Z" fill="#0A7A6F"/>
      <path d="M55 95 L48 100 L55 108" fill="#fff" opacity="0.3"/>
      <path d="M55 95 L62 100 L55 108" fill="#fff" opacity="0.3"/>
      {/* hair */}
      <ellipse cx="55" cy="37" rx="22" ry="12" fill="#3D2B1F"/>
      <ellipse cx="55" cy="44" rx="22" ry="5" fill="#3D2B1F"/>
      <ellipse cx="33" cy="52" rx="5" ry="10" fill="#3D2B1F"/>
      <ellipse cx="77" cy="52" rx="5" ry="10" fill="#3D2B1F"/>
      {/* ears */}
      <ellipse cx="33" cy="58" rx="4" ry="6" fill="#F5C89A"/>
      <ellipse cx="77" cy="58" rx="4" ry="6" fill="#F5C89A"/>
      {/* eyes */}
      <ellipse cx="46" cy="54" rx="4" ry="4.5" fill="white"/>
      <ellipse cx="64" cy="54" rx="4" ry="4.5" fill="white"/>
      <circle cx="47" cy="55" r="2.5" fill="#2C1A0E"/>
      <circle cx="65" cy="55" r="2.5" fill="#2C1A0E"/>
      <circle cx="47.8" cy="54.2" r="0.8" fill="white"/>
      <circle cx="65.8" cy="54.2" r="0.8" fill="white"/>
      {/* brows */}
      <path d="M42 49 Q46 47 50 49" stroke="#3D2B1F" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
      <path d="M60 49 Q64 47 68 49" stroke="#3D2B1F" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
      {/* nose */}
      <path d="M55 58 L52 66 Q55 68 58 66 Z" fill="#F0A070" opacity="0.6"/>
      {/* mouth */}
      <path d="M48 72 Q55 77 62 72" stroke="#C07040" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
      {/* stubble */}
      <ellipse cx="55" cy="74" rx="10" ry="5" fill="#C8A890" opacity="0.25"/>
    </svg>
  );
}

// ── Female SVG Avatar ──────────────────────────────────────────────────────────
function FemaleAvatarSVG() {
  return (
    <svg width="110" height="130" viewBox="0 0 110 130" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* long hair back */}
      <ellipse cx="55" cy="50" rx="24" ry="30" fill="#4A2E1A"/>
      <rect x="31" y="50" width="12" height="50" rx="6" fill="#4A2E1A"/>
      <rect x="67" y="50" width="12" height="50" rx="6" fill="#4A2E1A"/>
      {/* skin */}
      <ellipse cx="55" cy="58" rx="21" ry="24" fill="#FDD5B0"/>
      {/* neck */}
      <rect x="47" y="79" width="16" height="13" rx="4" fill="#FDD5B0"/>
      {/* blouse */}
      <path d="M18 130 Q18 96 55 93 Q92 96 92 130 Z" fill="#0D9488"/>
      <path d="M55 93 L48 100 Q52 106 55 112 Q58 106 62 100 Z" fill="#0A7A6F"/>
      {/* hair top / part */}
      <ellipse cx="55" cy="36" rx="21" ry="11" fill="#4A2E1A"/>
      <path d="M55 26 Q55 35 55 38" stroke="#6B4226" strokeWidth="1.5" strokeLinecap="round"/>
      {/* ears */}
      <ellipse cx="34" cy="56" rx="4" ry="5.5" fill="#F0C090"/>
      <ellipse cx="76" cy="56" rx="4" ry="5.5" fill="#F0C090"/>
      {/* earrings */}
      <circle cx="34" cy="63" r="2" fill="#0D9488"/>
      <circle cx="76" cy="63" r="2" fill="#0D9488"/>
      {/* eyes — larger, feminine */}
      <ellipse cx="46" cy="53" rx="4.5" ry="5" fill="white"/>
      <ellipse cx="64" cy="53" rx="4.5" ry="5" fill="white"/>
      <circle cx="47" cy="54" r="3" fill="#2C1A0E"/>
      <circle cx="65" cy="54" r="3" fill="#2C1A0E"/>
      <circle cx="47.8" cy="53.2" r="1" fill="white"/>
      <circle cx="65.8" cy="53.2" r="1" fill="white"/>
      {/* lashes */}
      <path d="M42 48.5 L40 46" stroke="#2C1A0E" strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M45 47.5 L44 45" stroke="#2C1A0E" strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M48 47 L48 44.5" stroke="#2C1A0E" strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M62 47.5 L62 44.5" stroke="#2C1A0E" strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M65 47.5 L66 45" stroke="#2C1A0E" strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M68 48.5 L70 46" stroke="#2C1A0E" strokeWidth="1.2" strokeLinecap="round"/>
      {/* brows — arched */}
      <path d="M41 48 Q46 45 51 47" stroke="#4A2E1A" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
      <path d="M59 47 Q64 45 69 48" stroke="#4A2E1A" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
      {/* nose */}
      <path d="M55 57 L52.5 64 Q55 66.5 57.5 64 Z" fill="#E8A070" opacity="0.5"/>
      {/* lips */}
      <path d="M47 71 Q51 69 55 70 Q59 69 63 71" fill="#E07050"/>
      <path d="M47 71 Q55 75 63 71 Q59 73 55 73.5 Q51 73 47 71 Z" fill="#C05040"/>
      {/* blush */}
      <ellipse cx="42" cy="65" rx="6" ry="4" fill="#F08060" opacity="0.2"/>
      <ellipse cx="68" cy="65" rx="6" ry="4" fill="#F08060" opacity="0.2"/>
    </svg>
  );
}

// ── Progress bar chart — real week data, thin line style ──────────────────────
function ProgressBarChart({ weekData }: { weekData: WeekDay[] }) {
  return (
    <div className="relative mt-8 mb-1">
      <div className="flex items-end gap-3">
        {weekData.map((day, i) => {
          const hasData = day.hours != null && day.hours > 0;
          const barColor = day.is_future ? "#E5E7EB"
            : day.is_leave ? "#FCA5A5"
            : day.is_today ? C.darkTeal
            : hasData ? C.tealLight
            : "#E5E7EB";

          return (
            <div key={i} className="flex flex-col items-center flex-1 relative" style={{ paddingTop: "28px" }}>
              {/* tooltip for today or leave days */}
              {day.is_today && hasData && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full text-[9px] font-bold text-white whitespace-nowrap"
                  style={{ background: C.darkTeal }}>
                  {day.hours}h
                </div>
              )}
              {day.is_leave && !day.is_today && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full text-[9px] font-bold whitespace-nowrap"
                  style={{ background: "#FEE2E2", color: "#F87171" }}>
                  Leave
                </div>
              )}
              {/* uniform thin bar */}
              <div className="w-full rounded-full mb-2" style={{ height: "4px", background: barColor }} />
              <div className="text-[10px] font-medium" style={{ color: day.is_today ? C.textDark : C.textMuted }}>
                {day.weekday_short}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Real-time clock + Clock In/Out ─────────────────────────────────────────────
function TimeTrackerCard({ token, onNav }: { token: string; onNav: (p: NavPage) => void }) {
  const [todayLog, setTodayLog] = useState<TodayLog | null | undefined>(undefined); // undefined = loading
  const [elapsedSec, setElapsedSec] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const ivRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchToday = useCallback(async () => {
    const data = await apiFetch(token, "/attendance/today/");
    setTodayLog(data ?? null);
  }, [token]);

  useEffect(() => { fetchToday(); }, [fetchToday]);

  // Real-time elapsed counter
  useEffect(() => {
    if (!todayLog?.check_in) { setElapsedSec(0); return; }
    const checkInMs = new Date(todayLog.check_in).getTime();

    const tick = () => {
      const endMs = todayLog.check_out
        ? new Date(todayLog.check_out).getTime()
        : Date.now();
      setElapsedSec(Math.max(0, Math.floor((endMs - checkInMs) / 1000)));
    };
    tick();
    if (!todayLog.check_out) {
      ivRef.current = setInterval(tick, 1000);
    }
    return () => { if (ivRef.current) clearInterval(ivRef.current); };
  }, [todayLog]);

  const h = Math.floor(elapsedSec / 3600);
  const m = Math.floor((elapsedSec % 3600) / 60);
  const s = elapsedSec % 60;
  const display = `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;

  const r = 52;
  const circ = 2 * Math.PI * r;
  const maxSec = 8 * 3600;
  const offset = circ * (1 - Math.min(elapsedSec / maxSec, 1));

  const isClockedIn = !!todayLog?.check_in && !todayLog?.check_out;
  const isClockedOut = !!todayLog?.check_out;

  async function handleClockIn() {
    setError(""); setActionLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    const res = await apiPost(token, "/attendance/check-in/", { date: today, status: "PRESENT" });
    if (res?.error) setError(res.error);
    else await fetchToday();
    setActionLoading(false);
  }

  async function handleClockOut() {
    if (!isClockedIn) { setError("Clock in first before clocking out."); return; }
    setError(""); setActionLoading(true);
    const res = await apiPost(token, "/attendance/check-out/");
    if (res?.error) setError(res.error);
    else await fetchToday();
    setActionLoading(false);
  }

  return (
    <div className="rounded-2xl p-5" style={{ background: C.cardBg, boxShadow: "0 1px 4px rgba(13,148,136,0.08)" }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold" style={{ color: C.textDark }}>Time tracker</span>
        <button onClick={() => onNav("attendance")} className="w-6 h-6 rounded-full flex items-center justify-center hover:opacity-70"
          style={{ background: C.tealPale }}>
          <svg width="10" height="10" fill="none" viewBox="0 0 24 24"><path d="M7 17L17 7M17 7H7M17 7v10" stroke={C.teal} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
      </div>

      {/* Donut */}
      <div className="flex flex-col items-center">
        <div className="relative w-32 h-32">
          <svg width="128" height="128" viewBox="0 0 128 128" style={{ transform: "rotate(-90deg)" }}>
            <circle cx="64" cy="64" r={r} fill="none" stroke={C.tealBorder} strokeWidth="3" strokeDasharray="4 4" />
            <circle cx="64" cy="64" r={r} fill="none" stroke={isClockedIn ? C.teal : C.tealBorder}
              strokeWidth="5" strokeDasharray={circ} strokeDashoffset={offset}
              strokeLinecap="round" style={{ transition: "stroke-dashoffset 1s linear" }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="font-mono font-bold text-xl" style={{ color: C.textDark }}>{display}</div>
            <div className="text-[9px] uppercase tracking-wider mt-0.5" style={{ color: C.textMuted }}>
              {isClockedOut ? "Clocked out" : isClockedIn ? "Running" : "Not started"}
            </div>
          </div>
        </div>

        {/* Check-in time badge */}
        {todayLog?.check_in && (
          <div className="mt-2 text-[10px] font-medium" style={{ color: C.textMuted }}>
            In: {new Date(todayLog.check_in).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
            {todayLog.check_out && (
              <span className="ml-2">
                Out: {new Date(todayLog.check_out).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-2 mt-3 w-full">
          <button
            onClick={handleClockIn}
            disabled={actionLoading || isClockedIn || isClockedOut}
            className="flex-1 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-40"
            style={{ background: C.teal, color: "white" }}
          >
            {isClockedIn || isClockedOut ? "Clocked In ✓" : "Clock In"}
          </button>
          <button
            onClick={handleClockOut}
            disabled={actionLoading || !isClockedIn}
            className="flex-1 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-40"
            style={{ background: isClockedIn ? C.darkTeal : C.tealPale, color: isClockedIn ? "white" : C.textMuted }}
          >
            {isClockedOut ? "Clocked Out ✓" : "Clock Out"}
          </button>
        </div>
        {error && <div className="mt-2 text-[10px] text-red-500 text-center">{error}</div>}
      </div>
    </div>
  );
}

// ── Team Insights ──────────────────────────────────────────────────────────────
const STATUS_META = {
  PRESENT:  { label: "In Office",  dot: "#0D9488", bg: "#CCFBF1" },
  WFH:      { label: "WFH",        dot: "#F59E0B", bg: "#FEF3C7" },
  ON_LEAVE: { label: "On Leave",   dot: "#F87171", bg: "#FEE2E2" },
  ABSENT:   { label: "Absent",     dot: "#9CA3AF", bg: "#F3F4F6" },
};
const AV_BG = ["#0D9488","#134E4A","#F97316","#8B5CF6","#EC4899","#3B82F6","#14B8A6","#D97706"];

function TeamInsightsCard({ teamStatus, loading }: { teamStatus: TeamStatus | null; loading: boolean }) {
  const dr = teamStatus?.direct_reports ?? [];
  const peers = teamStatus?.peers ?? [];
  const cnt = (arr: TeamMember[], s: string) => arr.filter(m => m.status === s).length;
  const Pill = ({ c, l, co, bg }: { c: number; l: string; co: string; bg: string }) => (
    <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold flex-shrink-0" style={{ background: bg, color: co }}>
      <div className="w-1 h-1 rounded-full" style={{ background: co }} />{c} {l}
    </div>
  );
  const Row = ({ m, i }: { m: TeamMember; i: number }) => {
    const meta = STATUS_META[m.status] || STATUS_META.PRESENT;
    const init = m.name.split(" ").map(w => w[0]).slice(0,2).join("").toUpperCase();
    return (
      <div className="flex items-center gap-2.5 py-1.5">
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
          style={{ background: AV_BG[i % AV_BG.length] }}>{init}</div>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-semibold truncate" style={{ color: C.textDark }}>{m.name}</div>
          <div className="text-[9px] truncate" style={{ color: C.textMuted }}>{m.title || m.department}</div>
        </div>
        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-medium flex-shrink-0"
          style={{ background: meta.bg, color: meta.dot }}>
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: meta.dot }} />{meta.label}
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-2xl p-5" style={{ background: C.cardBg, boxShadow: "0 1px 4px rgba(13,148,136,0.08)" }}>
      <div className="text-sm font-semibold mb-3" style={{ color: C.textDark }}>Team Insights · Today</div>
      {loading ? [1,2,3,4].map(i => <div key={i} className="h-9 mb-2 rounded-xl animate-pulse" style={{ background: C.tealPale }} />) : (
        <>
          {dr.length > 0 && (
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: C.textMuted }}>My Team ({dr.length})</span>
                <div className="flex gap-1">
                  <Pill c={cnt(dr,"PRESENT")} l="Office" co={STATUS_META.PRESENT.dot} bg={STATUS_META.PRESENT.bg} />
                  <Pill c={cnt(dr,"WFH")} l="WFH" co={STATUS_META.WFH.dot} bg={STATUS_META.WFH.bg} />
                  <Pill c={cnt(dr,"ON_LEAVE")} l="Leave" co={STATUS_META.ON_LEAVE.dot} bg={STATUS_META.ON_LEAVE.bg} />
                </div>
              </div>
              <div className="divide-y" style={{ borderColor: C.tealPale }}>
                {dr.slice(0,5).map((m,i) => <Row key={m.id} m={m} i={i} />)}
              </div>
            </div>
          )}
          {peers.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: C.textMuted }}>My Peers ({peers.length})</span>
                <div className="flex gap-1">
                  <Pill c={cnt(peers,"PRESENT")} l="Office" co={STATUS_META.PRESENT.dot} bg={STATUS_META.PRESENT.bg} />
                  <Pill c={cnt(peers,"WFH")} l="WFH" co={STATUS_META.WFH.dot} bg={STATUS_META.WFH.bg} />
                  <Pill c={cnt(peers,"ON_LEAVE")} l="Leave" co={STATUS_META.ON_LEAVE.dot} bg={STATUS_META.ON_LEAVE.bg} />
                </div>
              </div>
              <div className="divide-y" style={{ borderColor: C.tealPale }}>
                {peers.slice(0,5).map((m,i) => <Row key={m.id} m={m} i={i+10} />)}
              </div>
            </div>
          )}
          {dr.length === 0 && peers.length === 0 && (
            <div className="text-sm text-center py-6" style={{ color: C.textMuted }}>No team data</div>
          )}
        </>
      )}
    </div>
  );
}

// ── Org Insights — real data, matches Image #8 ────────────────────────────────
function OrgInsightsCard({ orgStats, loading }: { orgStats: OrgStats | null; loading: boolean }) {
  const depts = orgStats?.by_dept?.slice(0, 5) ?? [];
  const maxCount = Math.max(...depts.map(d => d.count), 1);
  const bs = orgStats?.by_status ?? { present: 0, wfh: 0, on_leave: 0, absent: 0 };
  const total = orgStats?.total ?? 0;
  const presentPct = total > 0 ? Math.round(((bs.present + bs.wfh) / total) * 100) : 0;

  return (
    <div className="rounded-2xl p-5" style={{ background: C.cardBg, boxShadow: "0 1px 4px rgba(13,148,136,0.08)" }}>
      <div className="text-sm font-semibold mb-4" style={{ color: C.textDark }}>Org Insights</div>

      {/* Presence bar — full width, two-tone like Image #8 */}
      <div className="mb-1">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs" style={{ color: C.textMuted }}>Today's presence</span>
          <span className="text-xs font-bold" style={{ color: C.textDark }}>{loading ? "—" : `${total} total`}</span>
        </div>
        <div className="relative h-3 rounded-full overflow-hidden" style={{ background: C.tealPale }}>
          <div className="h-full rounded-full transition-all duration-700"
            style={{ width: `${presentPct}%`, background: C.darkTeal }} />
        </div>
        {/* Legend */}
        <div className="flex items-center gap-4 mt-2">
          {[
            { dot: C.teal,     label: "Office", val: bs.present },
            { dot: "#F59E0B",  label: "WFH",    val: bs.wfh },
            { dot: "#F87171",  label: "Leave",  val: bs.on_leave },
            { dot: "#D1D5DB",  label: "Absent", val: bs.absent },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: item.dot }} />
              <span className="text-[11px]" style={{ color: C.textMuted }}>
                <span className="font-semibold" style={{ color: C.textDark }}>{item.val}</span> {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Dept breakdown — two-tone bars matching Image #8 */}
      <div className="mt-5">
        <div className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: C.textMuted }}>By Department</div>
        {loading
          ? [1,2,3,4,5].map(i => <div key={i} className="h-5 mb-3 rounded animate-pulse" style={{ background: C.tealPale }} />)
          : depts.map(dept => (
            <div key={dept.name} className="flex items-center gap-3 mb-3">
              <div className="text-[11px] truncate flex-shrink-0 font-medium"
                style={{ color: C.textDark, width: "100px" }}
                title={dept.name}>
                {dept.name.length > 14 ? dept.name.slice(0, 13) + "…" : dept.name}
              </div>
              {/* Two-tone bar: filled dark teal + unfilled teal-pale */}
              <div className="flex-1 h-2.5 rounded-full overflow-hidden flex" style={{ background: C.tealPale }}>
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${(dept.count / maxCount) * 100}%`, background: C.darkTeal }} />
              </div>
              <div className="text-xs font-bold flex-shrink-0 w-5 text-right" style={{ color: C.textDark }}>
                {dept.count}
              </div>
            </div>
          ))
        }
      </div>
    </div>
  );
}

// ── My Leaves ──────────────────────────────────────────────────────────────────
function MyLeavesCard({ myLeaves, loading, onNav }: { myLeaves: MyLeave[]; loading: boolean; onNav: (p: NavPage) => void }) {
  const SC: Record<string, string> = { PENDING: "#F59E0B", APPROVED: "#0D9488", REJECTED: "#F87171" };
  return (
    <div className="rounded-2xl p-5" style={{ background: C.cardBg, boxShadow: "0 1px 4px rgba(13,148,136,0.08)" }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold" style={{ color: C.textDark }}>My Leaves</span>
        <button onClick={() => onNav("leaves")} className="text-xs font-medium hover:underline" style={{ color: C.teal }}>+ Apply</button>
      </div>
      {loading ? [1,2].map(i => <div key={i} className="h-10 mb-2 rounded-xl animate-pulse" style={{ background: C.tealPale }} />)
        : myLeaves.length === 0 ? <div className="text-sm py-4 text-center" style={{ color: C.textMuted }}>No recent leaves</div>
        : (
          <div className="space-y-2">
            {myLeaves.slice(0, 4).map(l => (
              <div key={l.id} className="flex items-center gap-2 py-1.5">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold" style={{ color: C.textDark }}>{l.leave_type}</div>
                  <div className="text-[10px]" style={{ color: C.textMuted }}>{l.from_date} → {l.to_date} · {l.days_count}d</div>
                </div>
                <div className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: SC[l.status] || "#9CA3AF" }}>
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: SC[l.status] || "#9CA3AF" }} />
                  {l.status.toLowerCase()}
                </div>
              </div>
            ))}
          </div>
        )
      }
    </div>
  );
}

// ── Pending Approvals ──────────────────────────────────────────────────────────
function PendingApprovalsCard({ loading, pendingLeaves, onApprove, onReject }:
  { loading: boolean; pendingLeaves: PendingLeave[]; onApprove:(id:number)=>void; onReject:(id:number)=>void }) {
  return (
    <div className="rounded-2xl p-5 h-full" style={{ background: C.cardBg, boxShadow: "0 1px 4px rgba(13,148,136,0.08)" }}>
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-semibold" style={{ color: C.textDark }}>Pending Approvals</span>
        {pendingLeaves.length > 0 && (
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full" style={{ background: "#F97316" }} />
            <span className="text-[11px] font-semibold" style={{ color: "#F97316" }}>{pendingLeaves.length} pending</span>
          </div>
        )}
      </div>
      <div className="space-y-3 overflow-y-auto" style={{ maxHeight: "460px", scrollbarWidth: "none" }}>
        {loading ? [1,2,3].map(i => <div key={i} className="h-14 rounded-xl animate-pulse" style={{ background: C.tealPale }} />)
          : pendingLeaves.length === 0 ? <div className="text-sm text-center py-8" style={{ color: C.textMuted }}>No pending approvals</div>
          : pendingLeaves.map((leave, idx) => {
            const init = (leave.employee_name||"?").split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase();
            return (
              <div key={leave.id} className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                  style={{ background: AV_BG[idx % AV_BG.length] }}>{init}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold truncate" style={{ color: C.textDark }}>{leave.employee_name}</div>
                  <div className="text-[10px]" style={{ color: C.textMuted }}>
                    {leave.leave_type} · {leave.from_date}{leave.to_date && leave.to_date !== leave.from_date ? `–${leave.to_date}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button onClick={() => onApprove(leave.id)} className="px-2.5 py-1 rounded-full text-[10px] font-semibold hover:opacity-80"
                    style={{ border: `1px solid ${C.teal}`, color: C.teal, background: "transparent" }}>Approve</button>
                  <button onClick={() => onReject(leave.id)} className="px-2.5 py-1 rounded-full text-[10px] font-semibold hover:opacity-80"
                    style={{ border: "1px solid #F87171", color: "#F87171", background: "transparent" }}>Reject</button>
                </div>
              </div>
            );
          })
        }
      </div>
    </div>
  );
}

// ── NewsFeedCard ───────────────────────────────────────────────────────────────
interface NewsArticle { title: string; url: string; pub: string; summary: string; source: string; tag: string; color: string; }

const TAG_LABELS: Record<string, string> = { "supply-chain": "Supply Chain", ai: "AI", technology: "Tech" };
const TAGS = ["all", "supply-chain", "ai", "technology"];

function sanitizeNewsText(raw: string): string {
  return (raw ?? "")
    .replace(/&lt;img[\s\S]*?&gt;/gi, "")
    .replace(/<img[\s\S]*?>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/<img[^>]*$/gi, "")
    .trim();
}

function NewsFeedCard({ token }: { token: string }) {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [tag, setTag] = useState("all");
  const [loading, setLoading] = useState(true);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  useEffect(() => {
    setLoading(true);
    apiFetch(token, "/ai/news/").then(d => {
      if (d?.articles) { setArticles(d.articles); setLastFetched(new Date()); }
      setLoading(false);
    });
  }, [token]);

  const filtered = tag === "all" ? articles : articles.filter(a => a.tag === tag);

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: C.cardBg, border: "1px solid #D0EFE9" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div>
          <div className="text-sm font-bold" style={{ color: C.textDark }}>Industry News</div>
          {lastFetched && (
            <div className="text-[10px] mt-0.5" style={{ color: C.textMuted }}>
              Updated {lastFetched.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: C.teal }} />
          <span className="text-[10px] font-semibold" style={{ color: C.teal }}>LIVE</span>
        </div>
      </div>

      {/* Tag filters */}
      <div className="flex gap-1 px-4 pb-3">
        {TAGS.map(t => (
          <button key={t} onClick={() => setTag(t)}
            className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold transition-all"
            style={tag === t
              ? { background: C.darkTeal, color: "#fff" }
              : { background: "#F0FDFB", color: C.textMuted, border: "1px solid #E2F4F0" }
            }
          >
            {t === "all" ? "All" : TAG_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Feed */}
      <div className="max-h-72 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
        {loading ? (
          <div className="px-4 pb-4 space-y-3">
            {[1,2,3].map(i => (
              <div key={i} className="space-y-1.5">
                <div className="h-3 rounded-full animate-pulse w-full" style={{ background: "#F0FDFB" }} />
                <div className="h-2.5 rounded-full animate-pulse w-3/4" style={{ background: "#F0FDFB" }} />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 pb-6 text-center text-xs" style={{ color: C.textMuted }}>No articles found</div>
        ) : (
          <div className="divide-y" style={{ borderColor: "#F0FDFB" }}>
            {filtered.map((a, i) => (
              <a key={i} href={a.url} target="_blank" rel="noopener noreferrer"
                className="flex items-start gap-2.5 px-4 py-3 group transition-colors hover:bg-[#F0FDFB] block no-underline overflow-hidden"
              >
                <div className="w-1 h-1 rounded-full mt-1.5 flex-shrink-0" style={{ background: a.color }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ background: "#F0FDFB", color: a.color }}>
                      {a.source}
                    </span>
                  </div>
                  <div className="text-xs font-semibold leading-snug group-hover:underline" style={{ color: C.textDark }}>
                    {a.title}
                  </div>
                  {a.summary && (
                    <div className="text-[10px] mt-0.5 line-clamp-2 leading-relaxed break-words" style={{ color: C.textMuted }}>
                      {sanitizeNewsText(a.summary)}
                    </div>
                  )}
                </div>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className="flex-shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <path d="M7 17L17 7M17 7H7M17 7v10" stroke={C.teal} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────
export default function Dashboard({ token, role, userName, onNav }: DashboardProps) {
  const [balance, setBalance] = useState<LeaveBalance | null>(null);
  const [pendingLeaves, setPendingLeaves] = useState<PendingLeave[]>([]);
  const [myLeaves, setMyLeaves] = useState<MyLeave[]>([]);
  const [teamStatus, setTeamStatus] = useState<TeamStatus | null>(null);
  const [orgStats, setOrgStats] = useState<OrgStats | null>(null);
  const [weekData, setWeekData] = useState<WeekDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");

  const isFemaleName = ["a", "e", "i"].includes((userName[0] || "").toLowerCase());
  const firstName = userName.split(" ")[0] || "User";
  const isManager = ["manager", "hr", "cfo", "admin"].includes(role);
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [bal, pending, mine, team, week, org] = await Promise.all([
        apiFetch(token, "/leaves/balance/"),
        isManager ? apiFetch(token, "/leaves/?status=PENDING&limit=20") : Promise.resolve(null),
        apiFetch(token, "/leaves/?limit=10"),
        apiFetch(token, "/employees/team-status/"),
        apiFetch(token, "/attendance/week/"),
        apiFetch(token, "/attendance/org-insights/"),
      ]);
      if (bal) setBalance(bal);
      if (pending) setPendingLeaves((pending?.results ?? (Array.isArray(pending) ? pending : [])).slice(0, 8));
      if (mine) setMyLeaves((mine?.results ?? (Array.isArray(mine) ? mine : [])).slice(0, 5));
      if (team) setTeamStatus(team);
      if (week && Array.isArray(week)) setWeekData(week);
      if (org) setOrgStats(org);
      setLoading(false);
    }
    load();
  }, [token]);

  async function handleApprove(id: number) {
    await apiPost(token, `/leaves/${id}/approve/`);
    showToast("Leave approved ✓");
    setPendingLeaves(prev => prev.filter(l => l.id !== id));
  }
  async function handleReject(id: number) {
    await apiPost(token, `/leaves/${id}/reject/`, { reason: "Declined by manager" });
    showToast("Leave rejected");
    setPendingLeaves(prev => prev.filter(l => l.id !== id));
  }

  const totalLeave = (balance?.casual_remaining ?? 0) + (balance?.privilege_remaining ?? 0) + (balance?.sick_remaining ?? 0);

  return (
    <div className="min-h-full p-6" style={{ background: C.pageBg }}>
      {toast && (
        <div className="fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-semibold shadow-xl" style={{ background: C.darkTeal, color: "#FFFFFF" }}>
          {toast}
        </div>
      )}

      {/* ── WELCOME HEADER ───────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-4xl font-bold mb-3" style={{ color: C.textDark, letterSpacing: "-0.02em" }}>
            Welcome in, {firstName}
          </h1>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: C.darkTeal, color: "#fff" }}>
              <span className="font-bold">25%</span><span className="opacity-80 font-normal">Interviews</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: C.teal, color: "#fff" }}>
              <span className="font-bold">30%</span><span className="opacity-80 font-normal">Hired</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: C.tealPale, color: C.darkTeal }}>
              <span className="font-bold">46%</span><span className="opacity-80 font-normal">Project time</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: "#E5E7EB", color: "#9CA3AF" }}>
              <span className="font-bold">65%</span><span className="opacity-80 font-normal">Output</span>
            </div>
          </div>
        </div>

        {/* Counters — matching Image #5 */}
        <div className="flex items-center gap-10">
          {[
            { icon: (
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" stroke="#6B9E9A" strokeWidth="1.5"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="#6B9E9A" strokeWidth="1.5" strokeLinecap="round"/></svg>
            ), value: 92, label: "Employee" },
            { icon: (
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2" stroke="#6B9E9A" strokeWidth="1.5"/><path d="M8 2v4M16 2v4M3 10h18" stroke="#6B9E9A" strokeWidth="1.5" strokeLinecap="round"/></svg>
            ), value: 75, label: "Hirings" },
            { icon: (
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2" stroke="#6B9E9A" strokeWidth="1.5"/><path d="M8 21h8M12 17v4" stroke="#6B9E9A" strokeWidth="1.5" strokeLinecap="round"/></svg>
            ), value: 315, label: "Projects" },
          ].map(s => (
            <div key={s.label} className="text-center">
              <div className="text-4xl font-bold leading-none" style={{ color: C.textDark }}>{s.value}</div>
              <div className="flex items-center gap-1 mt-1 justify-center">
                {s.icon}
                <span className="text-xs" style={{ color: C.textMuted }}>{s.label}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── MAIN GRID ────────────────────────────────────────────────────────── */}
      <div className="grid gap-4" style={{ gridTemplateColumns: "220px 1fr 270px 300px", alignItems: "start" }}>

        {/* COL 1: Profile card + accordions */}
        <div className="flex flex-col gap-3">
          <div
            className="relative rounded-2xl overflow-hidden cursor-pointer group"
            style={{ height: "240px", background: "linear-gradient(160deg, #A8D8CF 0%, #7EC8BE 100%)" }}
            onClick={() => onNav("employees")}
          >
            <div className="absolute inset-0 flex items-center justify-center" style={{ paddingBottom: "52px" }}>
              {isFemaleName ? <FemaleAvatarSVG /> : <MaleAvatarSVG />}
            </div>
            <div className="absolute bottom-0 left-0 right-0 p-4" style={{ background: "linear-gradient(to top, rgba(13,61,54,0.82) 0%, transparent 100%)" }}>
              <div className="text-white font-bold text-sm">{userName || "Employee"}</div>
              <div className="text-[11px] mt-0.5 capitalize" style={{ color: "rgba(255,255,255,0.7)" }}>
                {role === "hr" ? "HR Business Partner" : role}
              </div>
              <div className="inline-block mt-2 px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
                style={{ background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.4)", color: "white" }}>
                ₹16,00,000
              </div>
            </div>
          </div>

          {[
            { label: "Pension contributions" },
            { label: "Devices", sub: "MacBook Air M1", icon: "💻", open: true },
            { label: "Compensation Summary" },
            { label: "Employee Benefits" },
          ].map(item => (
            <div key={item.label} className="rounded-xl overflow-hidden" style={{ background: C.cardBg, border: `1px solid ${C.tealPale}` }}>
              <div className="w-full flex items-center justify-between px-4 py-3 cursor-pointer">
                <span className="text-xs font-medium" style={{ color: C.textDark }}>{item.label}</span>
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" style={{ transform: item.open ? "rotate(180deg)" : "none" }}>
                  <path d="M6 9l6 6 6-6" stroke={C.textMuted} strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
              {item.open && item.sub && (
                <div className="px-3 pb-3">
                  <div className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: C.tealPale }}>
                    <div className="flex items-center gap-2">
                      <span>{item.icon}</span>
                      <div>
                        <div className="text-xs font-semibold" style={{ color: C.textDark }}>MacBook Air</div>
                        <div className="text-[10px]" style={{ color: C.textMuted }}>Version M1</div>
                      </div>
                    </div>
                    <span className="text-gray-400 text-xs">···</span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* COL 2: Progress + Team Insights + Org Insights */}
        <div className="flex flex-col gap-4">
          {/* Progress card */}
          <div className="rounded-2xl p-5" style={{ background: C.cardBg, boxShadow: "0 1px 4px rgba(13,148,136,0.08)" }}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold" style={{ color: C.textDark }}>Progress</span>
              <button onClick={() => onNav("attendance")} className="w-6 h-6 rounded-full flex items-center justify-center hover:opacity-70"
                style={{ background: C.tealPale }}>
                <svg width="10" height="10" fill="none" viewBox="0 0 24 24"><path d="M7 17L17 7M17 7H7M17 7v10" stroke={C.teal} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-4xl font-bold" style={{ color: C.textDark }}>
                {loading ? "—" : `${weekData.reduce((s,d)=>s+(d.hours??0),0).toFixed(1)}h`}
              </span>
              <div>
                <div className="text-xs font-medium" style={{ color: C.textDark }}>Work Time</div>
                <div className="text-xs" style={{ color: C.textMuted }}>this week</div>
              </div>
            </div>
            <ProgressBarChart weekData={weekData.length ? weekData : Array.from({length:7},(_,i)=>({date:"",weekday_short:["M","T","W","T","F","S","S"][i],status:null,hours:null,is_leave:false,is_today:i===new Date().getDay()-1,is_future:false}))} />
          </div>

          <TeamInsightsCard teamStatus={teamStatus} loading={loading} />
          <OrgInsightsCard orgStats={orgStats} loading={loading} />
          <NewsFeedCard token={token} />
        </div>

        {/* COL 3: Time tracker + My Leaves + Leave balance */}
        <div className="flex flex-col gap-4">
          <TimeTrackerCard token={token} onNav={onNav} />

          <MyLeavesCard myLeaves={myLeaves} loading={loading} onNav={onNav} />

          {balance && (
            <div className="rounded-2xl p-4" style={{ background: C.cardBg, boxShadow: "0 1px 4px rgba(13,148,136,0.08)" }}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold" style={{ color: C.textDark }}>Leave balance</span>
                <span className="text-xl font-bold" style={{ color: C.darkTeal }}>{totalLeave}d</span>
              </div>
              {[
                { label: "Casual", val: balance.casual_remaining, max: 12, color: C.teal },
                { label: "Sick", val: balance.sick_remaining, max: 10, color: "#14B8A6" },
                { label: "Earned", val: balance.privilege_remaining, max: 18, color: C.darkTeal },
              ].map(item => (
                <div key={item.label} className="mb-2">
                  <div className="flex justify-between mb-1">
                    <span className="text-xs font-medium" style={{ color: C.textDark }}>{item.label}</span>
                    <span className="text-xs" style={{ color: C.textMuted }}>{item.val}/{item.max}</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: C.tealPale }}>
                    <div className="h-full rounded-full" style={{ width: `${(item.val/item.max)*100}%`, background: item.color }} />
                  </div>
                </div>
              ))}
              <button onClick={() => onNav("leaves")} className="w-full mt-2 py-2 rounded-xl text-xs font-semibold hover:opacity-80"
                style={{ background: C.teal, color: "white" }}>+ Apply Leave</button>
            </div>
          )}
        </div>

        {/* COL 4: Pending Approvals (manager) */}
        {isManager && (
          <PendingApprovalsCard loading={loading} pendingLeaves={pendingLeaves} onApprove={handleApprove} onReject={handleReject} />
        )}
      </div>
    </div>
  );
}
