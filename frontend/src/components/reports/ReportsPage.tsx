import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  AreaChart, Area, Cell, PieChart, Pie, Legend,
} from "recharts";

const API = import.meta.env.VITE_API_BASE ?? "http://localhost:8002/api";

async function get(token: string, path: string) {
  try {
    const r = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    const text = await r.text();
    return text ? JSON.parse(text) : null;
  } catch { return null; }
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface OrgStats {
  total_employees: number;
  active_employees: number;
  departments: number;
  avg_attendance_rate: number;
  avg_leave_utilisation: number;
  pending_leaves: number;
  pending_regularizations: number;
}

interface AttendanceAnomaly {
  employee_id: number;
  employee_name: string;
  department: string;
  absent_days: number;
  late_days: number;
  anomaly_score: number;
  pattern: string;
}

interface BurnoutEmployee {
  employee_id: number;
  employee_name: string;
  department: string;
  burnout_score: number;
  risk_level: "low" | "medium" | "high" | "critical";
  signals: string[];
}

interface AttritionRisk {
  employee_id: number;
  employee_name: string;
  department: string;
  risk_score: number;
  risk_level: "low" | "medium" | "high";
  factors: string[];
}

interface EmployeeReport {
  employee_id: number;
  name: string;
  department: string;
  role: string;
  attendance_rate: number;
  leave_utilisation: number;
  burnout_score: number;
  burnout_risk: string;
  motivation_score: number;
  motivation_label: string;
  attrition_risk: string;
  performance_trend: string;
  ai_summary: string;
  strengths: string[];
  watch_points: string[];
  radar: { metric: string; score: number }[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const RISK_COLORS: Record<string, string> = {
  low: "#10b981", medium: "#f59e0b", high: "#f97316", critical: "#ef4444",
};
const RISK_BG: Record<string, string> = {
  low: "#d1fae5", medium: "#fef3c7", high: "#ffedd5", critical: "#fee2e2",
};

function RiskBadge({ level }: { level: string }) {
  const l = level?.toLowerCase() ?? "low";
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
      background: RISK_BG[l] ?? "#f3f4f6",
      color: RISK_COLORS[l] ?? "#6b7280",
      textTransform: "uppercase", letterSpacing: "0.05em",
    }}>{l}</span>
  );
}

function ScoreBar({ value, max = 100, color }: { value: number; max?: number; color: string }) {
  return (
    <div style={{ height: 6, borderRadius: 999, background: "var(--accentLight)", overflow: "hidden", flex: 1 }}>
      <div style={{ height: "100%", width: `${Math.min((value / max) * 100, 100)}%`, background: color, borderRadius: 999, transition: "width 0.6s ease" }} />
    </div>
  );
}

function StatCard({ label, value, sub, color = "var(--accent)", tooltip }: { label: string; value: string | number; sub?: string; color?: string; tooltip?: string }) {
  const [showTip, setShowTip] = React.useState(false);
  return (
    <div style={{
      background: "var(--card)", border: "1px solid var(--cardBorder)", borderRadius: 16,
      padding: "18px 20px", boxShadow: "var(--cardShadow)", position: "relative",
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
        {label}
        {tooltip && (
          <span
            onMouseEnter={() => setShowTip(true)}
            onMouseLeave={() => setShowTip(false)}
            style={{ cursor: "help", fontSize: 11, color: "var(--muted)", opacity: 0.6, userSelect: "none" }}
          >ⓘ</span>
        )}
      </div>
      {showTip && tooltip && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 6px)", left: 0, zIndex: 50,
          background: "#1e293b", color: "#f1f5f9", fontSize: 11, lineHeight: 1.5,
          padding: "8px 12px", borderRadius: 8, maxWidth: 220, pointerEvents: "none",
          boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
        }}>{tooltip}</div>
      )}
      <div style={{ fontSize: 30, fontWeight: 250, color, letterSpacing: "-0.02em", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <span
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        style={{
          cursor: "help",
          fontSize: 11,
          color: "var(--muted)",
          opacity: 0.7,
          userSelect: "none",
          lineHeight: 1,
        }}
      >
        ⓘ
      </span>
      {open && (
        <span
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            zIndex: 60,
            background: "var(--card)",
            color: "var(--ink)",
            fontSize: 11,
            lineHeight: 1.5,
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid var(--cardBorder)",
            boxShadow: "var(--cardShadow)",
            width: 260,
            whiteSpace: "normal",
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
}

function SectionCard({ title, subtitle, children, action }: {
  title: string; subtitle?: string; children: React.ReactNode; action?: React.ReactNode;
}) {
  return (
    <div style={{
      background: "var(--card)", border: "1px solid var(--cardBorder)", borderRadius: 20,
      padding: 24, boxShadow: "var(--cardShadow)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>{title}</div>
          {subtitle && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>{subtitle}</div>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

interface AIInsights {
  org_health_score: number;
  org_health_label: string;
  insights: { icon: string; title: string; body: string; severity: "info" | "warning" | "critical" }[];
  actions: { priority: string; action: string; impact: string; timeline: string }[];
  skill_salary_alert: string;
}

interface SkillSalaryRow {
  employee_id: number;
  name: string;
  department: string;
  title: string;
  avg_skill_level: number;
  monthly_gross: number;
  dept_avg_gross: number;
  ratio: number;
  flag: "underpaid" | "overpaid" | "fair";
  skills: string[];
}

// ── Intelligence Banner ────────────────────────────────────────────────────────

function OrgHealthGauge({ score, label }: { score: number; label: string }) {
  const color = score >= 80 ? "#10b981" : score >= 65 ? "#f59e0b" : score >= 45 ? "#f97316" : "#ef4444";
  const circumference = 2 * Math.PI * 40;
  const offset = circumference - (score / 100) * circumference;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <div style={{ position: "relative", width: 104, height: 104 }}>
        <svg width="104" height="104" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="52" cy="52" r="40" fill="none" stroke="var(--cardBorder)" strokeWidth="10" />
          <circle cx="52" cy="52" r="40" fill="none" stroke={color} strokeWidth="10"
            strokeDasharray={circumference} strokeDashoffset={offset}
            strokeLinecap="round" style={{ transition: "stroke-dashoffset 1s ease" }}
          />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontSize: 26, fontWeight: 700, color: "var(--ink)", lineHeight: 1 }}>{score}</div>
          <div style={{ fontSize: 9, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 4 }}>/ 100</div>
        </div>
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color, background: "var(--bg)", border: `1px solid ${color}33`, padding: "4px 12px", borderRadius: 999, letterSpacing: "0.04em" }}>{label}</div>
    </div>
  );
}

function IntelligenceBanner({ data, loading }: { data: AIInsights | null; loading: boolean }) {
  if (loading) {
    return (
      <div style={{ background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #6d28d9 100%)", borderRadius: 20, padding: 28, display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <div style={{ width: 104, height: 104, borderRadius: "50%", background: "rgba(255,255,255,0.12)", animation: "pulse 1.5s ease-in-out infinite" }} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
            {[180, 140, 100].map(w => (
              <div key={w} style={{ height: 14, width: w, borderRadius: 8, background: "rgba(255,255,255,0.15)", animation: "pulse 1.5s ease-in-out infinite" }} />
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          {[1,2,3,4,5].map(i => (
            <div key={i} style={{ flex: 1, height: 80, borderRadius: 14, background: "rgba(255,255,255,0.10)", animation: "pulse 1.5s ease-in-out infinite" }} />
          ))}
        </div>
      </div>
    );
  }
  if (!data) return null;

  const priColors: Record<string, { bg: string; text: string }> = { 
    High: { bg: "rgba(239,68,68,0.1)", text: "#ef4444" }, 
    Medium: { bg: "rgba(245,158,11,0.1)", text: "#f59e0b" }, 
    Low: { bg: "rgba(16,185,129,0.1)", text: "#10b981" } 
  };

  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--cardBorder)", borderRadius: 20, padding: 24, display: "flex", flexDirection: "column", gap: 24, boxShadow: "var(--cardShadow)" }}>
      {/* Top row: gauge + title + skill alert */}
      <div style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
        <OrgHealthGauge score={data.org_health_score} label={data.org_health_label} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 16 }}>🧠</span> AI Workforce Intelligence
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--ink)", lineHeight: 1.3 }}>Organisation Health Overview</div>
            <InfoTip text="org_health_score is 0–100 (higher = healthier). It summarizes org-wide attendance, burnout pressure, attrition pressure and leave-hoarding signals. Labels: ≥80 Healthy, 65–79 Needs Attention, 45–64 At Risk, <45 Critical." />
          </div>
          {data.skill_salary_alert && (
            <div style={{ fontSize: 13, color: "#b45309", background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 14px", display: "flex", alignItems: "center", gap: 8 }}>
              <span>⚡</span> {data.skill_salary_alert}
            </div>
          )}
        </div>
      </div>

      {/* Insight cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16 }}>
        {data.insights.map((ins, i) => {
          const isCritical = ins.severity === "critical";
          const isWarning = ins.severity === "warning";
          const titleColor = isCritical ? "#ef4444" : isWarning ? "#f59e0b" : "var(--ink)";
          
          return (
            <div key={i} style={{
              background: "var(--card)", border: "1px solid var(--cardBorder)",
              borderRadius: 16, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 10,
              boxShadow: "var(--cardShadow)"
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <div style={{ fontSize: 20, lineHeight: 1 }}>{ins.icon}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: titleColor, lineHeight: 1.3 }}>{ins.title}</div>
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>{ins.body}</div>
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 4 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)", textTransform: "uppercase", letterSpacing: "0.05em", paddingLeft: 4 }}>Recommended Actions</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
          {data.actions.map((act, i) => {
            const pri = priColors[act.priority] ?? priColors.Low;
            return (
              <div key={i} style={{ 
                background: "var(--card)", border: "1px solid var(--cardBorder)", borderRadius: 16, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 8, boxShadow: "var(--cardShadow)" 
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: pri.text, background: pri.bg, padding: "4px 8px", borderRadius: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {act.priority} Priority
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)" }}>
                    {act.timeline}
                  </span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)", marginTop: 4 }}>{act.action}</div>
                <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.4 }}>{act.impact}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Skills Intel Tab ──────────────────────────────────────────────────────────

function SkillsIntelTab({ data, loading }: { data: SkillSalaryRow[]; loading: boolean }) {
  const [filter, setFilter] = React.useState<"all" | "underpaid" | "overpaid" | "fair">("all");
  const [tooltip, setTooltip] = React.useState<{ id: number; x: number; y: number } | null>(null);

  const filtered = filter === "all" ? data : data.filter(r => r.flag === filter);

  const flagConfig: Record<string, { label: string; bg: string; color: string }> = {
    underpaid: { label: "🔴 Underpaid", bg: "#fee2e2", color: "#dc2626" },
    overpaid:  { label: "🟡 Overpaid",  bg: "#fef9c3", color: "#ca8a04" },
    fair:      { label: "✅ Fair",      bg: "#d1fae5", color: "#059669" },
  };

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {[1,2,3,4,5].map(i => (
          <div key={i} style={{ height: 52, borderRadius: 12, background: "var(--accentLight)", opacity: 0.6 }} />
        ))}
      </div>
    );
  }

  const underpaidCount = data.filter(r => r.flag === "underpaid").length;
  const overpaidCount = data.filter(r => r.flag === "overpaid").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        <StatCard label="Underpaid Talent" value={underpaidCount} sub="high skill, below dept avg" color="#ef4444" />
        <StatCard label="Overpaid (Low Skill)" value={overpaidCount} sub="low skill, above dept avg" color="#f59e0b" />
        <StatCard label="Analysed Employees" value={data.length} sub="with skill & payroll data" color="#6366f1" />
      </div>

      <SectionCard title="Skill-Salary Alignment" subtitle="Top 30 employees by skill-salary ratio — high ratio = underpaid relative to skill">
        {/* Filter buttons */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {(["all", "underpaid", "overpaid", "fair"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: "6px 14px", borderRadius: 999, border: "1px solid var(--cardBorder)",
              background: filter === f ? "var(--accent)" : "var(--card)",
              color: filter === f ? "#fff" : "var(--muted)",
              fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              textTransform: "capitalize",
            }}>{f === "all" ? `All (${data.length})` : f === "underpaid" ? `🔴 Underpaid (${underpaidCount})` : f === "overpaid" ? `🟡 Overpaid (${overpaidCount})` : `✅ Fair (${data.filter(r => r.flag === "fair").length})`}</button>
          ))}
        </div>

        {/* Table header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2.5fr 1.2fr 1.5fr 1fr 1fr 1fr 100px",
            gap: 8,
            padding: "8px 12px",
            borderBottom: "1px solid var(--cardBorder)",
            position: "sticky",
            top: 0,
            background: "var(--card)",
            zIndex: 2,
          }}
        >
          {["Employee", "Dept", "Title", "Avg Skill", "Monthly Gross", "vs Dept Avg", "Flag"].map(h => (
            <div key={h} style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</div>
          ))}
        </div>

        {/* Table rows */}
        <div style={{ display: "flex", flexDirection: "column", maxHeight: 560, overflowY: "auto", paddingRight: 6 }}>
          {filtered.map(row => {
            const cfg = flagConfig[row.flag];
            const pctVsDept = row.dept_avg_gross > 0 ? Math.round(((row.monthly_gross - row.dept_avg_gross) / row.dept_avg_gross) * 100) : 0;
            const tooltipText = row.flag === "underpaid"
              ? `Skill level ${row.avg_skill_level}/5 but paid ${Math.abs(pctVsDept)}% below dept avg`
              : row.flag === "overpaid"
              ? `Skill level ${row.avg_skill_level}/5 but paid ${pctVsDept}% above dept avg`
              : `Skill level ${row.avg_skill_level}/5, salary within dept range`;

            return (
              <div key={row.employee_id}
                style={{ display: "grid", gridTemplateColumns: "2.5fr 1.2fr 1.5fr 1fr 1fr 1fr 100px", gap: 8, padding: "11px 12px", borderBottom: "1px solid var(--cardBorder)", alignItems: "center" }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--accentLight)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{row.name}</div>
                  <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>{row.skills.join(", ")}</div>
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>{row.department}</div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>{row.title}</div>
                <div>
                  <div style={{ display: "flex", gap: 2, marginBottom: 3 }}>
                    {[1,2,3,4,5].map(s => (
                      <div key={s} style={{ width: 10, height: 10, borderRadius: 2, background: s <= Math.round(row.avg_skill_level) ? "#6366f1" : "var(--accentLight)" }} />
                    ))}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>{row.avg_skill_level}/5</div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>₹{Math.round(row.monthly_gross / 1000)}k</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: pctVsDept >= 0 ? "#10b981" : "#ef4444" }}>{pctVsDept >= 0 ? "+" : ""}{pctVsDept}%</div>
                <div style={{ position: "relative" }}>
                  <span
                    title={tooltipText}
                    style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: cfg.bg, color: cfg.color, cursor: "help", whiteSpace: "nowrap" }}
                  >{cfg.label}</span>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div style={{ textAlign: "center", padding: 32, color: "var(--muted)", fontSize: 13 }}>No records match this filter.</div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}

// ── Mock data generator (used when API returns nothing) ───────────────────────

function mockOrgStats(): OrgStats {
  return { total_employees: 47, active_employees: 44, departments: 5, avg_attendance_rate: 87, avg_leave_utilisation: 62, pending_leaves: 8, pending_regularizations: 3 };
}

function mockAnomalies(): AttendanceAnomaly[] {
  return [
    { employee_id: 1, employee_name: "Ritu Mishra",    department: "Engineering", absent_days: 9,  late_days: 6, anomaly_score: 82, pattern: "Frequent Monday absences" },
    { employee_id: 2, employee_name: "Gaurav Gupta",   department: "Design",      absent_days: 7,  late_days: 4, anomaly_score: 71, pattern: "Cluster of absences mid-month" },
    { employee_id: 3, employee_name: "Simran Iyer",    department: "HR",          absent_days: 5,  late_days: 9, anomaly_score: 65, pattern: "Consistent late check-ins" },
    { employee_id: 4, employee_name: "Neha Mishra",    department: "Engineering", absent_days: 4,  late_days: 3, anomaly_score: 54, pattern: "Irregular WFH patterns" },
    { employee_id: 5, employee_name: "Tarun Joshi",    department: "Analytics",   absent_days: 3,  late_days: 8, anomaly_score: 49, pattern: "Late check-ins increasing" },
  ];
}

function mockBurnout(): BurnoutEmployee[] {
  return [
    { employee_id: 1, employee_name: "Sanjay Iyer",   department: "Engineering", burnout_score: 88, risk_level: "critical", signals: ["Avg 11h/day", "No leaves taken", "Negative pulse score"] },
    { employee_id: 2, employee_name: "Harish Mishra", department: "Engineering", burnout_score: 73, risk_level: "high",     signals: ["Overtime 3+ days/week", "Skipped 2 WFHs"] },
    { employee_id: 3, employee_name: "Vandana Patel", department: "Design",      burnout_score: 61, risk_level: "medium",   signals: ["Rising absent days", "Low engagement"] },
    { employee_id: 4, employee_name: "Manish Iyer",   department: "Analytics",   burnout_score: 44, risk_level: "medium",   signals: ["Leave balance untouched"] },
    { employee_id: 5, employee_name: "Neha Verma",    department: "HR",          burnout_score: 28, risk_level: "low",      signals: ["Healthy attendance", "Leaves used"] },
  ];
}

function mockAttrition(): AttritionRisk[] {
  return [
    { employee_id: 1, employee_name: "Ritu Rao",      department: "Engineering", risk_score: 79, risk_level: "high",   factors: ["18 months no promotion", "Burnout signals", "Team conflict"] },
    { employee_id: 2, employee_name: "Harish Joshi",  department: "Design",      risk_score: 68, risk_level: "high",   factors: ["Market salary gap", "Manager change", "Repeated leave"] },
    { employee_id: 3, employee_name: "Nikhil Patel",  department: "Engineering", risk_score: 55, risk_level: "medium", factors: ["Performance stagnation", "WFH conflicts"] },
    { employee_id: 4, employee_name: "Deepak Iyer",   department: "Analytics",   risk_score: 40, risk_level: "medium", factors: ["Low recognition score"] },
    { employee_id: 5, employee_name: "Anjali Patel",  department: "HR",          risk_score: 22, risk_level: "low",    factors: ["Stable engagement"] },
  ];
}

const DEPT_HEALTH = [
  { dept: "Engineering", health: 72, attendance: 84, burnout: 68, attrition: 22 },
  { dept: "Design",      health: 81, attendance: 91, burnout: 42, attrition: 15 },
  { dept: "HR",          health: 88, attendance: 93, burnout: 31, attrition: 9  },
  { dept: "Analytics",   health: 76, attendance: 87, burnout: 55, attrition: 18 },
  { dept: "Sales",       health: 65, attendance: 78, burnout: 74, attrition: 31 },
];

const LEAVE_UTIL = [
  { month: "Nov", used: 42 }, { month: "Dec", used: 71 }, { month: "Jan", used: 38 },
  { month: "Feb", used: 55 }, { month: "Mar", used: 48 }, { month: "Apr", used: 62 },
];

// ── Employee Search Report ─────────────────────────────────────────────────────

function mockEmployeeReport(name: string): EmployeeReport {
  return {
    employee_id: 1, name, department: "Engineering", role: "Senior Engineer",
    attendance_rate: 87, leave_utilisation: 45,
    burnout_score: 61, burnout_risk: "medium",
    motivation_score: 72, motivation_label: "Moderately Engaged",
    attrition_risk: "medium", performance_trend: "stable",
    ai_summary: `${name} shows moderately healthy engagement patterns with some early burnout signals. Attendance is consistent but leave utilisation is below average, suggesting possible work-life balance concerns. Motivation indicators are stable though recognition frequency has dropped over the last 6 weeks. Recommend a 1:1 check-in focused on growth opportunities and workload calibration.`,
    strengths: ["Consistent attendance", "High task completion rate", "Positive peer feedback"],
    watch_points: ["Leave hoarding (burnout signal)", "Reduced participation in team discussions", "Salary band below market P50"],
    radar: [
      { metric: "Attendance",   score: 87 },
      { metric: "Motivation",   score: 72 },
      { metric: "Wellbeing",    score: 55 },
      { metric: "Growth",       score: 68 },
      { metric: "Recognition",  score: 44 },
      { metric: "Collaboration",score: 79 },
    ],
  };
}

function EmployeeReportView({ token, isManager }: { token: string; isManager: boolean }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: number; name: string; dept: string }[]>([]);
  const [selected, setSelected] = useState<EmployeeReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!query.trim() || !isManager) { setResults([]); return; }
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(async () => {
      setSearching(true);
      const data = await get(token, `/employees/?search=${encodeURIComponent(query)}&page_size=8`);
      const list = Array.isArray(data) ? data : (data?.results ?? []);
      setResults(list.map((e: any) => ({
        id: e.id,
        name: e.user?.name || e.employee_id,
        dept: e.department?.name || "—",
      })));
      setSearching(false);
    }, 350);
  }, [query, token, isManager]);

  const loadReport = useCallback(async (emp: { id: number; name: string; dept: string }) => {
    setLoading(true);
    setResults([]);
    setQuery(emp.name);
    // Try AI endpoint, fall back to mock
    const data = await get(token, `/employees/${emp.id}/report/`);
    if (data && !data.error) {
      setSelected(data);
    } else {
      setSelected(mockEmployeeReport(emp.name));
    }
    setLoading(false);
  }, [token]);

  const PIE_COLORS = ["#0d9488", "#f59e0b", "#ef4444", "#6366f1", "#10b981", "#f97316"];

  return (
    <SectionCard title="Employee Intelligence Report" subtitle="AI-powered individual analysis — search any employee">
      {/* Search */}
      <div style={{ position: "relative", marginBottom: 20 }}>
        <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", opacity: 0.5 }}>
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={isManager ? "Search employee name..." : "Only managers can view individual reports"}
          disabled={!isManager}
          style={{
            width: "100%", padding: "11px 14px 11px 40px", borderRadius: 12,
            border: "1px solid var(--cardBorder)", background: "var(--card)",
            color: "var(--ink)", fontSize: 13, outline: "none", fontFamily: "inherit",
            boxSizing: "border-box",
          }}
        />
        {searching && (
          <div style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", opacity: 0.5, fontSize: 12, color: "var(--muted)" }}>Searching…</div>
        )}
        {results.length > 0 && (
          <div style={{
            position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20,
            background: "var(--card)", border: "1px solid var(--cardBorder)", borderRadius: 12,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)", overflow: "hidden", marginTop: 4,
          }}>
            {results.map(r => (
              <div key={r.id} onClick={() => loadReport(r)}
                style={{ padding: "10px 14px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--cardBorder)" }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--accentLight)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{r.name}</span>
                <span style={{ fontSize: 11, color: "var(--muted)" }}>{r.dept}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: 48, color: "var(--muted)", fontSize: 13 }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🤖</div>
          Generating AI report…
        </div>
      )}

      {!loading && !selected && !isManager && (
        <div style={{ textAlign: "center", padding: 48, color: "var(--muted)", fontSize: 13 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🔒</div>
          Individual employee reports are available to managers and HR only.
        </div>
      )}

      {!loading && !selected && isManager && (
        <div style={{ textAlign: "center", padding: 48, color: "var(--muted)", fontSize: 13 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
          Search an employee above to generate their AI intelligence report.
        </div>
      )}

      {!loading && selected && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Header */}
          <div style={{ display: "flex", gap: 16, alignItems: "center", padding: 16, background: "var(--accentLight)", borderRadius: 14 }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 18, flexShrink: 0 }}>
              {selected.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "var(--ink)" }}>{selected.name}</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{selected.role} · {selected.department}</div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Burnout</div>
                <RiskBadge level={selected.burnout_risk} />
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Attrition</div>
                <RiskBadge level={selected.attrition_risk} />
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Trend</div>
                <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#e0e7ff", color: "#4338ca", textTransform: "capitalize" }}>{selected.performance_trend}</span>
              </div>
            </div>
          </div>

          {/* KPI row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {[
              { label: "Attendance Rate", value: `${selected.attendance_rate}%`, color: "#10b981" },
              { label: "Burnout Score",   value: selected.burnout_score,         color: RISK_COLORS[selected.burnout_risk] ?? "#f59e0b" },
              { label: "Motivation",      value: `${selected.motivation_score}%`, color: "#6366f1" },
            ].map(k => (
              <div key={k.label} style={{ padding: "12px 14px", background: "var(--accentLight)", borderRadius: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{k.label}</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: k.color }}>{k.value}</div>
                <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>{k.label === "Motivation" ? selected.motivation_label : ""}</div>
              </div>
            ))}
          </div>

          {/* Radar + AI summary */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 16 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)", marginBottom: 12 }}>Health Radar</div>
              <ResponsiveContainer width="100%" height={200}>
                <RadarChart data={selected.radar}>
                  <PolarGrid stroke="var(--cardBorder)" />
                  <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10, fill: "var(--muted)" }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar dataKey="score" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.25} strokeWidth={2} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)", marginBottom: 10 }}>🤖 AI Analysis</div>
              <p style={{ fontSize: 12.5, color: "var(--ink)", lineHeight: 1.7, margin: 0 }}>{selected.ai_summary}</p>
            </div>
          </div>

          {/* Strengths + Watch points */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={{ padding: 16, background: "#d1fae5", borderRadius: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#065f46", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>✅ Strengths</div>
              {selected.strengths.map(s => (
                <div key={s} style={{ fontSize: 12.5, color: "#065f46", marginBottom: 6, display: "flex", gap: 6 }}>
                  <span>•</span><span>{s}</span>
                </div>
              ))}
            </div>
            <div style={{ padding: 16, background: "#fee2e2", borderRadius: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#991b1b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>⚠️ Watch Points</div>
              {selected.watch_points.map(s => (
                <div key={s} style={{ fontSize: 12.5, color: "#991b1b", marginBottom: 6, display: "flex", gap: 6 }}>
                  <span>•</span><span>{s}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

// ── Main Reports Page ──────────────────────────────────────────────────────────

export default function ReportsPage({ token, role }: { token: string; role: string }) {
  const isManager = ["manager", "hr", "cfo", "admin"].includes(role);
  const [orgStats, setOrgStats] = useState<OrgStats | null>(null);
  const [anomalies, setAnomalies] = useState<AttendanceAnomaly[]>([]);
  const [burnout, setBurnout] = useState<BurnoutEmployee[]>([]);
  const [attrition, setAttrition] = useState<AttritionRisk[]>([]);
  const [deptHealth, setDeptHealth] = useState<{ dept: string; health: number; attendance: number; burnout: number; leave_utilisation: number }[]>([]);
  const [leaveTrend, setLeaveTrend] = useState<{ month: string; used: number }[]>([]);
  const [payroll, setPayroll] = useState<{ trend: { month: string; total_gross_lakh: number; avg_net: number }[]; dept_breakdown: { dept: string; avg_gross: number; employee_count: number }[] } | null>(null);
  const [aiInsights, setAiInsights] = useState<AIInsights | null>(null);
  const [skillSalary, setSkillSalary] = useState<SkillSalaryRow[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "attendance" | "burnout" | "attrition" | "payroll" | "employee" | "skills">("overview");

  useEffect(() => {
    async function load() {
      setLoading(true);
      if (isManager) setAiLoading(true);
      const [stats, att, burn, attr, dh, lt, pr, ai, ss] = await Promise.all([
        get(token, "/employees/reports/org-stats/"),
        get(token, "/employees/reports/attendance-anomalies/"),
        get(token, "/employees/reports/burnout/"),
        get(token, "/employees/reports/attrition/"),
        get(token, "/employees/reports/dept-health/"),
        get(token, "/employees/reports/leave-trend/"),
        get(token, "/employees/reports/payroll-summary/"),
        isManager ? get(token, "/employees/reports/ai-insights/") : Promise.resolve(null),
        isManager ? get(token, "/employees/reports/skill-salary/") : Promise.resolve(null),
      ]);
      if (stats && !stats.error) setOrgStats(stats);
      if (Array.isArray(att)) setAnomalies(att);
      if (Array.isArray(burn)) setBurnout(burn);
      if (Array.isArray(attr)) setAttrition(attr);
      if (Array.isArray(dh)) setDeptHealth(dh);
      if (Array.isArray(lt)) setLeaveTrend(lt);
      if (pr && pr.trend) setPayroll(pr);
      if (ai && ai.org_health_score !== undefined) setAiInsights(ai);
      if (Array.isArray(ss)) setSkillSalary(ss);
      setLoading(false);
      setAiLoading(false);
    }
    load();
  }, [token, isManager]);

  const tabs = [
    { id: "overview",   label: "📊 Overview" },
    { id: "attendance", label: "📅 Attendance" },
    { id: "burnout",    label: "🔥 Burnout" },
    { id: "attrition",  label: "🚪 Attrition" },
    ...(isManager ? [{ id: "payroll", label: "💰 Payroll" }] : []),
    ...(isManager ? [{ id: "employee", label: "🔍 Employee Intel" }] : []),
    ...(isManager ? [{ id: "skills", label: "🧠 Skills Intel" }] : []),
  ] as { id: typeof activeTab; label: string }[];

  const stats = orgStats;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 250, color: "var(--ink)", letterSpacing: "-0.02em", margin: 0 }}>Reports</h1>
          <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 4, fontWeight: 300 }}>
            AI-powered workforce intelligence · {isManager ? "Full org view" : "Your team view"}
          </p>
        </div>
        <div style={{ display: "flex", gap: 2, padding: 3, background: "var(--card)", border: "1px solid var(--cardBorder)", borderRadius: 999 }}>
          {tabs.map(t => {
            const a = activeTab === t.id;
            return (
              <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
                padding: "6px 14px", borderRadius: 999, border: "none", cursor: "pointer",
                background: a ? "var(--navPill)" : "transparent",
                color: a ? "#fff" : "var(--muted)",
                fontSize: 12, fontWeight: a ? 600 : 500, fontFamily: "inherit", transition: "all 0.18s",
                whiteSpace: "nowrap",
              }}>{t.label}</button>
            );
          })}
        </div>
      </div>

      {/* Intelligence Banner — always shown for managers, before tabs */}
      {isManager && (
        <IntelligenceBanner data={aiInsights} loading={aiLoading && !aiInsights} />
      )}

      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} style={{ height: 90, borderRadius: 16, background: "var(--accentLight)", opacity: 0.5 }} />
          ))}
        </div>
      ) : (
        <>
          {/* ── OVERVIEW TAB ─────────────────────────────────────────────────── */}
          {activeTab === "overview" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* KPI row */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
                <StatCard label="Active Employees"    value={stats?.active_employees ?? "—"}             sub={stats ? `of ${stats.total_employees} total` : "loading"} tooltip="Employees with is_active=True in current org" />
                <StatCard label="Avg Attendance"      value={stats ? `${stats.avg_attendance_rate}%` : "—"}    sub="last 30 days" color="var(--accent)" tooltip="% of working days employees marked Present/WFH/Regularized in last 30 days" />
                <StatCard label="Leave Utilisation"   value={stats ? `${stats.avg_leave_utilisation}%` : "—"}  sub="of annual entitlement" color="#6366f1" tooltip="Avg % of annual leave entitlement (40 days total: CL12+PL18+SL10) used across all employees" />
                <StatCard label="Pending Actions"     value={stats ? stats.pending_leaves + stats.pending_regularizations : "—"} sub={stats ? `${stats.pending_leaves} leaves · ${stats.pending_regularizations} regs` : ""} color="#f59e0b" tooltip="Leave requests in PENDING state awaiting manager approval" />
              </div>

              {/* Dept health + Leave trend */}
              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 14 }}>
                <SectionCard
                  title="Department Health Index"
                  subtitle="Composite score: attendance + burnout + attrition risk"
                  action={
                    <InfoTip text="health score is 0–100 (higher = healthier). It’s computed per department from: attendance % (50%) + (100 − penalty pressure) (30%) + leave utilisation % (20%)." />
                  }
                >
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 12,
                      maxHeight: 420,
                      overflowY: "auto",
                      paddingRight: 6,
                    }}
                  >
                    {deptHealth.length === 0 ? (
                      <div style={{ textAlign: "center", padding: 24, color: "var(--muted)", fontSize: 12 }}>No department data available</div>
                    ) : (
                      <>
                        {deptHealth.map(d => (
                          <div key={d.dept}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                              <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)" }}>{d.dept}</span>
                              <span style={{ fontSize: 12, fontWeight: 700, color: d.health >= 80 ? "#10b981" : d.health >= 65 ? "#f59e0b" : "#ef4444" }}>{d.health}/100</span>
                            </div>
                            <ScoreBar value={d.health} color={d.health >= 80 ? "#10b981" : d.health >= 65 ? "#f59e0b" : "#ef4444"} />
                            <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
                              {[
                                { l: "Attendance", v: `${d.attendance}%` },
                                { l: "Burnout",    v: `${d.burnout}%` },
                                { l: "Leave Util", v: `${d.leave_utilisation}%` },
                              ].map(x => (
                                <span key={x.l} style={{ fontSize: 10, color: "var(--muted)" }}>{x.l}: <strong>{x.v}</strong></span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                </SectionCard>

                <SectionCard title="Leave Utilisation Trend" subtitle="Monthly org-wide average">
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={leaveTrend.length ? leaveTrend : LEAVE_UTIL} margin={{ left: -20, right: 10 }}>
                      <defs>
                        <linearGradient id="leaveGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--cardBorder)" />
                      <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "var(--muted)" }} axisLine={false} tickLine={false} domain={[0, 100]} unit="%" />
                      <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--cardBorder)", borderRadius: 10, fontSize: 11 }} formatter={v => [`${v}%`, "Utilisation"]} />
                      <Area dataKey="used" stroke="var(--accent)" fill="url(#leaveGrad)" strokeWidth={2} dot={{ r: 3, fill: "var(--accent)" }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </SectionCard>
              </div>

              {/* Risk summary pie */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
                {[
                  { title: "Burnout Distribution", data: [
                    { name: "Critical", value: burnout.filter(b => b.risk_level === "critical").length },
                    { name: "High",     value: burnout.filter(b => b.risk_level === "high").length },
                    { name: "Medium",   value: burnout.filter(b => b.risk_level === "medium").length },
                    { name: "Low",      value: burnout.filter(b => b.risk_level === "low").length },
                  ], colors: ["#ef4444","#f97316","#f59e0b","#10b981"] },
                  { title: "Attrition Risk Split", data: [
                    { name: "High",   value: attrition.filter(a => a.risk_level === "high").length },
                    { name: "Medium", value: attrition.filter(a => a.risk_level === "medium").length },
                    { name: "Low",    value: attrition.filter(a => a.risk_level === "low").length },
                  ], colors: ["#ef4444","#f59e0b","#10b981"] },
                  { title: "Attendance Anomalies", data: [
                    { name: "Critical (>70)", value: anomalies.filter(a => a.anomaly_score > 70).length },
                    { name: "Moderate",       value: anomalies.filter(a => a.anomaly_score > 40 && a.anomaly_score <= 70).length },
                    { name: "Mild",           value: anomalies.filter(a => a.anomaly_score <= 40).length },
                  ], colors: ["#ef4444","#f59e0b","#6366f1"] },
                ].map(chart => (
                  <SectionCard key={chart.title} title={chart.title}>
                    <ResponsiveContainer width="100%" height={160}>
                      <PieChart>
                        <Pie data={chart.data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} innerRadius={35} paddingAngle={3}>
                          {chart.data.map((_, i) => <Cell key={i} fill={chart.colors[i]} />)}
                        </Pie>
                        <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--cardBorder)", borderRadius: 10, fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
                      {chart.data.map((d, i) => (
                        <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10 }}>
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: chart.colors[i], flexShrink: 0 }} />
                          <span style={{ color: "var(--muted)" }}>{d.name}: <strong style={{ color: "var(--ink)" }}>{d.value}</strong></span>
                        </div>
                      ))}
                    </div>
                  </SectionCard>
                ))}
              </div>
            </div>
          )}

          {/* ── ATTENDANCE TAB ───────────────────────────────────────────────── */}
          {activeTab === "attendance" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
                <StatCard
                  label="Anomalies Detected"
                  value={anomalies.length}
                  sub="last 30 days"
                  color="#f97316"
                  tooltip="Employees flagged with anomaly_score ≥ 10 (0–100). Higher anomaly_score = more irregular attendance."
                />
                <StatCard
                  label="Critical Cases"
                  value={anomalies.filter(a => a.anomaly_score > 70).length}
                  sub="score > 70"
                  color="#ef4444"
                  tooltip="Critical anomaly_score threshold is > 70. This typically indicates very high absence rate and/or repeated late check-ins and penalties."
                />
                <StatCard
                  label="Avg Anomaly Score"
                  value={anomalies.length ? Math.round(anomalies.reduce((s, a) => s + a.anomaly_score, 0) / anomalies.length) : 0}
                  sub="0–100 (higher = worse)"
                  color="#f59e0b"
                  tooltip="anomaly_score is computed from last 30 days: (absence_rate×60) + (late_rate×30) + (active_penalties×5), capped at 100."
                />
              </div>

              <SectionCard title="Attendance Irregularity Report" subtitle="AI-detected anomalous patterns — sorted by severity">
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "240px 150px 72px 72px 1fr 140px",
                      gap: 12,
                      padding: "10px 14px",
                      borderBottom: "1px solid var(--cardBorder)",
                      position: "sticky",
                      top: 0,
                      background: "var(--card)",
                      zIndex: 2,
                    }}
                  >
                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Employee</div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Dept</div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Absent</div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Late</div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Pattern</div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Score</div>
                      <InfoTip text="anomaly_score (0–100). Higher = more irregular. Based on absence rate, late check-ins and active penalties in the last 30 days." />
                    </div>
                  </div>
                  <div style={{ maxHeight: 520, overflowY: "auto", paddingRight: 6 }}>
                    {anomalies.map(a => (
                      <div
                        key={a.employee_id}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "240px 150px 72px 72px 1fr 140px",
                          gap: 12,
                          padding: "12px 14px",
                          borderBottom: "1px solid var(--cardBorder)",
                          alignItems: "center",
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = "var(--accentLight)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                      >
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.employee_name}</div>
                        <div style={{ fontSize: 12, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.department}</div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#ef4444" }}>{a.absent_days}d</div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#f59e0b" }}>{a.late_days}d</div>
                        <div style={{ fontSize: 11.5, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.pattern}</div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
                          <div style={{ width: 72, height: 5, borderRadius: 999, background: "var(--cardBorder)", overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${a.anomaly_score}%`, background: a.anomaly_score > 70 ? "#ef4444" : a.anomaly_score > 40 ? "#f59e0b" : "#10b981", borderRadius: 999 }} />
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: a.anomaly_score > 70 ? "#ef4444" : "var(--muted)", width: 28, textAlign: "right" }}>{a.anomaly_score}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </SectionCard>

              <SectionCard title="Anomaly Score Distribution" subtitle="Spread of attendance irregularities across the org">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={anomalies} margin={{ left: -10, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--cardBorder)" />
                    <XAxis dataKey="employee_name" tick={{ fontSize: 9, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--cardBorder)", borderRadius: 10, fontSize: 11 }} formatter={v => [v, "Anomaly Score"]} />
                    <Bar dataKey="anomaly_score" radius={[6, 6, 0, 0]}>
                      {anomalies.map((a, i) => <Cell key={i} fill={a.anomaly_score > 70 ? "#ef4444" : a.anomaly_score > 40 ? "#f59e0b" : "#10b981"} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </SectionCard>
            </div>
          )}

          {/* ── BURNOUT TAB ──────────────────────────────────────────────────── */}
          {activeTab === "burnout" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
                <StatCard label="Critical Risk"  value={burnout.filter(b => b.risk_level === "critical").length} sub="immediate action needed" color="#ef4444" />
                <StatCard label="High Risk"      value={burnout.filter(b => b.risk_level === "high").length}     sub="monitor closely"         color="#f97316" />
                <StatCard label="Medium Risk"    value={burnout.filter(b => b.risk_level === "medium").length}   sub="watch trend"             color="#f59e0b" />
                <StatCard label="Healthy"        value={burnout.filter(b => b.risk_level === "low").length}      sub="no action needed"        color="#10b981" />
              </div>

              <SectionCard
                title="Burnout Risk Index"
                subtitle="AI signals: overtime, leave hoarding, pulse score, engagement decline"
                action={
                  <InfoTip text="burnout_score is 0–100 (higher = higher burnout risk). Thresholds: ≥70 critical, 50–69 high, 25–49 medium, <25 low. Built from signals like low leave utilisation, high absences, active penalties, rejected requests." />
                }
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 14, maxHeight: 560, overflowY: "auto", paddingRight: 6 }}>
                  {burnout.map(b => (
                    <div key={b.employee_id} style={{ display: "flex", gap: 14, alignItems: "flex-start", padding: 14, borderRadius: 12, background: "var(--accentLight)" }}>
                      <div style={{ width: 40, height: 40, borderRadius: 12, background: RISK_COLORS[b.risk_level], display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                        {b.employee_name.split(" ").map(w => w[0]).join("").slice(0, 2)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                          <div>
                            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{b.employee_name}</span>
                            <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 8 }}>{b.department}</span>
                          </div>
                          <RiskBadge level={b.risk_level} />
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                          <ScoreBar value={b.burnout_score} color={RISK_COLORS[b.risk_level]} />
                          <span style={{ fontSize: 13, fontWeight: 700, color: RISK_COLORS[b.risk_level], minWidth: 32 }}>{b.burnout_score}</span>
                        </div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {b.signals.map(s => (
                            <span key={s} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, background: "#fff", color: "var(--muted)", border: "1px solid var(--cardBorder)" }}>{s}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>
            </div>
          )}

          {/* ── ATTRITION TAB ────────────────────────────────────────────────── */}
          {activeTab === "attrition" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
                <StatCard label="High Risk"    value={attrition.filter(a => a.risk_level === "high").length}   sub="likely to leave in 90d"  color="#ef4444" />
                <StatCard label="Medium Risk"  value={attrition.filter(a => a.risk_level === "medium").length} sub="needs engagement action" color="#f59e0b" />
                <StatCard label="Stable"       value={attrition.filter(a => a.risk_level === "low").length}    sub="engaged & retained"      color="#10b981" />
              </div>

              <SectionCard
                title="Attrition Risk Report"
                subtitle="AI factors: tenure, promotion gap, market salary, engagement, burnout"
                action={
                  <InfoTip text="risk_score is 0–100 (higher = higher attrition risk). Thresholds: ≥55 high, 30–54 medium, <30 low. Built from signals like long tenure, high absences, rejected leave requests, active penalties, and frequent regularizations." />
                }
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 14, maxHeight: 560, overflowY: "auto", paddingRight: 6 }}>
                  {attrition.map(a => (
                    <div key={a.employee_id} style={{ display: "flex", gap: 14, alignItems: "flex-start", padding: 14, borderRadius: 12, background: "var(--accentLight)" }}>
                      <div style={{ width: 40, height: 40, borderRadius: 12, background: RISK_COLORS[a.risk_level], display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                        {a.employee_name.split(" ").map(w => w[0]).join("").slice(0, 2)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                          <div>
                            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{a.employee_name}</span>
                            <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 8 }}>{a.department}</span>
                          </div>
                          <RiskBadge level={a.risk_level} />
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                          <ScoreBar value={a.risk_score} color={RISK_COLORS[a.risk_level]} />
                          <span style={{ fontSize: 13, fontWeight: 700, color: RISK_COLORS[a.risk_level], minWidth: 32 }}>{a.risk_score}%</span>
                        </div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {a.factors.map(f => (
                            <span key={f} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, background: "#fff", color: "var(--muted)", border: "1px solid var(--cardBorder)" }}>{f}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>

              <SectionCard title="Risk Score Comparison" subtitle="Relative attrition pressure across flagged employees">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={attrition} layout="vertical" margin={{ left: 10, right: 30 }}>
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: "var(--muted)" }} axisLine={false} tickLine={false} unit="%" />
                    <YAxis type="category" dataKey="employee_name" tick={{ fontSize: 11, fill: "var(--ink)" }} axisLine={false} tickLine={false} width={110} />
                    <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--cardBorder)", borderRadius: 10, fontSize: 11 }} formatter={v => [`${v}%`, "Risk Score"]} />
                    <Bar dataKey="risk_score" radius={[0, 6, 6, 0]}>
                      {attrition.map((a, i) => <Cell key={i} fill={RISK_COLORS[a.risk_level]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </SectionCard>
            </div>
          )}

          {/* ── PAYROLL TAB ──────────────────────────────────────────────────── */}
          {activeTab === "payroll" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <SectionCard title="Monthly Payroll Spend" subtitle="Total gross payout (₹ Lakhs) last 6 months">
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={payroll?.trend ?? []} margin={{ left: -10, right: 10 }}>
                    <defs>
                      <linearGradient id="payGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--cardBorder)" />
                    <XAxis dataKey="month" tick={{ fontSize: 12, fill: "var(--muted)" }} />
                    <YAxis tick={{ fontSize: 12, fill: "var(--muted)" }} unit="L" />
                    <Tooltip formatter={(v) => [`₹${v}L`, "Gross Payout"]} />
                    <Area type="monotone" dataKey="total_gross_lakh" stroke="#6366f1" fill="url(#payGrad)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </SectionCard>

              <SectionCard title="Average Monthly Salary by Department" subtitle="Gross pay per employee (last month)">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={payroll?.dept_breakdown ?? []} layout="vertical" margin={{ left: 20, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--cardBorder)" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: "var(--muted)" }} tickFormatter={(v) => `₹${Math.round(v / 1000)}k`} />
                    <YAxis type="category" dataKey="dept" tick={{ fontSize: 11, fill: "var(--muted)" }} width={160} />
                    <Tooltip formatter={(v) => [`₹${(Number(v) / 1000).toFixed(1)}k`, "Avg Gross"]} />
                    <Bar dataKey="avg_gross" fill="#10b981" radius={[0, 4, 4, 0]}>
                      {(payroll?.dept_breakdown ?? []).map((_, i) => (
                        <Cell key={i} fill={["#6366f1","#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#f97316","#ec4899","#14b8a6","#a78bfa"][i % 10]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </SectionCard>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                {(payroll?.dept_breakdown ?? []).slice(0, 3).map((d) => (
                  <div key={d.dept} style={{ padding: 16, background: "var(--card)", border: "1px solid var(--cardBorder)", borderRadius: 12 }}>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>{d.dept}</div>
                    <div style={{ fontSize: 22, fontWeight: 600, color: "var(--ink)" }}>₹{Math.round(d.avg_gross / 1000)}k</div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>avg/month · {d.employee_count} employees</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── EMPLOYEE INTEL TAB ───────────────────────────────────────────── */}
          {activeTab === "employee" && (
            <EmployeeReportView token={token} isManager={isManager} />
          )}

          {/* ── SKILLS INTEL TAB ─────────────────────────────────────────────── */}
          {activeTab === "skills" && (
            <SkillsIntelTab data={skillSalary} loading={false} />
          )}
        </>
      )}
    </div>
  );
}
