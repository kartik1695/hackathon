import { useState } from "react";

const BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8002/api";

const darkTeal = "var(--navPill)";
const teal = "var(--accent)";

interface Props {
  token: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function RegularizationForm({
  token,
  onSuccess,
  onCancel,
}: Props) {
  const [form, setForm] = useState({
    date: "",
    requested_check_in: "",
    requested_check_out: "",
    reason: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/attendance/regularization/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
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
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4"
        style={{
          background: "var(--card)",
          borderBottom: "1px solid var(--cardBorder)",
        }}
      >
        <div>
          <div className="font-bold text-sm" style={{ color: darkTeal }}>
            Regularization Request
          </div>
          <div className="text-[11px] mt-0.5" style={{ color: "#6B9E9A" }}>
            Correct a missed or incorrect attendance entry
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
        <div>
          <label
            className="text-[11px] font-semibold block mb-1.5"
            style={{ color: "#6B9E9A" }}
          >
            Date
          </label>
          <input
            type="date"
            required
            value={form.date}
            max={new Date().toISOString().split("T")[0]}
            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            className={inputCls}
            style={inputStyle}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              className="text-[11px] font-semibold block mb-1.5"
              style={{ color: "#6B9E9A" }}
            >
              Check-In Time
            </label>
            <input
              type="time"
              value={form.requested_check_in}
              onChange={(e) =>
                setForm((f) => ({ ...f, requested_check_in: e.target.value }))
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
              Check-Out Time <span style={{ color: teal }}>*</span>
            </label>
            <input
              type="time"
              required
              value={form.requested_check_out}
              onChange={(e) =>
                setForm((f) => ({ ...f, requested_check_out: e.target.value }))
              }
              className={inputCls}
              style={inputStyle}
            />
          </div>
        </div>

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
            placeholder="Explain why regularization is needed (forgotten clock-out, system issue, etc.)"
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
            style={{ background: darkTeal }}
          >
            {loading ? "Submitting..." : "Submit Request"}
          </button>
        </div>
      </form>
    </div>
  );
}
