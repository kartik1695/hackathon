import React, { useState, useMemo } from "react";

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
  applied_by_name?: string;
}

interface LeaveTableProps {
  leaves: Leave[];
  loading: boolean;
  isManager?: boolean;
  onApprove?: (id: number) => void;
  onReject?: (id: number) => void;
  onCancel?: (id: number) => void;
}

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  PENDING: { bg: "#FEF3C7", color: "#92400E" },
  APPROVED: { bg: "#D1FAE5", color: "#065F46" },
  REJECTED: { bg: "#FEE2E2", color: "#991B1B" },
  CANCELLED: { bg: "#F3F4F6", color: "#6B7280" },
};

const TYPE_LABELS: Record<string, string> = {
  CL: "Casual",
  SL: "Sick",
  PL: "Privilege",
  LOP: "LOP",
  CO: "Comp Off",
};
const ALL_TYPES = ["CL", "SL", "PL", "LOP", "CO"];

function exportCSV(leaves: Leave[], isManager: boolean) {
  const headers = isManager
    ? ["Employee", "Type", "From", "To", "Days", "Status", "Reason"]
    : ["Type", "From", "To", "Days", "Status", "Reason"];
  const rows = leaves.map((lv) =>
    isManager
      ? [
          lv.employee_name ?? "",
          TYPE_LABELS[lv.leave_type] ?? lv.leave_type,
          lv.from_date,
          lv.to_date,
          lv.days_count,
          lv.status,
          `"${(lv.reason ?? "").replace(/"/g, '""')}"`,
        ]
      : [
          TYPE_LABELS[lv.leave_type] ?? lv.leave_type,
          lv.from_date,
          lv.to_date,
          lv.days_count,
          lv.status,
          `"${(lv.reason ?? "").replace(/"/g, '""')}"`,
        ],
  );
  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "leaves.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function LeaveTable({
  leaves,
  loading,
  isManager,
  onApprove,
  onReject,
  onCancel,
}: LeaveTableProps) {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [nameFilter, setNameFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const filtered = useMemo(() => {
    return leaves.filter((lv) => {
      if (fromDate && lv.from_date < fromDate) return false;
      if (toDate && lv.to_date > toDate) return false;
      if (typeFilter && lv.leave_type !== typeFilter) return false;
      if (
        nameFilter &&
        !(lv.employee_name ?? "")
          .toLowerCase()
          .includes(nameFilter.toLowerCase())
      )
        return false;
      return true;
    });
  }, [leaves, fromDate, toDate, typeFilter, nameFilter]);

  const hasFilters = fromDate || toDate || typeFilter || nameFilter;

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-16 rounded-2xl animate-pulse"
            style={{ background: "var(--accentLight)" }}
          />
        ))}
      </div>
    );
  }

  return (
    <div>
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          className="text-xs px-3 py-2 rounded-xl border outline-none focus:ring-1"
          style={{
            borderColor: "var(--cardBorder)",
            background: "var(--card)",
            color: "var(--ink)",
          }}
          placeholder="From"
          title="From date"
        />
        <input
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          className="text-xs px-3 py-2 rounded-xl border outline-none"
          style={{
            borderColor: "var(--cardBorder)",
            background: "var(--card)",
            color: "var(--ink)",
          }}
          placeholder="To"
          title="To date"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="text-xs px-3 py-2 rounded-xl border outline-none"
          style={{
            borderColor: "var(--cardBorder)",
            background: "var(--card)",
            color: "var(--ink)",
          }}
        >
          <option value="">All Types</option>
          {ALL_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        {isManager && (
          <input
            type="text"
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
            placeholder="Search name…"
            className="text-xs px-3 py-2 rounded-xl border outline-none"
            style={{
              borderColor: "var(--cardBorder)",
              background: "var(--card)",
              color: "var(--ink)",
            }}
          />
        )}
        {hasFilters && (
          <button
            onClick={() => {
              setFromDate("");
              setToDate("");
              setTypeFilter("");
              setNameFilter("");
            }}
            className="text-xs px-3 py-2 rounded-xl font-semibold"
            style={{ background: "var(--accentLight)", color: "var(--accent)" }}
          >
            Clear
          </button>
        )}
        <div className="flex-1" />
        <button
          onClick={() => exportCSV(filtered, !!isManager)}
          disabled={filtered.length === 0}
          className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl font-semibold disabled:opacity-40 transition-all"
          style={{ background: "var(--navPill)", color: "white" }}
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
          {filtered.length !== leaves.length && `(${filtered.length})`}
        </button>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="py-12 text-center">
          <div className="text-4xl mb-3">🌿</div>
          <p className="text-sm font-medium" style={{ color: "var(--muted)" }}>
            {hasFilters
              ? "No results match your filters"
              : "No leave requests found"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((lv) => {
            const ss = STATUS_STYLES[lv.status] ?? {
              bg: "#F3F4F6",
              color: "#6B7280",
            };
            const typeLabel = TYPE_LABELS[lv.leave_type] ?? lv.leave_type;
            return (
              <div
                key={lv.id}
                className="flex items-center gap-3 px-4 py-3 rounded-2xl transition-all group"
                style={{
                  background: "var(--card)",
                  border: "1px solid var(--cardBorder)",
                }}
              >
                {/* Type badge */}
                <span
                  className="text-xs font-bold px-2.5 py-1 rounded-lg flex-shrink-0"
                  style={{
                    background: "var(--navPill)",
                    color: "white",
                    minWidth: "60px",
                    textAlign: "center",
                  }}
                >
                  {typeLabel}
                </span>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  {isManager && lv.employee_name && (
                    <p
                      className="text-xs font-bold mb-0.5"
                      style={{ color: "var(--ink)" }}
                    >
                      {lv.employee_name}
                    </p>
                  )}
                  <div className="flex items-center gap-2">
                    <span
                      className="text-sm font-medium"
                      style={{ color: "var(--ink)" }}
                    >
                      {lv.from_date} → {lv.to_date}
                    </span>
                    {lv.is_half_day && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-full"
                        style={{
                          background: "var(--accentLight)",
                          color: "var(--accent)",
                        }}
                      >
                        half day
                      </span>
                    )}
                  </div>
                  {lv.reason && (
                    <p
                      className="text-xs truncate mt-0.5"
                      style={{ color: "var(--muted)" }}
                    >
                      {lv.reason}
                    </p>
                  )}
                </div>

                {/* Days */}
                <span
                  className="text-sm font-bold flex-shrink-0"
                  style={{ color: "var(--ink)" }}
                >
                  {lv.days_count}d
                </span>

                {/* Status */}
                <span
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-full flex-shrink-0"
                  style={{ background: ss.bg, color: ss.color }}
                >
                  {lv.status.charAt(0) + lv.status.slice(1).toLowerCase()}
                </span>

                {/* Actions */}
                <div className="flex gap-2 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  {isManager && lv.status === "PENDING" && (
                    <>
                      <button
                        onClick={() => onApprove?.(lv.id)}
                        className="px-3 py-1.5 text-white text-xs font-semibold rounded-full transition-all hover:opacity-80"
                        style={{ background: "var(--accent)" }}
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => onReject?.(lv.id)}
                        className="px-3 py-1.5 bg-red-500 text-white text-xs font-semibold rounded-full hover:bg-red-600 transition-colors"
                      >
                        Reject
                      </button>
                    </>
                  )}
                  {!isManager && lv.status === "PENDING" && (
                    <button
                      onClick={() => onCancel?.(lv.id)}
                      className="px-3 py-1.5 text-xs font-semibold rounded-full transition-colors"
                      style={{
                        border: "1px solid var(--cardBorder)",
                        color: "var(--muted)",
                      }}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
