import React, { useEffect, useState, useCallback } from "react";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
  Legend,
} from "recharts";

const API = import.meta.env.VITE_API_BASE ?? "http://localhost:8000/api";

async function apiPost(token: string, path: string, body?: object) {
  const r = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  return text ? JSON.parse(text) : {};
}
async function apiGet(token: string, path: string) {
  const r = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await r.text();
  return text ? JSON.parse(text) : {};
}

const TOPIC_LABELS: Record<string, string> = {
  work_life_balance: "Work-Life Balance",
  compensation: "Compensation",
  management: "Management",
  career_growth: "Career Growth",
  culture: "Culture",
  workload: "Workload",
  communication: "Communication",
  recognition: "Recognition",
  team_dynamics: "Team Dynamics",
};

const RISK_META: Record<
  string,
  { label: string; icon: string; color: string }
> = {
  burnout: { label: "Burnout Risk", icon: "🔥", color: "#FF6B6B" },
  attrition: { label: "Attrition Risk", icon: "🚪", color: "#FF9F43" },
  morale_decline: { label: "Morale Decline", icon: "📉", color: "#FECA57" },
  toxic_culture: { label: "Toxic Culture", icon: "⚠️", color: "#FF6B6B" },
};

const EMOTION_COLORS: Record<string, string> = {
  frustration: "#FF6B6B",
  anxiety: "#FF9F43",
  satisfaction: "#1DD1A1",
  neutral: "#A29BFE",
};

const SENTIMENT_COLORS: Record<string, string> = {
  positive: "#1DD1A1",
  neutral: "#74B9FF",
  negative: "#FF6B6B",
};

const PIE_COLORS = [
  "#1DD1A1",
  "#74B9FF",
  "#FF6B6B",
  "#FECA57",
  "#A29BFE",
  "#FF9F43",
];

interface OrgInsights {
  insufficient_data?: boolean;
  count?: number;
  threshold?: number;
  total: number;
  days: number;
  overall_sentiment: number;
  avg_confidence: number;
  sentiment_dist: { sentiment_label: string; count: number }[];
  daily_trend: { date: string; avg_sentiment: number; count: number }[];
  emotions: Record<string, number>;
  top_topics: { topic: string; count: number }[];
  risk_rates: Record<string, number>;
  weekly_trends: {
    week: string;
    total: number;
    avg_sentiment: number;
    top_topics: [string, number][];
  }[];
  latest_summary: {
    ai_summary: string;
    recommendations: string[];
    generated_at: string;
    period: string;
    feedback_count: number;
  } | null;
}

// ── Sentiment gauge component ──────────────────────────────────────────────
function SentimentGauge({ score }: { score: number }) {
  const pct = ((score + 1) / 2) * 100;
  const color = score > 0.2 ? "#1DD1A1" : score < -0.2 ? "#FF6B6B" : "#FECA57";
  const label =
    score > 0.2 ? "Positive" : score < -0.2 ? "Negative" : "Neutral";

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-40 h-20 overflow-hidden">
        {/* Semicircle track */}
        <svg viewBox="0 0 160 80" className="w-full h-full">
          <path
            d="M 8 80 A 72 72 0 0 1 152 80"
            fill="none"
            stroke="var(--card-border)"
            strokeWidth="12"
            strokeLinecap="round"
          />
          <path
            d="M 8 80 A 72 72 0 0 1 152 80"
            fill="none"
            stroke={color}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * 226} 226`}
            style={{ transition: "stroke-dasharray 1s ease, stroke 0.5s ease" }}
          />
          <text
            x="80"
            y="75"
            textAnchor="middle"
            fontSize="18"
            fontWeight="700"
            fill={color}
          >
            {score > 0 ? "+" : ""}
            {score.toFixed(2)}
          </text>
        </svg>
      </div>
      <span className="text-xs font-semibold" style={{ color }}>
        {label}
      </span>
    </div>
  );
}

// ── Risk Gauge bar ─────────────────────────────────────────────────────────
function RiskBar({
  label,
  icon,
  pct,
  color,
}: {
  label: string;
  icon: string;
  pct: number;
  color: string;
}) {
  const severity = pct > 40 ? "High" : pct > 20 ? "Medium" : "Low";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium" style={{ color: "var(--text-dark)" }}>
          {icon} {label}
        </span>
        <span className="font-bold" style={{ color }}>
          {pct}% <span className="font-normal opacity-60">{severity}</span>
        </span>
      </div>
      <div
        className="h-2 rounded-full overflow-hidden"
        style={{ background: "var(--card-border)" }}
      >
        <div
          className="h-full rounded-full transition-all duration-1000"
          style={{ width: `${Math.min(pct, 100)}%`, background: color }}
        />
      </div>
    </div>
  );
}

// ── Employee Submission View ────────────────────────────────────────────────
function SubmitView({ token }: { token: string }) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [msg, setMsg] = useState("");
  const maxLen = 2000;

  const submit = useCallback(async () => {
    if (text.trim().length < 10) {
      setMsg("Please write at least 10 characters.");
      setStatus("error");
      return;
    }
    setStatus("loading");
    try {
      const res = await apiPost(token, "/feedback/submit/", { text });
      if (res.status === "submitted") {
        setStatus("success");
        setMsg(res.message);
        setText("");
      } else {
        setStatus("error");
        setMsg(res.error || "Submission failed. Please try again.");
      }
    } catch {
      setStatus("error");
      setMsg("Network error. Please try again.");
    }
  }, [token, text]);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-16"
      style={{ background: "var(--page-bg)" }}
    >
      {/* Header */}
      <div className="text-center mb-10 max-w-lg">
        <div className="text-5xl mb-4">🔒</div>
        <h1
          className="text-3xl font-bold mb-3"
          style={{
            fontFamily: "'Georgia', serif",
            color: "var(--text-dark)",
          }}
        >
          Anonymous Pulse
        </h1>
        <p
          className="text-sm leading-relaxed"
          style={{ color: "var(--text-muted)" }}
        >
          Share what's on your mind. Your submission is completely anonymous —
          no identity, no department, no metadata is stored or accessible by
          anyone. Your voice shapes org-wide insights, not individual reports.
        </p>
      </div>

      {/* Privacy Pillars */}
      <div className="flex gap-6 mb-10 flex-wrap justify-center">
        {[
          { icon: "👤", label: "No Identity" },
          { icon: "🚫", label: "No Raw Access" },
          { icon: "📊", label: "Aggregated Only" },
          { icon: "🔐", label: "Zero Traceability" },
        ].map((p) => (
          <div
            key={p.label}
            className="flex flex-col items-center gap-1.5 text-center"
          >
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-lg"
              style={{ background: "var(--primary-pale)" }}
            >
              {p.icon}
            </div>
            <span
              className="text-[11px] font-semibold"
              style={{ color: "var(--text-muted)" }}
            >
              {p.label}
            </span>
          </div>
        ))}
      </div>

      {/* Card */}
      <div
        className="w-full max-w-xl rounded-2xl p-8 shadow-lg border"
        style={{
          background: "var(--card-bg)",
          borderColor: "var(--card-border)",
        }}
      >
        {status === "success" ? (
          <div className="text-center py-8">
            <div className="text-5xl mb-4">✅</div>
            <h2
              className="text-xl font-bold mb-2"
              style={{ color: "var(--text-dark)" }}
            >
              Received
            </h2>
            <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
              {msg}
            </p>
            <button
              onClick={() => {
                setStatus("idle");
                setMsg("");
              }}
              className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white"
              style={{ background: "var(--primary)" }}
            >
              Submit Another
            </button>
          </div>
        ) : (
          <>
            <label
              className="block text-sm font-semibold mb-3"
              style={{ color: "var(--text-dark)" }}
            >
              How are you really feeling at work?
            </label>
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                if (status !== "idle") setStatus("idle");
              }}
              placeholder="Share anything — workload, culture, management, growth opportunities, team dynamics... Your honest perspective helps leadership understand what's really happening."
              rows={7}
              maxLength={maxLen}
              className="w-full rounded-xl p-4 text-sm resize-none outline-none border transition-all"
              style={{
                background: "var(--page-bg)",
                borderColor:
                  status === "error" ? "#FF6B6B" : "var(--card-border)",
                color: "var(--text-dark)",
                fontFamily: "inherit",
              }}
            />
            <div className="flex items-center justify-between mt-2 mb-5">
              <span
                className="text-xs"
                style={{
                  color: status === "error" ? "#FF6B6B" : "var(--text-muted)",
                }}
              >
                {status === "error" ? msg : `${text.length}/${maxLen}`}
              </span>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                Min 10 characters
              </span>
            </div>

            <button
              onClick={submit}
              disabled={status === "loading"}
              className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all"
              style={{
                background:
                  status === "loading"
                    ? "var(--primary-pale)"
                    : "var(--primary)",
                color: status === "loading" ? "var(--primary)" : "white",
                cursor: status === "loading" ? "not-allowed" : "pointer",
              }}
            >
              {status === "loading" ? "Submitting..." : "Submit Anonymously →"}
            </button>

            <p
              className="text-center text-[11px] mt-4"
              style={{ color: "var(--text-muted)" }}
            >
              Your submission will be processed by AI to extract insights. Raw
              text is permanently deleted after analysis.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ── Manager Insights Dashboard ─────────────────────────────────────────────
function InsightsDashboard({ token }: { token: string }) {
  const [data, setData] = useState<OrgInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [genLoading, setGenLoading] = useState(false);
  const [genMsg, setGenMsg] = useState("");

  const load = useCallback(
    async (d: number) => {
      setLoading(true);
      try {
        const res = await apiGet(token, `/feedback/insights/?days=${d}`);
        setData(res);
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    load(days);
  }, [days, load]);

  const generateSummary = async () => {
    setGenLoading(true);
    setGenMsg("");
    try {
      const res = await apiPost(token, "/feedback/generate-summary/");
      setGenMsg(res.message || "Queued successfully.");
      setTimeout(() => load(days), 3000);
    } finally {
      setGenLoading(false);
    }
  };

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "var(--page-bg)" }}
      >
        <div className="text-center">
          <div
            className="w-12 h-12 rounded-full border-4 border-t-transparent animate-spin mx-auto mb-4"
            style={{
              borderColor: "var(--primary)",
              borderTopColor: "transparent",
            }}
          />
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Loading org insights...
          </p>
        </div>
      </div>
    );
  }

  if (!data || data.insufficient_data) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center px-4"
        style={{ background: "var(--page-bg)" }}
      >
        <div className="text-6xl mb-4">📭</div>
        <h2
          className="text-xl font-bold mb-2"
          style={{ color: "var(--text-dark)" }}
        >
          Insufficient Data
        </h2>
        <p
          className="text-sm text-center max-w-sm"
          style={{ color: "var(--text-muted)" }}
        >
          At least {data?.threshold ?? 5} anonymous submissions are needed to
          generate reliable insights. Currently {data?.count ?? 0} submission
          {data?.count !== 1 ? "s" : ""} received.
        </p>
        <p
          className="text-xs mt-4 opacity-60"
          style={{ color: "var(--text-muted)" }}
        >
          Org-wide insights appear once enough employees participate.
        </p>
      </div>
    );
  }

  const emotionRadarData = Object.entries(data.emotions).map(([k, v]) => ({
    emotion: k.charAt(0).toUpperCase() + k.slice(1),
    value: Math.round(v * 100),
    fullMark: 100,
  }));

  const sentimentDist = data.sentiment_dist.map((s) => ({
    name:
      s.sentiment_label.charAt(0).toUpperCase() + s.sentiment_label.slice(1),
    value: s.count,
  }));

  const topicsData = data.top_topics.slice(0, 6).map((t) => ({
    name: TOPIC_LABELS[t.topic] ?? t.topic,
    count: t.count,
  }));

  return (
    <div className="min-h-screen" style={{ background: "var(--page-bg)" }}>
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1
              className="text-2xl font-bold"
              style={{
                fontFamily: "'Georgia', serif",
                color: "var(--text-dark)",
              }}
            >
              🔒 Org Pulse Dashboard
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
              Aggregated insights only · No individual data · {data.total}{" "}
              submissions in last {data.days} days
            </p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="text-xs px-3 py-2 rounded-lg border outline-none"
              style={{
                background: "var(--card-bg)",
                borderColor: "var(--card-border)",
                color: "var(--text-dark)",
              }}
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={60}>Last 60 days</option>
              <option value={90}>Last 90 days</option>
            </select>
            <button
              onClick={generateSummary}
              disabled={genLoading}
              className="text-xs px-4 py-2 rounded-lg font-semibold text-white"
              style={{
                background: genLoading
                  ? "var(--primary-pale)"
                  : "var(--primary)",
                color: genLoading ? "var(--primary)" : "white",
              }}
            >
              {genLoading ? "Generating..." : "✨ Generate AI Summary"}
            </button>
          </div>
        </div>
        {genMsg && (
          <div
            className="mb-4 text-xs px-4 py-2 rounded-lg"
            style={{
              background: "var(--primary-pale)",
              color: "var(--primary)",
            }}
          >
            {genMsg}
          </div>
        )}

        {/* Privacy reminder banner */}
        <div
          className="mb-6 px-5 py-3 rounded-xl flex items-center gap-3 text-xs"
          style={{ background: "var(--primary-pale)", color: "var(--primary)" }}
        >
          <span className="text-base">🛡️</span>
          <span>
            <strong>Org-wide insights only.</strong> No segmentation, no
            filters, no individual identification. All data is aggregated across
            the entire organisation.
          </span>
        </div>

        {/* Row 1: Sentiment + Emotions + Risk */}
        <div className="grid grid-cols-3 gap-5 mb-5">
          {/* Sentiment Overview */}
          <div
            className="col-span-1 rounded-2xl p-6 border flex flex-col items-center gap-4"
            style={{
              background: "var(--card-bg)",
              borderColor: "var(--card-border)",
            }}
          >
            <h3
              className="text-sm font-bold w-full"
              style={{ color: "var(--text-dark)" }}
            >
              Overall Sentiment
            </h3>
            <SentimentGauge score={data.overall_sentiment} />
            <div className="w-full space-y-2 pt-2">
              {sentimentDist.map((s) => (
                <div
                  key={s.name}
                  className="flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{
                        background:
                          SENTIMENT_COLORS[s.name.toLowerCase()] ?? "#A29BFE",
                      }}
                    />
                    <span style={{ color: "var(--text-muted)" }}>{s.name}</span>
                  </div>
                  <span
                    className="font-semibold"
                    style={{ color: "var(--text-dark)" }}
                  >
                    {Math.round((s.value / data.total) * 100)}%
                  </span>
                </div>
              ))}
            </div>
            <div className="w-full pt-2 text-center">
              <span
                className="text-[11px]"
                style={{ color: "var(--text-muted)" }}
              >
                Confidence:{" "}
                <strong>{Math.round(data.avg_confidence * 100)}%</strong>
              </span>
            </div>
          </div>

          {/* Emotional Radar */}
          <div
            className="col-span-1 rounded-2xl p-6 border"
            style={{
              background: "var(--card-bg)",
              borderColor: "var(--card-border)",
            }}
          >
            <h3
              className="text-sm font-bold mb-4"
              style={{ color: "var(--text-dark)" }}
            >
              Emotional Landscape
            </h3>
            <ResponsiveContainer width="100%" height={180}>
              <RadarChart data={emotionRadarData}>
                <PolarGrid stroke="var(--card-border)" />
                <PolarAngleAxis
                  dataKey="emotion"
                  tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                />
                <PolarRadiusAxis
                  domain={[0, 100]}
                  tick={false}
                  axisLine={false}
                />
                <Radar
                  dataKey="value"
                  stroke="var(--primary)"
                  fill="var(--primary)"
                  fillOpacity={0.25}
                  strokeWidth={2}
                />
              </RadarChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {Object.entries(data.emotions).map(([k, v]) => (
                <div key={k} className="flex items-center gap-1.5 text-xs">
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: EMOTION_COLORS[k] }}
                  />
                  <span style={{ color: "var(--text-muted)" }}>
                    {k.charAt(0).toUpperCase() + k.slice(1)}
                  </span>
                  <span
                    className="font-bold ml-auto"
                    style={{ color: EMOTION_COLORS[k] }}
                  >
                    {Math.round(v * 100)}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Risk Signals */}
          <div
            className="col-span-1 rounded-2xl p-6 border"
            style={{
              background: "var(--card-bg)",
              borderColor: "var(--card-border)",
            }}
          >
            <h3
              className="text-sm font-bold mb-5"
              style={{ color: "var(--text-dark)" }}
            >
              Risk Signals
            </h3>
            <div className="space-y-4">
              {Object.entries(RISK_META).map(([k, meta]) => (
                <RiskBar
                  key={k}
                  label={meta.label}
                  icon={meta.icon}
                  pct={data.risk_rates[k] ?? 0}
                  color={meta.color}
                />
              ))}
            </div>
            <p
              className="text-[10px] mt-4 leading-relaxed"
              style={{ color: "var(--text-muted)" }}
            >
              % of submissions flagging each risk. Above 30% warrants attention.
            </p>
          </div>
        </div>

        {/* Row 2: Sentiment trend + Topic frequency */}
        <div className="grid grid-cols-5 gap-5 mb-5">
          {/* Sentiment trend */}
          <div
            className="col-span-3 rounded-2xl p-6 border"
            style={{
              background: "var(--card-bg)",
              borderColor: "var(--card-border)",
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3
                className="text-sm font-bold"
                style={{ color: "var(--text-dark)" }}
              >
                Sentiment Trend
              </h3>
              <span
                className="text-[11px] px-2 py-0.5 rounded-full"
                style={{
                  background: "var(--primary-pale)",
                  color: "var(--primary)",
                }}
              >
                Daily average · {data.days}d
              </span>
            </div>
            {data.daily_trend.length === 0 ? (
              <div
                className="h-48 flex items-center justify-center text-xs"
                style={{ color: "var(--text-muted)" }}
              >
                No trend data available
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart
                  data={data.daily_trend}
                  margin={{ left: -20, right: 10 }}
                >
                  <defs>
                    <linearGradient id="sentGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="5%"
                        stopColor="var(--primary)"
                        stopOpacity={0.3}
                      />
                      <stop
                        offset="95%"
                        stopColor="var(--primary)"
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--card-border)"
                  />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                    tickFormatter={(d) => d.slice(5)}
                  />
                  <YAxis
                    domain={[-1, 1]}
                    tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                    tickFormatter={(v) => v.toFixed(1)}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--card-bg)",
                      border: "1px solid var(--card-border)",
                      borderRadius: 10,
                      fontSize: 11,
                    }}
                    formatter={(v) => [Number(v).toFixed(2), "Sentiment"]}
                    labelFormatter={(l) => `Date: ${l}`}
                  />
                  <Area
                    dataKey="avg_sentiment"
                    stroke="var(--primary)"
                    fill="url(#sentGrad)"
                    strokeWidth={2}
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Top topics pie */}
          <div
            className="col-span-2 rounded-2xl p-6 border"
            style={{
              background: "var(--card-bg)",
              borderColor: "var(--card-border)",
            }}
          >
            <h3
              className="text-sm font-bold mb-4"
              style={{ color: "var(--text-dark)" }}
            >
              Top Emerging Themes
            </h3>
            {topicsData.length === 0 ? (
              <div
                className="h-40 flex items-center justify-center text-xs"
                style={{ color: "var(--text-muted)" }}
              >
                No topic data
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={topicsData}
                    dataKey="count"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={65}
                    innerRadius={35}
                    paddingAngle={3}
                  >
                    {topicsData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "var(--card-bg)",
                      border: "1px solid var(--card-border)",
                      borderRadius: 10,
                      fontSize: 11,
                    }}
                    formatter={(v, n) => [v, n]}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
            <div className="space-y-1.5 mt-2">
              {topicsData.slice(0, 4).map((t, i) => (
                <div
                  key={t.name}
                  className="flex items-center justify-between text-[11px]"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ background: PIE_COLORS[i] }}
                    />
                    <span style={{ color: "var(--text-muted)" }}>{t.name}</span>
                  </div>
                  <span
                    className="font-semibold"
                    style={{ color: "var(--text-dark)" }}
                  >
                    {t.count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Row 3: Topic bar chart + Weekly trends */}
        <div className="grid grid-cols-5 gap-5 mb-5">
          {/* Topic frequency bar */}
          <div
            className="col-span-3 rounded-2xl p-6 border"
            style={{
              background: "var(--card-bg)",
              borderColor: "var(--card-border)",
            }}
          >
            <h3
              className="text-sm font-bold mb-4"
              style={{ color: "var(--text-dark)" }}
            >
              Theme Frequency
            </h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={topicsData}
                layout="vertical"
                margin={{ left: 10, right: 20 }}
              >
                <XAxis
                  type="number"
                  tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 10, fill: "var(--text-dark)" }}
                  axisLine={false}
                  tickLine={false}
                  width={120}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--card-bg)",
                    border: "1px solid var(--card-border)",
                    borderRadius: 10,
                    fontSize: 11,
                  }}
                  formatter={(v) => [v, "Mentions"]}
                />
                <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                  {topicsData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Weekly trend mini cards */}
          <div
            className="col-span-2 rounded-2xl p-6 border"
            style={{
              background: "var(--card-bg)",
              borderColor: "var(--card-border)",
            }}
          >
            <h3
              className="text-sm font-bold mb-4"
              style={{ color: "var(--text-dark)" }}
            >
              Weekly Breakdown
            </h3>
            <div className="space-y-3">
              {data.weekly_trends.map((w, i) => {
                const c =
                  w.avg_sentiment > 0.2
                    ? "#1DD1A1"
                    : w.avg_sentiment < -0.2
                      ? "#FF6B6B"
                      : "#FECA57";
                return (
                  <div
                    key={i}
                    className="rounded-xl p-3 flex items-center justify-between"
                    style={{ background: "var(--page-bg)" }}
                  >
                    <div>
                      <div
                        className="text-xs font-semibold"
                        style={{ color: "var(--text-dark)" }}
                      >
                        {w.week}
                      </div>
                      <div
                        className="text-[10px] mt-0.5"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {w.total} submission{w.total !== 1 ? "s" : ""}
                        {w.top_topics?.[0]
                          ? ` · ${TOPIC_LABELS[w.top_topics[0][0]] ?? w.top_topics[0][0]}`
                          : ""}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold" style={{ color: c }}>
                        {w.avg_sentiment > 0 ? "+" : ""}
                        {w.avg_sentiment.toFixed(2)}
                      </div>
                      <div
                        className="text-[10px]"
                        style={{ color: "var(--text-muted)" }}
                      >
                        sentiment
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Row 4: AI Summary */}
        {data.latest_summary && (
          <div
            className="rounded-2xl p-6 border mb-5"
            style={{
              background: "var(--card-bg)",
              borderColor: "var(--card-border)",
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3
                className="text-sm font-bold"
                style={{ color: "var(--text-dark)" }}
              >
                ✨ AI-Generated Org Summary
              </h3>
              <div
                className="text-[11px]"
                style={{ color: "var(--text-muted)" }}
              >
                {data.latest_summary.period} ·{" "}
                {data.latest_summary.feedback_count} submissions
              </div>
            </div>
            <div className="grid grid-cols-5 gap-6">
              <div className="col-span-3">
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: "var(--text-dark)" }}
                >
                  {data.latest_summary.ai_summary}
                </p>
              </div>
              <div className="col-span-2">
                <h4
                  className="text-xs font-bold mb-3"
                  style={{ color: "var(--text-muted)" }}
                >
                  RECOMMENDED ACTIONS
                </h4>
                <div className="space-y-2">
                  {data.latest_summary.recommendations.map((rec, i) => (
                    <div key={i} className="flex items-start gap-2.5 text-xs">
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 mt-0.5"
                        style={{ background: "var(--primary)" }}
                      >
                        {i + 1}
                      </div>
                      <span style={{ color: "var(--text-dark)" }}>{rec}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer disclaimer */}
        <div
          className="text-center text-[11px] mt-4 pb-4"
          style={{ color: "var(--text-muted)" }}
        >
          🔒 All data shown is aggregated org-wide · No individual, team, or
          department can be identified · Confidence based on submission volume
        </div>
      </div>
    </div>
  );
}

// ── Main Export ─────────────────────────────────────────────────────────────
export default function FeedbackPage({
  token,
  role,
}: {
  token: string;
  role: string;
}) {
  const isManager = ["manager", "hr", "cfo", "admin"].includes(role);

  return (
    <div
      className="flex flex-col min-h-screen"
      style={{ background: "var(--page-bg)" }}
    >
      {isManager ? (
        <div>
          {/* Managers see both submission + dashboard */}
          <div
            className="border-b px-6 py-3 flex gap-4"
            style={{
              background: "var(--card-bg)",
              borderColor: "var(--card-border)",
            }}
          >
            <ManagerTabView token={token} />
          </div>
        </div>
      ) : (
        <SubmitView token={token} />
      )}
    </div>
  );
}

function ManagerTabView({ token }: { token: string }) {
  const [tab, setTab] = useState<"submit" | "insights">("insights");

  return (
    <div className="w-full">
      <div
        className="flex gap-1 px-6 pt-4 pb-0 border-b"
        style={{
          borderColor: "var(--card-border)",
          background: "var(--card-bg)",
        }}
      >
        {[
          { id: "insights", label: "📊 Org Pulse" },
          { id: "submit", label: "🔒 Submit Feedback" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as typeof tab)}
            className="text-xs font-semibold px-5 py-2.5 rounded-t-lg transition-all border-b-2"
            style={{
              borderBottomColor:
                tab === t.id ? "var(--primary)" : "transparent",
              color: tab === t.id ? "var(--primary)" : "var(--text-muted)",
              background: "transparent",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "insights" ? (
        <InsightsDashboard token={token} />
      ) : (
        <SubmitView token={token} />
      )}
    </div>
  );
}
