import React, { useState } from "react";
import GlassCard from "../ui/GlassCard";

const BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8002/api";

interface ApplyLeaveFormProps {
  token: string;
  onSuccess: () => void;
  onCancel: () => void;
}

const LEAVE_TYPES = [
  { value: "CL", label: "Casual Leave" },
  { value: "SL", label: "Sick Leave" },
  { value: "PL", label: "Privilege Leave" },
  { value: "LOP", label: "Loss of Pay" },
  { value: "CO", label: "Comp Off" },
];

export default function ApplyLeaveForm({
  token,
  onSuccess,
  onCancel,
}: ApplyLeaveFormProps) {
  const [form, setForm] = useState({
    leave_type: "CL",
    from_date: "",
    to_date: "",
    is_half_day: false,
    half_day_period: "AM",
    reason: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        leave_type: form.leave_type,
        from_date: form.from_date,
        to_date: form.is_half_day ? form.from_date : form.to_date,
        reason: form.reason,
        is_half_day: form.is_half_day,
      };
      if (form.is_half_day) body.half_day_period = form.half_day_period;

      const res = await fetch(`${BASE}/leaves/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || data.detail || "Failed to apply leave");
      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <GlassCard className="max-w-lg w-full">
      <div className="flex items-center justify-between mb-6">
        <h3
          style={{
            fontSize: 18,
            fontWeight: 250,
            letterSpacing: "-0.01em",
            color: "var(--ink)",
            margin: 0,
          }}
        >
          Apply Leave
        </h3>
        <button
          onClick={onCancel}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 18,
            color: "var(--muted)",
            lineHeight: 1,
          }}
        >
          ✕
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              color: "var(--muted)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              display: "block",
              marginBottom: 6,
            }}
          >
            Leave Type
          </label>
          <div className="flex flex-wrap gap-2">
            {LEAVE_TYPES.map((lt) => (
              <button
                key={lt.value}
                type="button"
                onClick={() => setForm((f) => ({ ...f, leave_type: lt.value }))}
                style={{
                  padding: "6px 14px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: "inherit",
                  cursor: "pointer",
                  transition: "all 0.15s",
                  background:
                    form.leave_type === lt.value
                      ? "var(--navPill)"
                      : "var(--surface2)",
                  color: form.leave_type === lt.value ? "#fff" : "var(--muted)",
                  border:
                    form.leave_type === lt.value
                      ? "none"
                      : "1px solid var(--cardBorder)",
                }}
              >
                {lt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <div
              onClick={() =>
                setForm((f) => ({ ...f, is_half_day: !f.is_half_day }))
              }
              style={{
                width: 40,
                height: 20,
                borderRadius: 999,
                cursor: "pointer",
                background: form.is_half_day
                  ? "var(--accent)"
                  : "var(--border)",
                position: "relative",
                transition: "background 0.2s",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 2,
                  width: 16,
                  height: 16,
                  background: "#fff",
                  borderRadius: "50%",
                  transition: "left 0.2s",
                  left: form.is_half_day ? 22 : 2,
                  boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
                }}
              />
            </div>
            <span
              style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)" }}
            >
              Half Day
            </span>
          </label>
          {form.is_half_day && (
            <div className="flex gap-2">
              {["AM", "PM"].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, half_day_period: p }))}
                  style={{
                    padding: "4px 14px",
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 600,
                    fontFamily: "inherit",
                    cursor: "pointer",
                    background:
                      form.half_day_period === p
                        ? "var(--accent)"
                        : "var(--surface2)",
                    color: form.half_day_period === p ? "#fff" : "var(--muted)",
                    border: "none",
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              style={{
                fontSize: 10.5,
                fontWeight: 600,
                color: "var(--muted)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                display: "block",
                marginBottom: 6,
              }}
            >
              {form.is_half_day ? "Date" : "From Date"}
            </label>
            <input
              type="date"
              required
              value={form.from_date}
              onChange={(e) =>
                setForm((f) => ({ ...f, from_date: e.target.value }))
              }
              style={{
                width: "100%",
                padding: "9px 12px",
                borderRadius: 12,
                boxSizing: "border-box",
                background: "var(--card)",
                border: "1px solid var(--cardBorder)",
                fontSize: 13,
                color: "var(--ink)",
                fontFamily: "inherit",
                outline: "none",
              }}
            />
          </div>
          {!form.is_half_day && (
            <div>
              <label
                style={{
                  fontSize: 10.5,
                  fontWeight: 600,
                  color: "var(--muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  display: "block",
                  marginBottom: 6,
                }}
              >
                To Date
              </label>
              <input
                type="date"
                required
                value={form.to_date}
                min={form.from_date}
                onChange={(e) =>
                  setForm((f) => ({ ...f, to_date: e.target.value }))
                }
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: 12,
                  boxSizing: "border-box",
                  background: "var(--card)",
                  border: "1px solid var(--cardBorder)",
                  fontSize: 13,
                  color: "var(--ink)",
                  fontFamily: "inherit",
                  outline: "none",
                }}
              />
            </div>
          )}
        </div>

        <div>
          <label
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              color: "var(--muted)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              display: "block",
              marginBottom: 6,
            }}
          >
            Reason
          </label>
          <textarea
            required
            rows={3}
            value={form.reason}
            onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
            placeholder="Brief reason for leave..."
            style={{
              width: "100%",
              padding: "9px 12px",
              borderRadius: 12,
              boxSizing: "border-box",
              background: "var(--card)",
              border: "1px solid var(--cardBorder)",
              fontSize: 13,
              color: "var(--ink)",
              fontFamily: "inherit",
              outline: "none",
              resize: "none",
            }}
          />
        </div>

        {error && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.2)",
              fontSize: 12.5,
              color: "#ef4444",
            }}
          >
            {error}
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onCancel}
            style={{
              flex: 1,
              padding: "10px",
              borderRadius: 999,
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 13.5,
              fontWeight: 600,
              background: "transparent",
              border: "1px solid var(--cardBorder)",
              color: "var(--muted)",
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            style={{
              flex: 1,
              padding: "10px",
              borderRadius: 999,
              cursor: loading ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              fontSize: 13.5,
              fontWeight: 600,
              background: "var(--navPill)",
              color: "#fff",
              border: "none",
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "Submitting..." : "Apply Leave ↗"}
          </button>
        </div>
      </form>
    </GlassCard>
  );
}
