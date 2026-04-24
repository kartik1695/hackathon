import { useState } from "react";

const BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8002/api";

const darkTeal = "var(--navPill)";
const teal = "var(--accent)";

interface Props {
  token: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function WFHForm({ token, onSuccess, onCancel }: Props) {
  const [form, setForm] = useState({ from_date: "", to_date: "", reason: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().split("T")[0];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/attendance/wfh/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          from_date: form.from_date,
          to_date: form.to_date || form.from_date,
          reason: form.reason,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.detail || "Failed");
      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const inputCls =
    "w-full px-3 py-2.5 rounded-xl border text-sm focus:outline-none transition-all";
  const inputStyle = {
    background: "var(--accentLight)",
    border: "1px solid var(--cardBorder)",
    color: darkTeal,
  };

  return (
    <div
      className="max-w-md w-full rounded-2xl overflow-hidden"
      style={{
        background: "var(--card)",
        border: "1px solid var(--cardBorder)",
        boxShadow: "0 16px 48px rgba(13,61,54,0.14)",
      }}
    >
      <div
        className="flex items-center justify-between px-5 py-4"
        style={{
          background: "var(--card)",
          borderBottom: "1px solid var(--cardBorder)",
        }}
      >
        <div>
          <div className="font-bold text-sm" style={{ color: darkTeal }}>
            Work From Home Request
          </div>
          <div className="text-[11px] mt-0.5" style={{ color: "#6B9E9A" }}>
            Minimum 1 working day advance notice required
          </div>
        </div>
        <button
          onClick={onCancel}
          className="w-7 h-7 flex items-center justify-center rounded-full transition-colors hover:bg-white/60"
          style={{ color: "#6B9E9A" }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path
              d="M18 6L6 18M6 6l12 12"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              className="text-[11px] font-semibold block mb-1.5"
              style={{ color: "#6B9E9A" }}
            >
              From Date <span style={{ color: teal }}>*</span>
            </label>
            <input
              type="date"
              required
              min={minDate}
              value={form.from_date}
              onChange={(e) =>
                setForm((f) => ({ ...f, from_date: e.target.value }))
              }
              className={inputCls}
              style={inputStyle}
            />
          </div>
          <div>
            <label
              className="text-[11px] font-semibold block mb-1.5"
              style={{ color: "#6B9E9A" }}
            >
              To Date
            </label>
            <input
              type="date"
              min={form.from_date || minDate}
              value={form.to_date}
              onChange={(e) =>
                setForm((f) => ({ ...f, to_date: e.target.value }))
              }
              className={inputCls}
              style={inputStyle}
            />
          </div>
        </div>

        {form.from_date && (
          <div
            className="text-[11px] px-3 py-2 rounded-lg"
            style={{ background: "#F0FDFB", color: "#6B9E9A" }}
          >
            {!form.to_date || form.to_date === form.from_date
              ? `1 day — ${form.from_date}`
              : `${Math.round((new Date(form.to_date).getTime() - new Date(form.from_date).getTime()) / 86400000) + 1} days — ${form.from_date} to ${form.to_date}`}
          </div>
        )}

        <div>
          <label
            className="text-[11px] font-semibold block mb-1.5"
            style={{ color: "#6B9E9A" }}
          >
            Reason <span style={{ color: teal }}>*</span>
          </label>
          <textarea
            required
            rows={3}
            value={form.reason}
            onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
            placeholder="Reason for working from home..."
            className={`${inputCls} resize-none`}
            style={inputStyle}
          />
        </div>

        {error && (
          <div
            className="px-3 py-2.5 rounded-xl text-sm"
            style={{
              background: "#FEF2F2",
              border: "1px solid #FECACA",
              color: "#DC2626",
            }}
          >
            {error}
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-full text-sm font-semibold transition-all"
            style={{
              border: "1px solid var(--cardBorder)",
              color: "var(--muted)",
              background: "transparent",
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 py-2.5 rounded-full text-sm font-semibold text-white transition-all disabled:opacity-50"
            style={{ background: teal }}
          >
            {loading ? "Submitting..." : "Apply WFH"}
          </button>
        </div>
      </form>
    </div>
  );
}
