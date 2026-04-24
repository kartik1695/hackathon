import React, { useEffect, useState } from "react";

const BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000/api";

interface EmployeePageProps {
  token: string;
  role: string;
}

interface Employee {
  id: number;
  employee_id: string;
  title: string;
  role: string;
  department?: { name: string };
  manager?: { user?: { name?: string } };
  is_active: boolean;
  user?: { name?: string; email?: string };
}

const ROLE_CONFIG: Record<string, { bg: string; text: string }> = {
  employee: { bg: "#F3F4F6", text: "#6B7280" },
  manager: { bg: "#DBEAFE", text: "#1D4ED8" },
  hr: { bg: "#F3E8FF", text: "#7C3AED" },
  cfo: { bg: "#FFEDD5", text: "#C2410C" },
  admin: { bg: "#111111", text: "#FFFFFF" },
};

const AVATAR_COLORS = [
  "#E8D44D",
  "#111111",
  "#F87171",
  "#34D399",
  "#60A5FA",
  "#F472B6",
  "#A78BFA",
];

function getInitials(name: string) {
  return (name || "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

const PAGE_SIZE = 24;

export default function EmployeePage({ token, role }: EmployeePageProps) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [filterRole, setFilterRole] = useState("all");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filterRole]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(PAGE_SIZE),
      });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (filterRole !== "all") params.set("role", filterRole);
      const res = await fetch(`${BASE}/employees/?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setEmployees(data);
          setTotalCount(data.length);
        } else {
          setEmployees(data.results ?? []);
          setTotalCount(data.count ?? 0);
        }
      }
      setLoading(false);
    }
    load();
  }, [token, page, debouncedSearch, filterRole]);

  const ROLES = ["all", "employee", "manager", "hr", "cfo"];
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div
      className="h-full overflow-y-auto"
      style={{ background: "transparent" }}
    >
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2
              className="text-xl font-bold"
              style={{ color: "var(--ink)" }}
            >
              People Directory
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {totalCount} employees
            </p>
          </div>
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-full text-xs text-gray-400"
            style={{
              background: "var(--card)",
              border: "1px solid var(--cardBorder)",
            }}
          >
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24">
              <circle
                cx="11"
                cy="11"
                r="8"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path
                d="M21 21l-3-3"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <input
              type="text"
              placeholder="Search people..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-transparent outline-none w-48 text-gray-700 placeholder-gray-400"
            />
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3 mb-5">
          <div
            className="rounded-2xl p-4 shadow-[0_1px_4px_rgba(0,0,0,0.07)]"
            style={{
              background: "var(--card)",
              border: "1px solid var(--cardBorder)",
            }}
          >
            <div
              className="text-3xl font-bold"
              style={{ color: "var(--ink)" }}
            >
              {totalCount || employees.length}
            </div>
            <div className="text-xs text-gray-400 mt-1">Total</div>
          </div>
          <div
            className="rounded-2xl p-4 shadow-[0_1px_4px_rgba(0,0,0,0.07)]"
            style={{ background: "var(--accent)", color: "white" }}
          >
            <div className="text-3xl font-bold">
              {employees.filter((e) => e.role === "manager").length}
            </div>
            <div
              className="text-xs mt-1"
              style={{ color: "rgba(255,255,255,0.6)" }}
            >
              Managers
            </div>
          </div>
          <div
            className="rounded-2xl p-4 shadow-[0_1px_4px_rgba(0,0,0,0.07)]"
            style={{
              background: "var(--card)",
              border: "1px solid var(--cardBorder)",
            }}
          >
            <div
              className="text-3xl font-bold"
              style={{ color: "var(--ink)" }}
            >
              {
                [
                  ...new Set(
                    employees.map((e) => e.department?.name).filter(Boolean),
                  ),
                ].length
              }
            </div>
            <div className="text-xs text-gray-400 mt-1">Departments</div>
          </div>
          <div
            className="rounded-2xl p-4 shadow-[0_1px_4px_rgba(0,0,0,0.07)]"
            style={{ background: "var(--navPill)", color: "white" }}
          >
            <div className="text-3xl font-bold">{totalPages}</div>
            <div
              className="text-xs mt-1"
              style={{ color: "rgba(255,255,255,0.4)" }}
            >
              Pages
            </div>
          </div>
        </div>

        <div
          className="rounded-2xl shadow-[0_1px_4px_rgba(0,0,0,0.07)] overflow-hidden"
          style={{
            background: "var(--card)",
            border: "1px solid var(--cardBorder)",
          }}
        >
          <div
            className="flex items-center justify-between px-5 py-4"
            style={{ borderBottom: "1px solid var(--cardBorder)" }}
          >
            <div
              className="flex items-center gap-1 rounded-full p-1"
              style={{
                background: "var(--accentLight)",
                border: "1px solid var(--cardBorder)",
              }}
            >
              {ROLES.map((r) => (
                <button
                  key={r}
                  onClick={() => setFilterRole(r)}
                  className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all capitalize ${
                    filterRole === r
                      ? "text-white shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                  style={
                    filterRole === r
                      ? { background: "var(--navPill)" }
                      : undefined
                  }
                >
                  {r}
                </button>
              ))}
            </div>
            <div className="text-xs text-gray-400">
              {totalCount > 0 &&
                `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, totalCount)} of ${totalCount}`}
            </div>
          </div>

          <div className="p-5">
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <div
                    key={i}
                    className="h-20 rounded-xl bg-gray-50 animate-pulse"
                  />
                ))}
              </div>
            ) : employees.length === 0 ? (
              <div className="py-16 text-center text-gray-400 text-sm">
                No employees found
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {employees.map((emp, idx) => {
                  const name = emp.user?.name || emp.employee_id || "Unknown";
                  const email = emp.user?.email || "";
                  const avatarBg = AVATAR_COLORS[idx % AVATAR_COLORS.length];
                  const avatarText =
                    avatarBg === "#111111" ? "#FFFFFF" : "#111111";
                  const roleConfig = ROLE_CONFIG[emp.role] || {
                    bg: "#F3F4F6",
                    text: "#6B7280",
                  };

                  return (
                    <div
                      key={emp.id}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 transition-colors cursor-pointer"
                    >
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0"
                        style={{ background: avatarBg, color: avatarText }}
                      >
                        {getInitials(name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-gray-900 truncate">
                          {name}
                        </div>
                        <div className="text-xs text-gray-400 truncate">
                          {emp.title || email}
                        </div>
                        {emp.department?.name && (
                          <div className="text-[10px] text-gray-300 truncate">
                            {emp.department.name}
                          </div>
                        )}
                      </div>
                      <span
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 capitalize"
                        style={{
                          background: roleConfig.bg,
                          color: roleConfig.text,
                        }}
                      >
                        {emp.role}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {totalPages > 1 && (
            <div
              className="px-5 py-4 flex items-center justify-between"
              style={{ borderTop: "1px solid var(--cardBorder)" }}
            >
              <p className="text-xs text-gray-400">
                Showing {(page - 1) * PAGE_SIZE + 1}–
                {Math.min(page * PAGE_SIZE, totalCount)} of {totalCount}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-30 transition-all"
                >
                  ← Prev
                </button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  const pg =
                    totalPages <= 7 ? i + 1 : page <= 4 ? i + 1 : page + i - 3;
                  if (pg < 1 || pg > totalPages) return null;
                  return (
                    <button
                      key={pg}
                      onClick={() => setPage(pg)}
                      className={`w-8 h-8 rounded-xl text-xs font-semibold transition-all ${
                        pg === page
                          ? "text-white"
                          : "text-gray-500 hover:bg-gray-100"
                      }`}
                      style={
                        pg === page
                          ? { background: "var(--navPill)" }
                          : undefined
                      }
                    >
                      {pg}
                    </button>
                  );
                })}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-30 transition-all"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
