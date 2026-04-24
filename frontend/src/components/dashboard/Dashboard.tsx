import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { NavPage } from "../layout/Sidebar";
import profilePhoto from "../../assets/man-smiling.png";

const BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8002/api";

const C = {
  pageBg: "var(--pageBg)",
  cardBg: "var(--card)",
  darkTeal: "var(--navPill)",
  teal: "var(--accent)",
  tealLight: "var(--accent)",
  tealPale: "var(--accentLight)",
  tealBorder: "var(--cardBorder)",
  textDark: "var(--ink)",
  textMuted: "var(--muted)",
  barActive: "var(--barActive)",
  barInactive: "var(--barInactive)",
  timerDash: "var(--timerDash)",
};

interface DashboardProps {
  token: string;
  role: string;
  userName: string;
  onNav: (p: NavPage) => void;
}
interface LeaveBalance {
  casual_remaining: number;
  privilege_remaining: number;
  sick_remaining: number;
  comp_off_remaining: number;
}
interface PendingLeave {
  id: number;
  employee_name: string;
  leave_type: string;
  days_count: number;
  from_date: string;
  to_date?: string;
}
interface MyLeave {
  id: number;
  leave_type: string;
  from_date: string;
  to_date: string;
  days_count: number;
  status: string;
}
interface MyRequest {
  id: number;
  type: "leave" | "regularization" | "wfh" | "comp_off" | "roadmap";
  label: string;
  sub: string;
  status: string;
}
interface PendingRegularization {
  id: number;
  employee_name: string;
  date: string;
  status: string;
}
interface PendingWFH {
  id: number;
  employee_name: string;
  dates?: string[];
  dates_count?: number;
  status: string;
}
interface PendingCompOff {
  id: number;
  employee_name: string;
  worked_on: string;
  days_claimed: number;
  status: string;
}
interface PendingRoadmap {
  id: number;
  employee_name: string;
  employee_id: number;
  skill_name: string;
  status: string;
  step_count: number;
}

type TeamApprovalType =
  | "leave"
  | "regularization"
  | "wfh"
  | "comp_off"
  | "roadmap";
interface TeamApprovalItem {
  id: number;
  type: TeamApprovalType;
  employee_name: string;
  title: string;
  sub: string;
}

const QUOTES = [
  {
    text: "The secret of getting ahead is getting started.",
    author: "Mark Twain",
  },
  {
    text: "Great things are done by a series of small things brought together.",
    author: "Vincent Van Gogh",
  },
  {
    text: "It always seems impossible until it's done.",
    author: "Nelson Mandela",
  },
  {
    text: "Your work is going to fill a large part of your life. Do great work.",
    author: "Steve Jobs",
  },
  {
    text: "The only way to do great work is to love what you do.",
    author: "Steve Jobs",
  },
  {
    text: "Success is not final, failure is not fatal — it is the courage to continue that counts.",
    author: "Winston Churchill",
  },
  {
    text: "Don't watch the clock; do what it does. Keep going.",
    author: "Sam Levenson",
  },
  {
    text: "Productivity is never an accident. It is always the result of commitment to excellence.",
    author: "Paul J. Meyer",
  },
  { text: "Focus on being productive instead of busy.", author: "Tim Ferriss" },
  {
    text: "Work hard, be kind, and amazing things will happen.",
    author: "Conan O'Brien",
  },
  {
    text: "The way to get started is to quit talking and begin doing.",
    author: "Walt Disney",
  },
  { text: "Small progress is still progress.", author: "" },
  {
    text: "Every morning you have two choices: continue to sleep with your dreams, or wake up and chase them.",
    author: "",
  },
  {
    text: "You don't have to be great to start, but you have to start to be great.",
    author: "Zig Ziglar",
  },
  {
    text: "Hard work beats talent when talent doesn't work hard.",
    author: "Tim Notke",
  },
];
interface TeamMember {
  id: number;
  name: string;
  title: string;
  department: string;
  status: "PRESENT" | "WFH" | "ABSENT" | "ON_LEAVE";
}
interface TeamStatus {
  direct_reports: TeamMember[];
  peers: TeamMember[];
}
interface TodayLog {
  id: number;
  check_in: string | null;
  check_out: string | null;
  status: string;
}
interface WeekDay {
  date: string;
  weekday_short: string;
  status: string | null;
  hours: number | null;
  is_leave: boolean;
  is_today: boolean;
  is_future: boolean;
}
interface OrgStats {
  total: number;
  by_dept: { name: string; count: number }[];
  by_status: { present: number; wfh: number; on_leave: number; absent: number };
}

async function apiFetch(token: string, path: string) {
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
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

// ── Male SVG Avatar ────────────────────────────────────────────────────────────
function MaleAvatarSVG() {
  return (
    <svg
      width="110"
      height="130"
      viewBox="0 0 110 130"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* skin */}
      <ellipse cx="55" cy="58" rx="22" ry="25" fill="#FDDBB4" />
      {/* neck */}
      <rect x="46" y="80" width="18" height="14" rx="4" fill="#FDDBB4" />
      {/* shirt / collar */}
      <path d="M20 130 Q20 98 55 95 Q90 98 90 130 Z" fill="#0D9488" />
      <path d="M55 95 L44 108 L55 120 L66 108 Z" fill="#0A7A6F" />
      <path d="M55 95 L48 100 L55 108" fill="#fff" opacity="0.3" />
      <path d="M55 95 L62 100 L55 108" fill="#fff" opacity="0.3" />
      {/* hair */}
      <ellipse cx="55" cy="37" rx="22" ry="12" fill="#3D2B1F" />
      <ellipse cx="55" cy="44" rx="22" ry="5" fill="#3D2B1F" />
      <ellipse cx="33" cy="52" rx="5" ry="10" fill="#3D2B1F" />
      <ellipse cx="77" cy="52" rx="5" ry="10" fill="#3D2B1F" />
      {/* ears */}
      <ellipse cx="33" cy="58" rx="4" ry="6" fill="#F5C89A" />
      <ellipse cx="77" cy="58" rx="4" ry="6" fill="#F5C89A" />
      {/* eyes */}
      <ellipse cx="46" cy="54" rx="4" ry="4.5" fill="white" />
      <ellipse cx="64" cy="54" rx="4" ry="4.5" fill="white" />
      <circle cx="47" cy="55" r="2.5" fill="#2C1A0E" />
      <circle cx="65" cy="55" r="2.5" fill="#2C1A0E" />
      <circle cx="47.8" cy="54.2" r="0.8" fill="white" />
      <circle cx="65.8" cy="54.2" r="0.8" fill="white" />
      {/* brows */}
      <path
        d="M42 49 Q46 47 50 49"
        stroke="#3D2B1F"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M60 49 Q64 47 68 49"
        stroke="#3D2B1F"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
      {/* nose */}
      <path d="M55 58 L52 66 Q55 68 58 66 Z" fill="#F0A070" opacity="0.6" />
      {/* mouth */}
      <path
        d="M48 72 Q55 77 62 72"
        stroke="#C07040"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
      {/* stubble */}
      <ellipse cx="55" cy="74" rx="10" ry="5" fill="#C8A890" opacity="0.25" />
    </svg>
  );
}

// ── Female SVG Avatar ──────────────────────────────────────────────────────────
function FemaleAvatarSVG() {
  return (
    <svg
      width="110"
      height="130"
      viewBox="0 0 110 130"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* long hair back */}
      <ellipse cx="55" cy="50" rx="24" ry="30" fill="#4A2E1A" />
      <rect x="31" y="50" width="12" height="50" rx="6" fill="#4A2E1A" />
      <rect x="67" y="50" width="12" height="50" rx="6" fill="#4A2E1A" />
      {/* skin */}
      <ellipse cx="55" cy="58" rx="21" ry="24" fill="#FDD5B0" />
      {/* neck */}
      <rect x="47" y="79" width="16" height="13" rx="4" fill="#FDD5B0" />
      {/* blouse */}
      <path d="M18 130 Q18 96 55 93 Q92 96 92 130 Z" fill="#0D9488" />
      <path d="M55 93 L48 100 Q52 106 55 112 Q58 106 62 100 Z" fill="#0A7A6F" />
      {/* hair top / part */}
      <ellipse cx="55" cy="36" rx="21" ry="11" fill="#4A2E1A" />
      <path
        d="M55 26 Q55 35 55 38"
        stroke="#6B4226"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* ears */}
      <ellipse cx="34" cy="56" rx="4" ry="5.5" fill="#F0C090" />
      <ellipse cx="76" cy="56" rx="4" ry="5.5" fill="#F0C090" />
      {/* earrings */}
      <circle cx="34" cy="63" r="2" fill="#0D9488" />
      <circle cx="76" cy="63" r="2" fill="#0D9488" />
      {/* eyes — larger, feminine */}
      <ellipse cx="46" cy="53" rx="4.5" ry="5" fill="white" />
      <ellipse cx="64" cy="53" rx="4.5" ry="5" fill="white" />
      <circle cx="47" cy="54" r="3" fill="#2C1A0E" />
      <circle cx="65" cy="54" r="3" fill="#2C1A0E" />
      <circle cx="47.8" cy="53.2" r="1" fill="white" />
      <circle cx="65.8" cy="53.2" r="1" fill="white" />
      {/* lashes */}
      <path
        d="M42 48.5 L40 46"
        stroke="#2C1A0E"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M45 47.5 L44 45"
        stroke="#2C1A0E"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M48 47 L48 44.5"
        stroke="#2C1A0E"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M62 47.5 L62 44.5"
        stroke="#2C1A0E"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M65 47.5 L66 45"
        stroke="#2C1A0E"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M68 48.5 L70 46"
        stroke="#2C1A0E"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      {/* brows — arched */}
      <path
        d="M41 48 Q46 45 51 47"
        stroke="#4A2E1A"
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M59 47 Q64 45 69 48"
        stroke="#4A2E1A"
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />
      {/* nose */}
      <path
        d="M55 57 L52.5 64 Q55 66.5 57.5 64 Z"
        fill="#E8A070"
        opacity="0.5"
      />
      {/* lips */}
      <path d="M47 71 Q51 69 55 70 Q59 69 63 71" fill="#E07050" />
      <path
        d="M47 71 Q55 75 63 71 Q59 73 55 73.5 Q51 73 47 71 Z"
        fill="#C05040"
      />
      {/* blush */}
      <ellipse cx="42" cy="65" rx="6" ry="4" fill="#F08060" opacity="0.2" />
      <ellipse cx="68" cy="65" rx="6" ry="4" fill="#F08060" opacity="0.2" />
    </svg>
  );
}

// ── Progress bar chart — clean professional vertical bars ─────────────────────
function ProgressBarChart({ weekData }: { weekData: WeekDay[] }) {
  const MAX_BAR_H = 52;
  const STD_HOURS = 9;
  const maxHours = Math.max(STD_HOURS, ...weekData.map((d) => d.hours ?? 0));

  return (
    <div className="mt-4 mb-1">
      {/* Chart area */}
      <div
        className="flex items-end gap-1.5"
        style={{ height: `${MAX_BAR_H + 20}px` }}
      >
        {weekData.map((day, i) => {
          const hours = day.hours ?? 0;
          const pct = day.is_leave ? 0.25 : hours > 0 ? hours / maxHours : 0;
          const barH = Math.max(3, Math.round(pct * MAX_BAR_H));

          const barColor =
            day.is_future || (!day.is_leave && hours === 0)
              ? "var(--border)"
              : day.is_leave
                ? "#FED7AA"
                : day.is_today
                  ? C.barActive
                  : C.barInactive;

          return (
            <div
              key={i}
              className="flex flex-col items-center flex-1"
              style={{
                height: `${MAX_BAR_H + 20}px`,
                justifyContent: "flex-end",
              }}
            >
              {/* hours label — only for days with data */}
              <div
                className="text-[9px] font-semibold mb-1 tabular-nums"
                style={{
                  color:
                    hours > 0 && !day.is_future
                      ? day.is_today
                        ? "#fff"
                        : C.darkTeal
                      : "transparent",
                  background:
                    day.is_today && hours > 0 ? C.barActive : "transparent",
                  borderRadius: day.is_today && hours > 0 ? 4 : 0,
                  padding: day.is_today && hours > 0 ? "1px 4px" : undefined,
                  lineHeight: 1.6,
                }}
              >
                {hours > 0 ? `${hours.toFixed(1)}` : "·"}
              </div>
              {/* bar */}
              <div
                style={{
                  width: "100%",
                  height: `${barH}px`,
                  background: barColor,
                  borderRadius: "3px 3px 2px 2px",
                  transition: "height 0.5s ease",
                  minHeight: "3px",
                  position: "relative",
                }}
              >
                {day.is_leave && (
                  <div
                    style={{
                      position: "absolute",
                      top: "-14px",
                      left: "50%",
                      transform: "translateX(-50%)",
                      fontSize: "8px",
                      fontWeight: 600,
                      color: "#C2410C",
                      whiteSpace: "nowrap",
                    }}
                  >
                    L
                  </div>
                )}
              </div>
              {/* day label */}
              <div
                className="text-[10px] mt-1.5 font-medium"
                style={{
                  color: day.is_today ? C.darkTeal : "#9CA3AF",
                  fontWeight: day.is_today ? 700 : 500,
                }}
              >
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
function TimeTrackerCard({
  token,
  onNav,
}: {
  token: string;
  onNav: (p: NavPage) => void;
}) {
  const [todayLog, setTodayLog] = useState<TodayLog | null | undefined>(
    undefined,
  ); // undefined = loading
  const [elapsedSec, setElapsedSec] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const ivRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchToday = useCallback(async () => {
    const data = await apiFetch(token, "/attendance/today/");
    setTodayLog(data ?? null);
  }, [token]);

  useEffect(() => {
    fetchToday();
  }, [fetchToday]);

  // Real-time elapsed counter
  useEffect(() => {
    if (!todayLog?.check_in) {
      setElapsedSec(0);
      return;
    }
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
    return () => {
      if (ivRef.current) clearInterval(ivRef.current);
    };
  }, [todayLog]);

  const h = Math.floor(elapsedSec / 3600);
  const m = Math.floor((elapsedSec % 3600) / 60);
  const display = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

  const r = 52;
  const circ = 2 * Math.PI * r;
  const maxSec = 8 * 3600;
  const offset = circ * (1 - Math.min(elapsedSec / maxSec, 1));

  const isClockedIn = !!todayLog?.check_in && !todayLog?.check_out;
  const isClockedOut = !!todayLog?.check_out;

  async function handleClockIn() {
    setError("");
    setActionLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    const res = await apiPost(token, "/attendance/check-in/", {
      date: today,
      status: "PRESENT",
    });
    if (res?.error) setError(res.error);
    else await fetchToday();
    setActionLoading(false);
  }

  async function handleClockOut() {
    if (!isClockedIn) {
      setError("Clock in first before clocking out.");
      return;
    }
    setError("");
    setActionLoading(true);
    const res = await apiPost(token, "/attendance/check-out/");
    if (res?.error) setError(res.error);
    else await fetchToday();
    setActionLoading(false);
  }

  return (
    <div
      className="p-5"
      style={{
        borderRadius: 20,
        background: C.cardBg,
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        border: `1px solid ${C.tealBorder}`,
        boxShadow: "var(--cardShadow)",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold" style={{ color: C.textDark }}>
          Time tracker
        </span>
        <button
          onClick={() => onNav("attendance")}
          className="w-6 h-6 rounded-full flex items-center justify-center hover:opacity-70"
          style={{ background: C.tealPale }}
        >
          <svg width="10" height="10" fill="none" viewBox="0 0 24 24">
            <path
              d="M7 17L17 7M17 7H7M17 7v10"
              stroke={C.teal}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {/* Donut */}
      <div className="flex flex-col items-center">
        <div className="relative w-32 h-32">
          <svg
            width="128"
            height="128"
            viewBox="0 0 128 128"
            style={{ transform: "rotate(-90deg)" }}
          >
            {/* Dashed track ring */}
            <circle
              cx="64"
              cy="64"
              r={r}
              fill="none"
              stroke={C.timerDash}
              strokeWidth="3"
              strokeDasharray="5 5"
              strokeLinecap="round"
            />
            {/* Solid elapsed arc */}
            <circle
              cx="64"
              cy="64"
              r={r}
              fill="none"
              stroke={isClockedIn || isClockedOut ? C.teal : "transparent"}
              strokeWidth="5"
              strokeDasharray={circ}
              strokeDashoffset={offset}
              strokeLinecap="round"
              style={{ transition: "stroke-dashoffset 1s linear" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div
              style={{
                fontFamily: "'Outfit', sans-serif",
                fontWeight: 700,
                fontSize: "1.45rem",
                letterSpacing: "-0.02em",
                color: C.textDark,
                lineHeight: 1,
              }}
            >
              {display}
            </div>
            <div
              style={{
                fontFamily: "'Outfit', sans-serif",
                fontSize: "0.65rem",
                fontWeight: 500,
                color: C.textMuted,
                marginTop: 4,
                letterSpacing: "0.04em",
              }}
            >
              Work Time
            </div>
          </div>
        </div>

        {/* Check-in time badge */}
        {todayLog?.check_in && (
          <div
            className="mt-2 text-[10px] font-medium"
            style={{ color: C.textMuted }}
          >
            In:{" "}
            {new Date(todayLog.check_in).toLocaleTimeString("en-IN", {
              hour: "2-digit",
              minute: "2-digit",
            })}
            {todayLog.check_out && (
              <span className="ml-2">
                Out:{" "}
                {new Date(todayLog.check_out).toLocaleTimeString("en-IN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-2 mt-3 w-full">
          <button
            onClick={handleClockIn}
            disabled={actionLoading || isClockedIn || isClockedOut}
            className="flex-1 py-2 text-xs font-semibold transition-all disabled:opacity-40"
            style={{
              background: C.teal,
              color: "white",
              borderRadius: 999,
              border: "none",
              cursor: "pointer",
            }}
          >
            {isClockedIn || isClockedOut ? "Clocked In ✓" : "Clock In"}
          </button>
          <button
            onClick={handleClockOut}
            disabled={actionLoading || !isClockedIn}
            className="flex-1 py-2 text-xs font-semibold transition-all disabled:opacity-40"
            style={{
              borderRadius: 999,
              border: "none",
              cursor: "pointer",
              background: isClockedIn ? C.darkTeal : C.tealPale,
              color: isClockedIn ? "white" : C.textMuted,
            }}
          >
            {isClockedOut ? "Clocked Out ✓" : "Clock Out"}
          </button>
        </div>
        {error && (
          <div className="mt-2 text-[10px] text-red-500 text-center">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Team Insights ──────────────────────────────────────────────────────────────
const STATUS_META = {
  PRESENT: { label: "In Office", dot: "#0D9488", bg: "#CCFBF1" },
  WFH: { label: "WFH", dot: "#F59E0B", bg: "#FEF3C7" },
  ON_LEAVE: { label: "On Leave", dot: "#F87171", bg: "#FEE2E2" },
  ABSENT: { label: "Absent", dot: "#9CA3AF", bg: "#F3F4F6" },
};
const AV_BG = [
  "#0D9488",
  "#134E4A",
  "#F97316",
  "#8B5CF6",
  "#EC4899",
  "#3B82F6",
  "#14B8A6",
  "#D97706",
];

function TeamInsightsCard({
  teamStatus,
  loading,
}: {
  teamStatus: TeamStatus | null;
  loading: boolean;
}) {
  const dr = teamStatus?.direct_reports ?? [];
  const peers = teamStatus?.peers ?? [];
  const cnt = (arr: TeamMember[], s: string) =>
    arr.filter((m) => m.status === s).length;
  const Pill = ({
    c,
    l,
    co,
    bg,
  }: {
    c: number;
    l: string;
    co: string;
    bg: string;
  }) => (
    <div
      className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold flex-shrink-0"
      style={{ background: bg, color: co }}
    >
      <div className="w-1 h-1 rounded-full" style={{ background: co }} />
      {c} {l}
    </div>
  );
  const Row = ({ m, i }: { m: TeamMember; i: number }) => {
    const meta = STATUS_META[m.status] || STATUS_META.PRESENT;
    const init = m.name
      .split(" ")
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
    return (
      <div
        className="flex items-center gap-2.5 py-1.5"
        style={{ borderTop: i > 0 ? `1px solid ${C.tealPale}` : "none" }}
      >
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
          style={{ background: AV_BG[i % AV_BG.length] }}
        >
          {init}
        </div>
        <div className="flex-1 min-w-0">
          <div
            className="text-[11px] font-semibold truncate"
            style={{ color: C.textDark }}
          >
            {m.name}
          </div>
          <div className="text-[9px] truncate" style={{ color: C.textMuted }}>
            {m.title || m.department}
          </div>
        </div>
        <div
          className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-medium flex-shrink-0"
          style={{ background: meta.bg, color: meta.dot }}
        >
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: meta.dot }}
          />
          {meta.label}
        </div>
      </div>
    );
  };

  return (
    <div
      className="p-5"
      style={{
        borderRadius: 20,
        background: C.cardBg,
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        border: `1px solid ${C.tealBorder}`,
        boxShadow: "var(--cardShadow)",
      }}
    >
      <div className="text-sm font-semibold mb-3" style={{ color: C.textDark }}>
        Team Insights · Today
      </div>
      {loading ? (
        [1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-9 mb-2 rounded-xl animate-pulse"
            style={{ background: C.tealPale }}
          />
        ))
      ) : (
        <>
          {dr.length > 0 && (
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <span
                  className="text-[10px] font-semibold uppercase tracking-wide"
                  style={{ color: C.textMuted }}
                >
                  My Team ({dr.length})
                </span>
                <div className="flex gap-1">
                  <Pill
                    c={cnt(dr, "PRESENT")}
                    l="Office"
                    co={STATUS_META.PRESENT.dot}
                    bg={STATUS_META.PRESENT.bg}
                  />
                  <Pill
                    c={cnt(dr, "WFH")}
                    l="WFH"
                    co={STATUS_META.WFH.dot}
                    bg={STATUS_META.WFH.bg}
                  />
                  <Pill
                    c={cnt(dr, "ON_LEAVE")}
                    l="Leave"
                    co={STATUS_META.ON_LEAVE.dot}
                    bg={STATUS_META.ON_LEAVE.bg}
                  />
                </div>
              </div>
              <div>
                {dr.slice(0, 5).map((m, i) => (
                  <Row key={m.id} m={m} i={i} />
                ))}
              </div>
            </div>
          )}
          {peers.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span
                  className="text-[10px] font-semibold uppercase tracking-wide"
                  style={{ color: C.textMuted }}
                >
                  My Peers ({peers.length})
                </span>
                <div className="flex gap-1">
                  <Pill
                    c={cnt(peers, "PRESENT")}
                    l="Office"
                    co={STATUS_META.PRESENT.dot}
                    bg={STATUS_META.PRESENT.bg}
                  />
                  <Pill
                    c={cnt(peers, "WFH")}
                    l="WFH"
                    co={STATUS_META.WFH.dot}
                    bg={STATUS_META.WFH.bg}
                  />
                  <Pill
                    c={cnt(peers, "ON_LEAVE")}
                    l="Leave"
                    co={STATUS_META.ON_LEAVE.dot}
                    bg={STATUS_META.ON_LEAVE.bg}
                  />
                </div>
              </div>
              <div>
                {peers.slice(0, 5).map((m, i) => (
                  <Row key={m.id} m={m} i={i + 10} />
                ))}
              </div>
            </div>
          )}
          {dr.length === 0 && peers.length === 0 && (
            <div
              className="text-sm text-center py-6"
              style={{ color: C.textMuted }}
            >
              No team data
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Org Insights — real data, matches Image #8 ────────────────────────────────
function OrgInsightsCard({
  orgStats,
  loading,
}: {
  orgStats: OrgStats | null;
  loading: boolean;
}) {
  const depts = orgStats?.by_dept?.slice(0, 5) ?? [];
  const maxCount = Math.max(...depts.map((d) => d.count), 1);
  const bs = orgStats?.by_status ?? {
    present: 0,
    wfh: 0,
    on_leave: 0,
    absent: 0,
  };
  const total = orgStats?.total ?? 0;
  const presentPct =
    total > 0 ? Math.round(((bs.present + bs.wfh) / total) * 100) : 0;

  return (
    <div
      className="p-5"
      style={{
        borderRadius: 20,
        background: C.cardBg,
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        border: `1px solid ${C.tealBorder}`,
        boxShadow: "var(--cardShadow)",
      }}
    >
      <div className="text-sm font-semibold mb-4" style={{ color: C.textDark }}>
        Org Insights
      </div>

      {/* Presence bar — full width, two-tone like Image #8 */}
      <div className="mb-1">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs" style={{ color: C.textMuted }}>
            Today's presence
          </span>
          <span className="text-xs font-bold" style={{ color: C.textDark }}>
            {loading ? "—" : `${total} total`}
          </span>
        </div>
        <div
          className="relative h-3 rounded-full overflow-hidden"
          style={{ background: C.tealPale }}
        >
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${presentPct}%`, background: C.darkTeal }}
          />
        </div>
        {/* Legend */}
        <div className="flex items-center gap-4 mt-2">
          {[
            { dot: C.teal, label: "Office", val: bs.present },
            { dot: "#F59E0B", label: "WFH", val: bs.wfh },
            { dot: "#F87171", label: "Leave", val: bs.on_leave },
            { dot: "#D1D5DB", label: "Absent", val: bs.absent },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-1.5">
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: item.dot }}
              />
              <span className="text-[11px]" style={{ color: C.textMuted }}>
                <span className="font-semibold" style={{ color: C.textDark }}>
                  {item.val}
                </span>{" "}
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Dept breakdown — two-tone bars matching Image #8 */}
      <div className="mt-5">
        <div
          className="text-[10px] font-bold uppercase tracking-widest mb-3"
          style={{ color: C.textMuted }}
        >
          By Department
        </div>
        {loading
          ? [1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="h-5 mb-3 rounded animate-pulse"
                style={{ background: C.tealPale }}
              />
            ))
          : depts.map((dept) => (
              <div key={dept.name} className="flex items-center gap-3 mb-3">
                <div
                  className="text-[11px] truncate flex-shrink-0 font-medium"
                  style={{ color: C.textDark, width: "100px" }}
                  title={dept.name}
                >
                  {dept.name.length > 14
                    ? dept.name.slice(0, 13) + "…"
                    : dept.name}
                </div>
                {/* Two-tone bar: filled dark teal + unfilled teal-pale */}
                <div
                  className="flex-1 h-2.5 rounded-full overflow-hidden flex"
                  style={{ background: C.tealPale }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${(dept.count / maxCount) * 100}%`,
                      background: C.darkTeal,
                    }}
                  />
                </div>
                <div
                  className="text-xs font-bold flex-shrink-0 w-5 text-right"
                  style={{ color: C.textDark }}
                >
                  {dept.count}
                </div>
              </div>
            ))}
      </div>
    </div>
  );
}

// ── My Leaves ──────────────────────────────────────────────────────────────────
const TYPE_SHORT: Record<string, string> = {
  CL: "Casual",
  SL: "Sick",
  PL: "Privilege",
  LOP: "LOP",
  CO: "Comp Off",
};
function MyLeavesCard({
  myLeaves,
  loading,
  onNav,
}: {
  myLeaves: MyLeave[];
  loading: boolean;
  onNav: (p: NavPage) => void;
}) {
  const SC: Record<string, string> = {
    PENDING: "#F59E0B",
    APPROVED: "#10B981",
    REJECTED: "#F87171",
    CANCELLED: "#9CA3AF",
  };
  const today = new Date().toISOString().split("T")[0];
  return (
    <div
      className="p-5"
      style={{
        borderRadius: 20,
        background: C.cardBg,
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        border: `1px solid ${C.tealBorder}`,
        boxShadow: "var(--cardShadow)",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold" style={{ color: C.textDark }}>
          My Leaves
        </span>
        <button
          onClick={() => onNav("leaves")}
          className="text-xs font-medium hover:underline"
          style={{ color: C.teal }}
        >
          + Apply
        </button>
      </div>
      {loading ? (
        [1, 2].map((i) => (
          <div
            key={i}
            className="h-10 mb-2 rounded-xl animate-pulse"
            style={{ background: C.tealPale }}
          />
        ))
      ) : myLeaves.length === 0 ? (
        <div
          className="text-sm py-4 text-center"
          style={{ color: C.textMuted }}
        >
          No leaves found
        </div>
      ) : (
        <div className="space-y-2">
          {myLeaves.slice(0, 5).map((l) => {
            const isUpcoming = l.from_date >= today;
            return (
              <div
                key={l.id}
                className="flex items-center gap-2 py-1.5"
                style={{ borderBottom: `1px solid ${C.tealBorder}` }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="text-xs font-semibold"
                      style={{ color: C.textDark }}
                    >
                      {TYPE_SHORT[l.leave_type] ?? l.leave_type}
                    </span>
                    {isUpcoming && (
                      <span
                        className="text-[8px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{ background: "#DBEAFE", color: "#1E40AF" }}
                      >
                        upcoming
                      </span>
                    )}
                  </div>
                  <div className="text-[10px]" style={{ color: C.textMuted }}>
                    {l.from_date} → {l.to_date} · {l.days_count}d
                  </div>
                </div>
                <div
                  className="flex items-center gap-1 text-[10px] font-semibold flex-shrink-0"
                  style={{ color: SC[l.status] || "#9CA3AF" }}
                >
                  <div
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: SC[l.status] || "#9CA3AF" }}
                  />
                  {l.status.charAt(0) + l.status.slice(1).toLowerCase()}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <button
        onClick={() => onNav("leaves")}
        className="w-full mt-3 py-1.5 text-[11px] font-semibold hover:opacity-80 transition-opacity"
        style={{
          background: C.tealPale,
          color: C.darkTeal,
          borderRadius: 999,
          border: "none",
          cursor: "pointer",
        }}
      >
        View all leaves →
      </button>
    </div>
  );
}

// ── Pending Approvals ──────────────────────────────────────────────────────────
const STATUS_PILL: Record<
  string,
  { bg: string; color: string; label: string }
> = {
  PENDING: { bg: "#FEF3C7", color: "#92400E", label: "Pending" },
  APPROVED: { bg: "#D1FAE5", color: "#065F46", label: "Approved" },
  REJECTED: { bg: "#FEE2E2", color: "#991B1B", label: "Rejected" },
  CANCELLED: { bg: "#F3F4F6", color: "#6B7280", label: "Cancelled" },
};

const REQ_ICON: Record<string, string> = {
  leave: "🏖",
  regularization: "📋",
  wfh: "🏠",
  comp_off: "🕒",
  roadmap: "🚀",
};
const TEAM_ICON: Record<TeamApprovalType, string> = {
  leave: "🏖",
  regularization: "📋",
  wfh: "🏠",
  comp_off: "🕒",
  roadmap: "🚀",
};

function PendingApprovalsCard({
  loading,
  teamApprovals,
  myLeaves,
  myRequests,
  isManager,
  renotifyLoading,
  onApprove,
  onReject,
  onRenotify,
}: {
  loading: boolean;
  teamApprovals: TeamApprovalItem[];
  myLeaves: MyLeave[];
  myRequests: MyRequest[];
  isManager: boolean;
  renotifyLoading: number | null;
  onApprove: (item: TeamApprovalItem) => void;
  onReject: (item: TeamApprovalItem) => void;
  onRenotify: (id: number, type: string) => void;
}) {
  return (
    <div
      className="p-5 flex flex-col gap-5"
      style={{
        borderRadius: 20,
        background: C.cardBg,
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        border: `1px solid ${C.tealBorder}`,
        boxShadow: "var(--cardShadow)",
      }}
    >
      {/* Section 1 — Team actions waiting on manager (manager only) */}
      {isManager && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <span
              className="text-sm font-semibold"
              style={{ color: C.textDark }}
            >
              Team Approvals
            </span>
            {teamApprovals.length > 0 && (
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: "#FEF3C7", color: "#92400E" }}
              >
                {teamApprovals.length} pending
              </span>
            )}
          </div>
          <div
            className="space-y-2.5 overflow-y-auto"
            style={{ maxHeight: "220px", scrollbarWidth: "none" }}
          >
            {loading ? (
              [1, 2].map((i) => (
                <div
                  key={i}
                  className="h-12 rounded-xl animate-pulse"
                  style={{ background: C.tealPale }}
                />
              ))
            ) : teamApprovals.length === 0 ? (
              <div
                className="text-xs text-center py-5"
                style={{ color: C.textMuted }}
              >
                No team approvals pending
              </div>
            ) : (
              teamApprovals.map((item, idx) => {
                const init = (item.employee_name || "?")
                  .split(" ")
                  .map((w) => w[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase();
                return (
                  <div
                    key={`${item.type}-${item.id}`}
                    className="flex items-center gap-2.5 p-2 rounded-xl"
                    style={{ background: "var(--primary-pale)" }}
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                      style={{ background: AV_BG[idx % AV_BG.length] }}
                    >
                      {init}
                    </div>
                    <div className="text-base flex-shrink-0">
                      {TEAM_ICON[item.type]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div
                        className="text-xs font-semibold truncate"
                        style={{ color: C.textDark }}
                      >
                        {item.employee_name}
                      </div>
                      <div
                        className="text-[10px] font-semibold truncate"
                        style={{ color: C.textDark }}
                      >
                        {item.title}
                      </div>
                      <div
                        className="text-[10px]"
                        style={{ color: C.textMuted }}
                      >
                        {item.sub}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => onApprove(item)}
                        className="px-2 py-1 rounded-full text-[10px] font-semibold hover:opacity-80"
                        style={{ background: C.teal, color: "white" }}
                      >
                        ✓
                      </button>
                      <button
                        onClick={() => onReject(item)}
                        className="px-2 py-1 rounded-full text-[10px] font-semibold hover:opacity-80"
                        style={{ background: "#F87171", color: "white" }}
                      >
                        ✗
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Divider — only when manager */}
      {isManager && (
        <div style={{ borderTop: "1px solid var(--card-border)" }} />
      )}

      {/* Section 2 — My pending requests (all roles) */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold" style={{ color: C.textDark }}>
            My Requests
          </span>
          {myRequests.length > 0 && (
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: "#FEF3C7", color: "#92400E" }}
            >
              {myRequests.length} pending
            </span>
          )}
        </div>
        <div
          className="space-y-2 overflow-y-auto"
          style={{ maxHeight: "240px", scrollbarWidth: "none" }}
        >
          {loading ? (
            [1, 2].map((i) => (
              <div
                key={i}
                className="h-10 rounded-xl animate-pulse"
                style={{ background: C.tealPale }}
              />
            ))
          ) : myRequests.length === 0 ? (
            <div
              className="text-xs text-center py-6"
              style={{ color: C.textMuted }}
            >
              No pending requests
            </div>
          ) : (
            myRequests.map((r) => (
              <div
                key={`${r.type}-${r.id}`}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl"
                style={{
                  border: "1px solid var(--card-border)",
                  background: "var(--primary-pale)",
                }}
              >
                <span className="text-base flex-shrink-0">
                  {REQ_ICON[r.type]}
                </span>
                <div className="flex-1 min-w-0">
                  <div
                    className="text-xs font-semibold truncate"
                    style={{ color: C.textDark }}
                  >
                    {r.label}
                  </div>
                  <div className="text-[10px]" style={{ color: C.textMuted }}>
                    {r.sub}
                  </div>
                </div>
                <button
                  onClick={() => onRenotify(r.id, r.type)}
                  disabled={renotifyLoading === r.id}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold flex-shrink-0 hover:opacity-80 disabled:opacity-50 transition-opacity"
                  style={{
                    border: `1px solid ${C.teal}`,
                    color: C.teal,
                    background: "transparent",
                  }}
                  title="Remind manager"
                >
                  {renotifyLoading === r.id ? "…" : "🔔 Remind"}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── NewsFeedCard ───────────────────────────────────────────────────────────────
interface NewsArticle {
  title: string;
  url: string;
  pub: string;
  summary: string;
  source: string;
  tag: string;
  color: string;
}

const TAG_LABELS: Record<string, string> = {
  "supply-chain": "Supply Chain",
  ai: "AI",
  technology: "Tech",
};
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
    apiFetch(token, "/ai/news/").then((d) => {
      if (d?.articles) {
        setArticles(d.articles);
        setLastFetched(new Date());
      }
      setLoading(false);
    });
  }, [token]);

  const filtered =
    tag === "all" ? articles : articles.filter((a) => a.tag === tag);

  return (
    <div
      className="overflow-hidden"
      style={{
        borderRadius: 20,
        background: C.cardBg,
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        border: `1px solid ${C.tealBorder}`,
        boxShadow: "var(--cardShadow)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div>
          <div className="text-sm font-bold" style={{ color: C.textDark }}>
            Industry News
          </div>
          {lastFetched && (
            <div className="text-[10px] mt-0.5" style={{ color: C.textMuted }}>
              Updated{" "}
              {lastFetched.toLocaleTimeString("en-IN", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <div
            className="w-1.5 h-1.5 rounded-full animate-pulse"
            style={{ background: C.teal }}
          />
          <span className="text-[10px] font-semibold" style={{ color: C.teal }}>
            LIVE
          </span>
        </div>
      </div>

      {/* Tag filters */}
      <div className="flex gap-1 px-4 pb-3">
        {TAGS.map((t) => (
          <button
            key={t}
            onClick={() => setTag(t)}
            className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold transition-all"
            style={
              tag === t
                ? { background: C.darkTeal, color: "#fff" }
                : {
                    background: "var(--surface2)",
                    color: C.textMuted,
                    border: "1px solid var(--border)",
                  }
            }
          >
            {t === "all" ? "All" : TAG_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Feed */}
      <div
        className="max-h-72 overflow-y-auto"
        style={{ scrollbarWidth: "none" }}
      >
        {loading ? (
          <div className="px-4 pb-4 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-1.5">
                <div
                  className="h-3 rounded-full animate-pulse w-full"
                  style={{ background: "var(--accentLight)" }}
                />
                <div
                  className="h-2.5 rounded-full animate-pulse w-3/4"
                  style={{ background: "var(--accentLight)" }}
                />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div
            className="px-4 pb-6 text-center text-xs"
            style={{ color: C.textMuted }}
          >
            No articles found
          </div>
        ) : (
          <div>
            {filtered.map((a, i) => (
              <a
                key={i}
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-2.5 px-4 py-3 group transition-colors no-underline overflow-hidden"
                style={{
                  display: "flex",
                  borderTop: i > 0 ? "1px solid var(--border)" : "none",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "var(--surface2)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "transparent")
                }
              >
                <div
                  className="w-1 h-1 rounded-full mt-1.5 flex-shrink-0"
                  style={{ background: a.color }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span
                      className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
                      style={{
                        background: "var(--accentLight)",
                        color: a.color,
                      }}
                    >
                      {a.source}
                    </span>
                  </div>
                  <div
                    className="text-xs font-semibold leading-snug group-hover:underline"
                    style={{ color: C.textDark }}
                  >
                    {a.title}
                  </div>
                  {a.summary && (
                    <div
                      className="text-[10px] mt-0.5 line-clamp-2 leading-relaxed break-words"
                      style={{ color: C.textMuted }}
                    >
                      {sanitizeNewsText(a.summary)}
                    </div>
                  )}
                </div>
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  className="flex-shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <path
                    d="M7 17L17 7M17 7H7M17 7v10"
                    stroke={C.teal}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
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
export default function Dashboard({
  token,
  role,
  userName,
  onNav,
}: DashboardProps) {
  const [balance, setBalance] = useState<LeaveBalance | null>(null);
  const [teamApprovals, setTeamApprovals] = useState<TeamApprovalItem[]>([]);
  const [myLeaves, setMyLeaves] = useState<MyLeave[]>([]);
  const [myRequests, setMyRequests] = useState<MyRequest[]>([]);
  const [teamStatus, setTeamStatus] = useState<TeamStatus | null>(null);
  const [orgStats, setOrgStats] = useState<OrgStats | null>(null);
  const [weekData, setWeekData] = useState<WeekDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [renotifyLoading, setRenotifyLoading] = useState<number | null>(null);

  const firstName = userName.split(" ")[0] || "User";
  const quote = useMemo(
    () => QUOTES[Math.floor(Math.random() * QUOTES.length)],
    [],
  );
  const isManager = ["manager", "hr", "cfo", "admin"].includes(role);
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [
        bal,
        pendingLeavesRes,
        mine,
        team,
        week,
        org,
        regsRes,
        wfhsRes,
        compOffRes,
        roadmapsRes,
        myRegsRes,
        myWfhsRes,
        myCompOffRes,
        myRoadmapsRes,
      ] = await Promise.all([
        apiFetch(token, "/leaves/balance/"),
        isManager ? apiFetch(token, "/leaves/pending/") : Promise.resolve(null),
        apiFetch(token, "/leaves/?limit=50"),
        apiFetch(token, "/employees/team-status/"),
        apiFetch(token, "/attendance/week/"),
        apiFetch(token, "/attendance/org-insights/"),
        apiFetch(token, "/attendance/regularization/?status=PENDING&limit=50"),
        apiFetch(token, "/attendance/wfh/?status=PENDING&limit=50"),
        isManager
          ? apiFetch(token, "/leaves/comp-off/pending/")
          : Promise.resolve(null),
        isManager
          ? apiFetch(token, "/upskilling/roadmaps/pending/")
          : Promise.resolve(null),
        apiFetch(
          token,
          "/attendance/regularization/?status=PENDING&scope=me&limit=50",
        ),
        apiFetch(token, "/attendance/wfh/?status=PENDING&scope=me&limit=50"),
        apiFetch(token, "/leaves/comp-off/"),
        apiFetch(token, "/upskilling/roadmaps/"),
      ]);
      if (bal) setBalance(bal);
      if (isManager) {
        const pendingLeaves: PendingLeave[] = (pendingLeavesRes?.results ??
          (Array.isArray(pendingLeavesRes)
            ? pendingLeavesRes
            : [])) as PendingLeave[];
        const pendingRegs: PendingRegularization[] = (regsRes?.results ??
          (Array.isArray(regsRes) ? regsRes : [])) as PendingRegularization[];
        const pendingWfhs: PendingWFH[] = (wfhsRes?.results ??
          (Array.isArray(wfhsRes) ? wfhsRes : [])) as PendingWFH[];
        const pendingCompOffs: PendingCompOff[] = (compOffRes?.results ??
          (Array.isArray(compOffRes) ? compOffRes : [])) as PendingCompOff[];
        const pendingRoadmaps: PendingRoadmap[] = (
          Array.isArray(roadmapsRes) ? roadmapsRes : []
        ) as PendingRoadmap[];

        const approvals: TeamApprovalItem[] = [
          ...pendingLeaves.map((l) => ({
            id: l.id,
            type: "leave" as const,
            employee_name: l.employee_name,
            title: `${TYPE_SHORT[l.leave_type] ?? l.leave_type} Leave`,
            sub: `${l.from_date}${l.to_date && l.to_date !== l.from_date ? `–${l.to_date}` : ""} · ${l.days_count}d`,
          })),
          ...pendingRegs.map((r) => ({
            id: r.id,
            type: "regularization" as const,
            employee_name: r.employee_name,
            title: "Regularization",
            sub: r.date,
          })),
          ...pendingWfhs.map((w) => ({
            id: w.id,
            type: "wfh" as const,
            employee_name: w.employee_name,
            title: "WFH Request",
            sub: Array.isArray(w.dates)
              ? w.dates.slice(0, 2).join(", ") +
                (w.dates.length > 2 ? ` +${w.dates.length - 2}` : "")
              : "",
          })),
          ...pendingCompOffs.map((c) => ({
            id: c.id,
            type: "comp_off" as const,
            employee_name: c.employee_name,
            title: "Comp Off",
            sub: `${c.worked_on} · ${c.days_claimed}d`,
          })),
          ...pendingRoadmaps.map((rm) => ({
            id: rm.id,
            type: "roadmap" as const,
            employee_name: rm.employee_name,
            title: `Upskilling: ${rm.skill_name}`,
            sub: `${rm.step_count} steps · Pending approval`,
          })),
        ];
        setTeamApprovals(approvals);
      } else {
        setTeamApprovals([]);
      }
      if (mine) {
        const allLeaves: MyLeave[] =
          mine?.results ?? (Array.isArray(mine) ? mine : []);
        const today = new Date().toISOString().split("T")[0];
        const upcoming = allLeaves
          .filter((l: MyLeave) => l.from_date >= today)
          .sort((a: MyLeave, b: MyLeave) =>
            a.from_date.localeCompare(b.from_date),
          );
        const past = allLeaves
          .filter((l: MyLeave) => l.from_date < today)
          .sort((a: MyLeave, b: MyLeave) =>
            b.from_date.localeCompare(a.from_date),
          );
        setMyLeaves([...upcoming, ...past].slice(0, 5));

        // Build unified pending requests
        const pendingLeaveReqs: MyRequest[] = allLeaves
          .filter((l: MyLeave) => l.status === "PENDING")
          .map((l: MyLeave) => ({
            id: l.id,
            type: "leave" as const,
            label: `${TYPE_SHORT[l.leave_type] ?? l.leave_type} Leave`,
            sub: `${l.from_date}${l.to_date && l.to_date !== l.from_date ? `–${l.to_date}` : ""} · ${l.days_count}d`,
            status: "PENDING",
          }));

        const myRegs: { id: number; date: string }[] = (myRegsRes?.results ??
          (Array.isArray(myRegsRes) ? myRegsRes : [])) as {
          id: number;
          date: string;
        }[];
        const myWfhs: {
          id: number;
          dates?: string[];
          from_date?: string;
          to_date?: string;
        }[] = (myWfhsRes?.results ??
          (Array.isArray(myWfhsRes) ? myWfhsRes : [])) as {
          id: number;
          dates?: string[];
          from_date?: string;
          to_date?: string;
        }[];
        const myCompOffs: {
          id: number;
          worked_on: string;
          days_claimed: number;
          status: string;
        }[] = (
          (myCompOffRes?.results ??
            (Array.isArray(myCompOffRes) ? myCompOffRes : [])) as {
            id: number;
            worked_on: string;
            days_claimed: number;
            status: string;
          }[]
        ).filter((c) => (c.status ?? "").toUpperCase() === "PENDING");
        const myRoadmaps: {
          id: number;
          skill_name: string;
          status: string;
          step_count?: number;
        }[] = (
          (Array.isArray(myRoadmapsRes) ? myRoadmapsRes : []) as {
            id: number;
            skill_name: string;
            status: string;
            step_count?: number;
          }[]
        ).filter((r) => (r.status ?? "") === "PENDING_APPROVAL");

        const pendingRegReqs: MyRequest[] = myRegs.map((r) => ({
          id: r.id,
          type: "regularization" as const,
          label: "Regularization",
          sub: r.date ?? "",
          status: "PENDING",
        }));

        const pendingWFHReqs: MyRequest[] = myWfhs.map((w) => ({
          id: w.id,
          type: "wfh" as const,
          label: "WFH Request",
          sub: w.dates
            ? w.dates.slice(0, 2).join(", ") +
              (w.dates.length > 2 ? `+${w.dates.length - 2}` : "")
            : (w.from_date ?? ""),
          status: "PENDING",
        }));

        const pendingCompOffReqs: MyRequest[] = myCompOffs.map((c) => ({
          id: c.id,
          type: "comp_off" as const,
          label: "Comp Off",
          sub: `${c.worked_on} · ${c.days_claimed}d`,
          status: "PENDING",
        }));

        const pendingRoadmapReqs: MyRequest[] = myRoadmaps.map((r) => ({
          id: r.id,
          type: "roadmap" as const,
          label: `Upskilling: ${r.skill_name}`,
          sub: "Pending manager approval",
          status: "PENDING",
        }));

        setMyRequests([
          ...pendingLeaveReqs,
          ...pendingRegReqs,
          ...pendingWFHReqs,
          ...pendingCompOffReqs,
          ...pendingRoadmapReqs,
        ]);
      }
      if (team) setTeamStatus(team);
      if (week && Array.isArray(week)) setWeekData(week);
      if (org) setOrgStats(org);
      setLoading(false);
    }
    load();
  }, [token, isManager]);

  async function handleApprove(item: TeamApprovalItem) {
    if (item.type === "leave") {
      await apiPost(token, `/leaves/${item.id}/approve/`);
      showToast("Leave approved ✓");
    } else if (item.type === "regularization") {
      await apiPost(token, `/attendance/regularization/${item.id}/approve/`);
      showToast("Regularization approved ✓");
    } else if (item.type === "wfh") {
      await apiPost(token, `/attendance/wfh/${item.id}/approve/`);
      showToast("WFH approved ✓");
    } else if (item.type === "comp_off") {
      await apiPost(token, `/leaves/comp-off/${item.id}/approve/`);
      showToast("Comp off approved ✓");
    } else if (item.type === "roadmap") {
      await apiPost(token, `/upskilling/roadmaps/${item.id}/approve/`);
      showToast("Roadmap approved ✓");
    }
    setTeamApprovals((prev) =>
      prev.filter((a) => !(a.type === item.type && a.id === item.id)),
    );
  }
  async function handleReject(item: TeamApprovalItem) {
    if (item.type === "leave") {
      await apiPost(token, `/leaves/${item.id}/reject/`, {
        rejection_reason: "Declined by manager",
      });
      showToast("Leave rejected");
    } else if (item.type === "regularization") {
      await apiPost(token, `/attendance/regularization/${item.id}/reject/`, {
        rejection_reason: "Declined by manager",
      });
      showToast("Regularization rejected");
    } else if (item.type === "wfh") {
      await apiPost(token, `/attendance/wfh/${item.id}/reject/`, {
        rejection_reason: "Declined by manager",
      });
      showToast("WFH rejected");
    } else if (item.type === "comp_off") {
      await apiPost(token, `/leaves/comp-off/${item.id}/reject/`, {
        rejection_reason: "Declined by manager",
      });
      showToast("Comp off rejected");
    } else if (item.type === "roadmap") {
      await apiPost(token, `/upskilling/roadmaps/${item.id}/reject/`, {
        feedback: "Please revise the roadmap and resubmit.",
      });
      showToast("Roadmap rejected");
    }
    setTeamApprovals((prev) =>
      prev.filter((a) => !(a.type === item.type && a.id === item.id)),
    );
  }

  async function handleRenotify(id: number, type: string) {
    setRenotifyLoading(id);
    try {
      if (type !== "leave") {
        showToast("Manager notified ✓");
        return;
      }
      const res = await apiPost(token, "/notifications/renotify/", {
        leave_id: id,
      });
      if (res?.status === "limit_reached")
        showToast("Renotify limit reached (max 3)");
      else if (res?.status === "cooldown")
        showToast(
          `Wait ${res.next_available_in_minutes ?? "?"}m before re-notifying`,
        );
      else showToast("Manager notified ✓");
    } catch {
      showToast("Renotify failed");
    } finally {
      setRenotifyLoading(null);
    }
  }

  const totalLeave =
    (balance?.casual_remaining ?? 0) +
    (balance?.privilege_remaining ?? 0) +
    (balance?.sick_remaining ?? 0) +
    (balance?.comp_off_remaining ?? 0);

  return (
    <div className="min-h-full p-6" style={{ background: "transparent" }}>
      {toast && (
        <div
          className="fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-semibold shadow-xl"
          style={{ background: C.darkTeal, color: "#FFFFFF" }}
        >
          {toast}
        </div>
      )}

      {/* ── WELCOME HEADER ───────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1
            className="mb-1"
            style={{
              fontSize: 36,
              color: C.textDark,
              letterSpacing: "-0.03em",
              fontWeight: 250,
              lineHeight: 1.1,
            }}
          >
            Welcome in, {firstName}
          </h1>
          <p className="text-sm italic" style={{ color: C.textMuted }}>
            "{quote.text}"
            {quote.author ? (
              <span className="not-italic font-medium"> — {quote.author}</span>
            ) : null}
          </p>
        </div>
      </div>

      {/* ── MAIN GRID ────────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gap: 10,
          gridTemplateColumns: "280px 1fr 270px 300px",
          alignItems: "start",
        }}
      >
        {/* COL 1: Profile card + accordions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div
            className="relative overflow-hidden cursor-pointer"
            style={{
              borderRadius: 20,
              height: "240px",
              background:
                "linear-gradient(170deg,#b8d4f8 0%,#c8dffc 60%,#d4e8ff 100%)",
            }}
            onClick={() => onNav("employees")}
          >
            <img
              src={profilePhoto}
              alt={userName || "Employee"}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: "top center",
              }}
            />
            {/* Bottom blur fading upward */}
            <div
              aria-hidden
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height: "55%",
                backdropFilter: "blur(14px)",
                WebkitBackdropFilter: "blur(14px)",
                maskImage:
                  "linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 40%, rgba(0,0,0,0) 100%)",
                WebkitMaskImage:
                  "linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 40%, rgba(0,0,0,0) 100%)",
                pointerEvents: "none",
              }}
            />
            {/* Dark gradient overlay for text legibility */}
            <div
              aria-hidden
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height: "60%",
                background:
                  "linear-gradient(to top, rgba(15,30,60,0.7) 0%, rgba(15,30,60,0.35) 50%, rgba(15,30,60,0) 100%)",
                pointerEvents: "none",
              }}
            />
            <div
              style={{
                padding: "0 16px 16px",
                zIndex: 1,
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
              }}
            >
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  color: "#ffffff",
                  letterSpacing: "-0.01em",
                  textShadow: "0 1px 6px rgba(0,0,0,0.25)",
                }}
              >
                {userName || "Employee"}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "rgba(255,255,255,0.85)",
                  marginTop: 2,
                  textShadow: "0 1px 4px rgba(0,0,0,0.25)",
                }}
              >
                {role === "hr" ? "HR Business Partner" : role}
              </div>
            </div>
          </div>

          <NewsFeedCard token={token} />

          {[
            { label: "Devices", sub: "MacBook Air M1", icon: "💻", open: true },
          ].map((item) => (
            <div
              key={item.label}
              className="overflow-hidden"
              style={{
                borderRadius: 20,
                background: C.cardBg,
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                border: `1px solid ${C.tealBorder}`,
                boxShadow: "var(--cardShadow)",
              }}
            >
              <div className="w-full flex items-center justify-between px-4 py-3 cursor-pointer">
                <span
                  className="text-xs font-medium"
                  style={{ color: C.textDark }}
                >
                  {item.label}
                </span>
                <svg
                  width="14"
                  height="14"
                  fill="none"
                  viewBox="0 0 24 24"
                  style={{ transform: item.open ? "rotate(180deg)" : "none" }}
                >
                  <path
                    d="M6 9l6 6 6-6"
                    stroke={C.textMuted}
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              {item.open && item.sub && (
                <div className="px-3 pb-3">
                  <div
                    className="flex items-center justify-between px-3 py-2 rounded-lg"
                    style={{ background: C.tealPale }}
                  >
                    <div className="flex items-center gap-2">
                      <span>{item.icon}</span>
                      <div>
                        <div
                          className="text-xs font-semibold"
                          style={{ color: C.textDark }}
                        >
                          MacBook Air
                        </div>
                        <div
                          className="text-[10px]"
                          style={{ color: C.textMuted }}
                        >
                          Version M1
                        </div>
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
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Progress card */}
          <div
            className="p-5"
            style={{
              borderRadius: 20,
              background: C.cardBg,
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              border: `1px solid ${C.tealBorder}`,
              boxShadow: "var(--cardShadow)",
            }}
          >
            <div className="flex items-center justify-between">
              <span
                className="text-sm font-semibold"
                style={{ color: C.textDark }}
              >
                Progress
              </span>
              <button
                onClick={() => onNav("attendance")}
                className="w-6 h-6 rounded-full flex items-center justify-center hover:opacity-70"
                style={{ background: C.tealPale }}
              >
                <svg width="10" height="10" fill="none" viewBox="0 0 24 24">
                  <path
                    d="M7 17L17 7M17 7H7M17 7v10"
                    stroke={C.teal}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span
                style={{
                  fontSize: 38,
                  fontWeight: 250,
                  letterSpacing: "-0.03em",
                  color: C.textDark,
                }}
              >
                {loading
                  ? "—"
                  : `${weekData.reduce((s, d) => s + (d.hours ?? 0), 0).toFixed(1)}h`}
              </span>
              <div>
                <div
                  className="text-xs font-medium"
                  style={{ color: C.textMuted }}
                >
                  Work Time
                </div>
                <div className="text-xs" style={{ color: C.textMuted }}>
                  this week
                </div>
              </div>
            </div>
            <ProgressBarChart
              weekData={
                weekData.length
                  ? weekData
                  : Array.from({ length: 7 }, (_, i) => ({
                      date: "",
                      weekday_short: ["M", "T", "W", "T", "F", "S", "S"][i],
                      status: null,
                      hours: null,
                      is_leave: false,
                      is_today: i === new Date().getDay() - 1,
                      is_future: false,
                    }))
              }
            />
          </div>

          <TeamInsightsCard teamStatus={teamStatus} loading={loading} />

          <OrgInsightsCard orgStats={orgStats} loading={loading} />
        </div>

        {/* COL 3: Time tracker + My Leaves + Leave balance */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <TimeTrackerCard token={token} onNav={onNav} />

          <MyLeavesCard myLeaves={myLeaves} loading={loading} onNav={onNav} />
        </div>

        {/* COL 4: Team Approvals + My Requests + Leave Balance */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <PendingApprovalsCard
            loading={loading}
            teamApprovals={teamApprovals}
            myLeaves={myLeaves}
            myRequests={myRequests}
            isManager={isManager}
            renotifyLoading={renotifyLoading}
            onApprove={handleApprove}
            onReject={handleReject}
            onRenotify={(id, type) => handleRenotify(id, type)}
          />

          {balance && (
            <div
              style={{
                borderRadius: 20,
                padding: 16,
                background: C.cardBg,
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                border: `1px solid ${C.tealBorder}`,
                boxShadow: "var(--cardShadow)",
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <span
                  className="text-sm font-semibold"
                  style={{ color: C.textDark }}
                >
                  Leave balance
                </span>
                <span
                  style={{ fontSize: 24, fontWeight: 300, color: C.darkTeal }}
                >
                  {totalLeave}d
                </span>
              </div>
              {[
                {
                  label: "Casual",
                  val: balance.casual_remaining,
                  max: 12,
                  color: C.teal,
                },
                {
                  label: "Sick",
                  val: balance.sick_remaining,
                  max: 10,
                  color: "#14B8A6",
                },
                {
                  label: "Privilege",
                  val: balance.privilege_remaining,
                  max: 18,
                  color: C.darkTeal,
                },
                {
                  label: "Comp Off",
                  val: balance.comp_off_remaining,
                  max: 10,
                  color: "#34D399",
                },
              ].map((item) => (
                <div key={item.label} className="mb-2">
                  <div className="flex justify-between mb-1">
                    <span
                      className="text-xs font-medium"
                      style={{ color: C.textDark }}
                    >
                      {item.label}
                    </span>
                    <span className="text-xs" style={{ color: C.textMuted }}>
                      {item.val}/{item.max}
                    </span>
                  </div>
                  <div
                    className="h-1.5 rounded-full overflow-hidden"
                    style={{ background: C.tealPale }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(item.val / item.max) * 100}%`,
                        background: item.color,
                      }}
                    />
                  </div>
                </div>
              ))}
              <button
                onClick={() => onNav("leaves")}
                className="w-full mt-2 py-2 text-xs font-semibold hover:opacity-80"
                style={{
                  background: C.teal,
                  color: "white",
                  borderRadius: 999,
                  border: "none",
                  cursor: "pointer",
                }}
              >
                + Apply Leave
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
