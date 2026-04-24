import React, { useEffect, useRef, useState } from "react";

const BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8002/api";

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
  manager?: { name?: string; user?: { name?: string } };
  manager_id?: number | null;
  is_active: boolean;
  user?: { name?: string; email?: string };
  date_of_joining?: string;
  joined_on?: string;
  salary?: number;
}

interface EmpDisplay {
  id: string;
  rawId: number;
  managerRawId: number | null;
  name: string;
  role: string;
  dept: string;
  manager: string;
  joined: string;
  status: "active" | "inactive";
  av: string;
  col: string;
  salary: number;
  email: string;
}

interface OrgRelation {
  id: number;
  manager_id: number | null;
}

const AV_COLORS = [
  "#7c3aed",
  "#2563eb",
  "#0d9488",
  "#e11d48",
  "#d97706",
  "#16a34a",
  "#0ea5e9",
];

function toDisplay(
  e: Employee,
  idx: number,
  managerIdOverride?: number | null,
): EmpDisplay {
  const name = e.user?.name || e.employee_id || "Unknown";
  const managerRawId =
    managerIdOverride !== undefined
      ? managerIdOverride
      : (e.manager_id ?? null);
  return {
    id: e.employee_id,
    rawId: e.id,
    managerRawId,
    name,
    role: e.title || e.role,
    dept: e.department?.name || "—",
    manager: e.manager?.name || e.manager?.user?.name || "—",
    joined:
      e.joined_on || e.date_of_joining
        ? new Date(e.joined_on || e.date_of_joining || "").toLocaleDateString(
            "en-IN",
            {
              day: "numeric",
              month: "short",
              year: "numeric",
            },
          )
        : "—",
    status: e.is_active ? "active" : "inactive",
    av: name
      .split(" ")
      .map((w: string) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2),
    col: AV_COLORS[idx % AV_COLORS.length],
    salary: e.salary ?? 0,
    email: e.user?.email || "",
  };
}

// ── Atoms ─────────────────────────────────────────────────────────────────────

const IC = ({
  n,
  s = 16,
  c = "currentColor",
}: {
  n: string;
  s?: number;
  c?: string;
}) => {
  const paths: Record<string, React.ReactNode> = {
    search: (
      <>
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </>
    ),
    plus: (
      <>
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </>
    ),
    x: (
      <>
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </>
    ),
    check: (
      <>
        <polyline points="20 6 9 17 4 12" />
      </>
    ),
    arrowNE: (
      <>
        <path d="M7 17L17 7M7 7h10v10" />
      </>
    ),
    people: (
      <>
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
  };
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke={c}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[n]}
    </svg>
  );
};

const Av = ({
  init,
  color,
  size = 34,
}: {
  init: string;
  color: string;
  size?: number;
}) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: Math.round(size / 3),
      background: color,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "#fff",
      fontWeight: 700,
      flexShrink: 0,
      fontSize: Math.round(size * 0.34),
    }}
  >
    {init}
  </div>
);

const Pill = ({
  children,
  color,
  bg,
  dot = true,
  size = 10.5,
}: {
  children: React.ReactNode;
  color: string;
  bg?: string;
  dot?: boolean;
  size?: number;
}) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      padding: "3px 9px",
      borderRadius: 20,
      fontSize: size,
      fontWeight: 600,
      background: bg || color + "18",
      color,
    }}
  >
    {dot && (
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: color,
          display: "inline-block",
        }}
      />
    )}
    {children}
  </span>
);

const Btn = ({
  children,
  onClick,
  variant = "primary",
  small = false,
  icon,
  danger = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: string;
  small?: boolean;
  icon?: string;
  danger?: boolean;
}) => {
  const bg = danger
    ? "var(--danger)"
    : variant === "primary"
      ? "var(--accent)"
      : "transparent";
  const col = variant === "primary" || danger ? "#fff" : "var(--muted)";
  const bdr = variant === "outline" ? "1px solid var(--cardBorder)" : "none";
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: small ? "5px 12px" : "8px 18px",
        borderRadius: 999,
        border: bdr,
        background: bg,
        color: col,
        fontSize: small ? 11.5 : 13,
        fontWeight: 600,
        cursor: "pointer",
        whiteSpace: "nowrap",
        transition: "opacity 0.15s",
        fontFamily: "inherit",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
      onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
    >
      {icon && <IC n={icon} s={small ? 12 : 14} c={col} />}
      {children}
    </button>
  );
};

const Card = ({
  children,
  style = {},
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) => {
  const [hov, setH] = useState(false);
  return (
    <div
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        background: "var(--card)",
        borderRadius: 20,
        border: "1px solid var(--cardBorder)",
        boxShadow: hov ? "var(--cardShadowH)" : "var(--cardShadow)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        transition: "box-shadow 0.2s",
        overflow: "hidden",
        ...style,
      }}
    >
      {children}
    </div>
  );
};

const Modal = ({
  title,
  onClose,
  children,
  width = 480,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
}) => (
  <div
    style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.45)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 9999,
      backdropFilter: "blur(6px)",
      padding: 20,
    }}
    onClick={onClose}
  >
    <div
      style={{
        background: "var(--card)",
        borderRadius: 20,
        padding: 28,
        width,
        maxWidth: "95vw",
        boxShadow: "0 24px 80px rgba(0,0,0,0.2)",
        border: "1px solid var(--cardBorder)",
        maxHeight: "90vh",
        overflowY: "auto",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <h2
          style={{
            fontSize: 18,
            fontWeight: 250,
            color: "var(--ink)",
            margin: 0,
            letterSpacing: "-0.01em",
          }}
        >
          {title}
        </h2>
        <button
          onClick={onClose}
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            border: "1px solid var(--cardBorder)",
            background: "transparent",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <IC n="x" s={14} c="var(--muted)" />
        </button>
      </div>
      {children}
    </div>
  </div>
);

const Field = ({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  options,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  options?: string[];
  required?: boolean;
}) => (
  <div style={{ marginBottom: 14 }}>
    <label
      style={{
        display: "block",
        fontSize: 11.5,
        fontWeight: 600,
        color: "var(--muted)",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        marginBottom: 5,
      }}
    >
      {label}
      {required && (
        <span style={{ color: "var(--danger,#ef4444)", marginLeft: 2 }}>*</span>
      )}
    </label>
    {options ? (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%",
          padding: "9px 12px",
          borderRadius: 10,
          border: "1px solid var(--cardBorder)",
          background: "var(--card)",
          color: "var(--ink)",
          fontSize: 13,
          fontFamily: "inherit",
          outline: "none",
        }}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    ) : (
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        style={{
          width: "100%",
          padding: "9px 12px",
          borderRadius: 10,
          border: "1px solid var(--cardBorder)",
          background: "var(--card)",
          color: "var(--ink)",
          fontSize: 13,
          fontFamily: "inherit",
          outline: "none",
        }}
      />
    )}
  </div>
);

// ── Org chart ─────────────────────────────────────────────────────────────────

interface OrgTreeNode {
  emp: EmpDisplay;
  children: OrgTreeNode[];
}

const LINE = "rgba(148,163,184,0.5)";
const CARD_W = 196; // fixed card width
const H_GAP = 40; // gap between sibling subtrees
const STEM_H = 28; // vertical stem height

// Pre-compute how wide a subtree is so we can position the horizontal rail exactly.
// Pass collapsedIds so that collapsed nodes are treated as leaf nodes.
function subtreeWidth(node: OrgTreeNode, collapsedIds?: Set<number>): number {
  if (node.children.length === 0 || collapsedIds?.has(node.emp.rawId))
    return CARD_W;
  const childrenTotalW = node.children.reduce(
    (s, c) => s + subtreeWidth(c, collapsedIds),
    0,
  );
  return childrenTotalW + (node.children.length - 1) * H_GAP;
}

function EmpCard({
  emp,
  onView,
}: {
  emp: EmpDisplay;
  onView: (e: EmpDisplay) => void;
}) {
  return (
    <div
      onClick={() => onView(emp)}
      style={{
        background: "var(--card)",
        border: "1px solid var(--cardBorder)",
        borderRadius: 14,
        padding: "12px 14px",
        width: CARD_W,
        cursor: "pointer",
        boxShadow: "var(--cardShadow)",
        transition: "transform 0.15s, box-shadow 0.15s",
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexShrink: 0,
        boxSizing: "border-box",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.12)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "var(--cardShadow)";
      }}
    >
      <Av init={emp.av} color={emp.col} size={34} />
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "var(--ink)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: 126,
          }}
        >
          {emp.name}
        </div>
        <div
          style={{
            fontSize: 10,
            color: "var(--muted)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: 126,
            marginTop: 1,
          }}
        >
          {emp.role}
        </div>
        <div style={{ marginTop: 5 }}>
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              padding: "2px 6px",
              borderRadius: 999,
              background: "var(--accentLight)",
              color: "var(--accentText)",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            {emp.dept}
          </span>
        </div>
      </div>
    </div>
  );
}

const OrgNode = ({
  node,
  onView,
  collapsedIds,
  onToggleCollapse,
}: {
  node: OrgTreeNode;
  onView: (e: EmpDisplay) => void;
  collapsedIds: Set<number>;
  onToggleCollapse: (id: number) => void;
}) => {
  const { emp, children } = node;
  const hasChildren = children.length > 0;
  const isCollapsed = collapsedIds.has(emp.rawId);

  // Width of this entire subtree (respects collapsed state)
  const myW = subtreeWidth(node, collapsedIds);

  // For each child, compute cumulative left offset so we know where its center sits.
  let cursor = 0;
  const childCenters: number[] = children.map((c) => {
    const cw = subtreeWidth(c, collapsedIds);
    const center = cursor + cw / 2;
    cursor += cw + H_GAP;
    return center;
  });

  // Rail runs from center of first child to center of last child
  const railLeft = childCenters[0];
  const railRight = myW - childCenters[childCenters.length - 1];

  // Count total descendants for the collapsed badge
  function countDescendants(n: OrgTreeNode): number {
    return n.children.reduce((s, c) => s + 1 + countDescendants(c), 0);
  }
  const descendantCount = hasChildren ? countDescendants(node) : 0;

  return (
    // Outer wrapper exactly as wide as this subtree so parent can center over it
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        width: myW,
      }}
    >
      {/* Card — centered in myW */}
      <EmpCard emp={emp} onView={onView} />

      {/* Collapse / expand toggle button */}
      {hasChildren && (
        <button
          onClick={() => onToggleCollapse(emp.rawId)}
          title={
            isCollapsed
              ? `Expand ${descendantCount} reports`
              : "Collapse subtree"
          }
          style={{
            marginTop: 4,
            display: "flex",
            alignItems: "center",
            gap: 3,
            padding: "2px 8px",
            borderRadius: 999,
            border: "1px solid var(--cardBorder)",
            background: isCollapsed ? "var(--accent)" : "var(--card)",
            color: isCollapsed ? "#fff" : "var(--muted)",
            fontSize: 10,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "inherit",
            transition: "background 0.15s, color 0.15s",
            lineHeight: 1.4,
          }}
        >
          {isCollapsed ? `+${descendantCount}` : "−"}
        </button>
      )}

      {hasChildren && !isCollapsed && (
        <>
          {/* Stem down from card/button to horizontal rail */}
          <div style={{ width: 2, height: STEM_H, background: LINE }} />

          {/* Horizontal rail */}
          <div
            style={{
              position: "relative",
              width: myW,
              height: 2,
              flexShrink: 0,
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                left: children.length === 1 ? "50%" : railLeft,
                right: children.length === 1 ? "50%" : railRight,
                height: 2,
                background: LINE,
                width: children.length === 1 ? 0 : undefined,
              }}
            />
          </div>

          {/* Stems down to children + children nodes */}
          <div
            style={{ display: "flex", gap: H_GAP, alignItems: "flex-start" }}
          >
            {children.map((child) => (
              <div
                key={child.emp.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  width: subtreeWidth(child, collapsedIds),
                }}
              >
                {/* Vertical stem from rail down to child card */}
                <div style={{ width: 2, height: STEM_H, background: LINE }} />
                <OrgNode
                  node={child}
                  onView={onView}
                  collapsedIds={collapsedIds}
                  onToggleCollapse={onToggleCollapse}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

function buildTree(emps: EmpDisplay[]): OrgTreeNode[] {
  const byId = Object.fromEntries(
    emps.map((e) => [e.rawId, { emp: e, children: [] as OrgTreeNode[] }]),
  );
  const roots: OrgTreeNode[] = [];
  emps.forEach((e) => {
    const node = byId[e.rawId];
    // Treat self-referential employees (manager_id === own id) as roots to avoid circular trees
    const isSelfRef = e.managerRawId !== null && e.managerRawId === e.rawId;
    const parent = e.managerRawId && !isSelfRef ? byId[e.managerRawId] : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  });
  return roots;
}

// ── Page ──────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;
const ORG_PAGE_SIZE = 10000;

export default function EmployeePage({ token, role }: EmployeePageProps) {
  const [employees, setEmployees] = useState<EmpDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("All");
  const [view, setView] = useState<"list" | "org">("list");
  const [viewEmp, setViewEmp] = useState<EmpDisplay | null>(null);
  const [orgZoom, setOrgZoom] = useState(1);
  const [orgFitMode, setOrgFitMode] = useState(false);
  const [orgCollapsedIds, setOrgCollapsedIds] = useState<Set<number>>(
    new Set(),
  );
  const orgScrollRef = useRef<HTMLDivElement>(null);
  const orgTreeRef = useRef<HTMLDivElement>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    name: "",
    role: "",
    dept: "Engineering",
    manager: "",
    joined: "",
    status: "active",
  });
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadSeqRef = useRef(0);
  const [debouncedQ, setDebouncedQ] = useState("");
  const [allDepts, setAllDepts] = useState<string[]>([]);
  const [deptDropOpen, setDeptDropOpen] = useState(false);
  const deptDropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(() => setDebouncedQ(q), 300);
  }, [q]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, dept]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        deptDropRef.current &&
        !deptDropRef.current.contains(e.target as Node)
      ) {
        setDeptDropOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Fetch all dept names once (unfiltered) so the dept buttons never disappear.
  useEffect(() => {
    fetch(`${BASE}/employees/?page=1&page_size=10000`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        const raw: Employee[] = Array.isArray(data)
          ? data
          : (data.results ?? []);
        const names = Array.from(
          new Set(
            raw.map((e) => e.department?.name).filter((d): d is string => !!d),
          ),
        ).sort();
        setAllDepts(names);
      })
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    async function load() {
      const seq = ++loadSeqRef.current;
      setLoading(true);
      const params = new URLSearchParams(
        view === "org"
          ? {
              page: "1",
              page_size: String(ORG_PAGE_SIZE),
            }
          : {
              page: String(page),
              page_size: String(PAGE_SIZE),
            },
      );
      if (debouncedQ) params.set("search", debouncedQ);
      // In org view fetch all employees so the full hierarchy is visible;
      // dept filtering is done client-side on roots only.
      if (view !== "org" && dept !== "All") params.set("department", dept);
      try {
        const res = await fetch(`${BASE}/employees/?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (seq !== loadSeqRef.current) return;
        if (res.ok) {
          const data = await res.json();
          if (seq !== loadSeqRef.current) return;
          const raw: Employee[] = Array.isArray(data)
            ? data
            : (data.results ?? []);
          const orgRelations: OrgRelation[] = Array.isArray(data)
            ? []
            : (data.org ?? []);
          const managerByEmployeeId = new Map<number, number | null>(
            orgRelations.map((r) => [r.id, r.manager_id]),
          );
          setTotalCount(
            Array.isArray(data) ? raw.length : (data.count ?? raw.length),
          );
          setEmployees(
            raw.map((e, idx) =>
              toDisplay(e, idx, managerByEmployeeId.get(e.id)),
            ),
          );
        }
      } finally {
        if (seq === loadSeqRef.current) setLoading(false);
      }
    }
    load();
  }, [token, page, debouncedQ, dept, view]);

  const depts = ["All", ...allDepts];
  const PINNED_DEPTS = ["All", "Engineering", "Product", "HR"];
  const pinnedDepts = PINNED_DEPTS.filter(
    (d) => d === "All" || allDepts.includes(d),
  );
  const overflowDepts = depts.filter((d) => !PINNED_DEPTS.includes(d));
  const list = employees.filter(
    (e) =>
      (dept === "All" || e.dept === dept) &&
      e.name.toLowerCase().includes(debouncedQ.toLowerCase()),
  );
  // For org view: filter to only the selected dept (and search query), then build
  // the tree from that subset. Employees whose manager is outside the dept become roots.
  const orgSearchFilter = debouncedQ.toLowerCase();
  const orgEmployees = employees.filter(
    (e) =>
      (dept === "All" || e.dept === dept) &&
      (!orgSearchFilter || e.name.toLowerCase().includes(orgSearchFilter)),
  );
  const orgRoots = buildTree(orgEmployees);
  const activeCount = employees.filter((e) => e.status === "active").length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const canAddEmployee = ["hr", "admin"].includes(role);

  const addEmp = () => {
    if (!form.name || !form.role) return;
    const idx = employees.length;
    const newEmp: EmpDisplay = {
      id: `E${String(employees.length + 1).padStart(3, "0")}`,
      rawId: 0,
      managerRawId: null,
      name: form.name,
      role: form.role,
      dept: form.dept,
      manager: form.manager || "—",
      joined: form.joined,
      status: form.status as "active" | "inactive",
      av: form.name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2),
      col: AV_COLORS[idx % AV_COLORS.length],
      salary: 0,
      email: "",
    };
    setEmployees((es) => [...es, newEmp]);
    setForm({
      name: "",
      role: "",
      dept: "Engineering",
      manager: "",
      joined: "",
      status: "active",
    });
    setShowAdd(false);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
        padding: "0 4px",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 28,
              fontWeight: 250,
              color: "var(--ink)",
              letterSpacing: "-0.02em",
              margin: 0,
            }}
          >
            People
          </h1>
          <p
            style={{
              fontSize: 13,
              color: "var(--muted)",
              marginTop: 4,
              fontWeight: 300,
            }}
          >
            {loading ? "Loading…" : `${activeCount} active employees`}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              gap: 2,
              padding: 3,
              background: "var(--card)",
              border: "1px solid var(--cardBorder)",
              borderRadius: 999,
            }}
          >
            {(["list", "org"] as const).map((v) => {
              const a = view === v;
              return (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 999,
                    border: "none",
                    cursor: "pointer",
                    background: a ? "var(--navPill)" : "transparent",
                    color: a ? "#fff" : "var(--muted)",
                    fontSize: 12,
                    fontWeight: a ? 600 : 500,
                    fontFamily: "inherit",
                    transition: "all 0.18s",
                  }}
                >
                  {v === "list" ? "List" : "Org"}
                </button>
              );
            })}
          </div>
          {canAddEmployee && (
            <Btn icon="plus" onClick={() => setShowAdd(true)}>
              Add Employee
            </Btn>
          )}
        </div>
      </div>

      {/* Filters row */}
      <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
        {/* Search bar — takes remaining space */}
        <div style={{ flex: 1, position: "relative" }}>
          <div
            style={{
              position: "absolute",
              left: 12,
              top: "50%",
              transform: "translateY(-50%)",
            }}
          >
            <IC n="search" s={14} c="var(--muted)" />
          </div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search employees..."
            style={{
              width: "100%",
              padding: "9px 12px 9px 36px",
              borderRadius: 999,
              border: "1px solid var(--cardBorder)",
              background: "var(--card)",
              color: "var(--ink)",
              fontSize: 13,
              outline: "none",
              fontFamily: "inherit",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Pinned dept buttons */}
        {pinnedDepts.map((d) => (
          <button
            key={d}
            onClick={() => setDept(d)}
            style={{
              padding: "8px 16px",
              borderRadius: 999,
              border: `1px solid ${dept === d ? "var(--accent)" : "var(--cardBorder)"}`,
              background: dept === d ? "var(--accent)" : "var(--card)",
              color: dept === d ? "#fff" : "var(--muted)",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s",
              fontFamily: "inherit",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {d}
          </button>
        ))}

        {/* Overflow departments dropdown */}
        {overflowDepts.length > 0 && (
          <div
            ref={deptDropRef}
            style={{ position: "relative", flexShrink: 0 }}
          >
            <button
              onClick={() => setDeptDropOpen((o) => !o)}
              style={{
                padding: "8px 14px",
                borderRadius: 999,
                border: `1px solid ${overflowDepts.includes(dept) ? "var(--accent)" : "var(--cardBorder)"}`,
                background: overflowDepts.includes(dept)
                  ? "var(--accent)"
                  : "var(--card)",
                color: overflowDepts.includes(dept) ? "#fff" : "var(--muted)",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s",
                fontFamily: "inherit",
                display: "flex",
                alignItems: "center",
                gap: 5,
                whiteSpace: "nowrap",
              }}
            >
              {overflowDepts.includes(dept) ? dept : "More"}
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {deptDropOpen && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  right: 0,
                  background: "var(--surface2)",
                  backgroundColor: "var(--surface2)",
                  border: "1px solid var(--cardBorder)",
                  borderRadius: 12,
                  boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
                  zIndex: 300,
                  minWidth: 160,
                  overflow: "hidden",
                  padding: "4px 0",
                  isolation: "isolate",
                }}
              >
                {overflowDepts.map((d) => (
                  <button
                    key={d}
                    onClick={() => {
                      setDept(d);
                      setDeptDropOpen(false);
                    }}
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "8px 16px",
                      textAlign: "left",
                      border: "none",
                      background:
                        dept === d
                          ? "var(--accentLight, #ede9fe)"
                          : "transparent",
                      color: dept === d ? "var(--accent)" : "var(--ink)",
                      fontSize: 13,
                      fontWeight: dept === d ? 600 : 400,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                    onMouseEnter={(e) => {
                      if (dept !== d)
                        e.currentTarget.style.background =
                          "var(--accentLight, #ede9fe)";
                    }}
                    onMouseLeave={(e) => {
                      if (dept !== d)
                        e.currentTarget.style.background = "transparent";
                    }}
                  >
                    {d}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Org view — Card fills viewport height; tree scrolls internally */}
      {view === "org" ? (
        <Card
          style={{
            padding: 20,
            height: "calc(100vh - 204px)",
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* inner content fills remaining card height */}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
            }}
          >
            {loading ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(5, 1fr)",
                  gap: 14,
                }}
              >
                {Array.from({ length: 10 }).map((_, i) => (
                  <div
                    key={i}
                    style={{
                      height: 88,
                      borderRadius: 14,
                      background: "var(--accentLight)",
                      opacity: 0.5,
                    }}
                  />
                ))}
              </div>
            ) : orgRoots.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: 40,
                  color: "var(--muted)",
                  fontSize: 13,
                }}
              >
                No employees to display in this department.
              </div>
            ) : (
              <>
                {/* Toolbar — fixed height */}
                <div
                  style={{
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 12,
                    flexWrap: "wrap",
                  }}
                >
                  {/* 100% zoom */}
                  <button
                    onClick={() => {
                      setOrgZoom(1);
                      setOrgFitMode(false);
                    }}
                    style={{
                      padding: "3px 10px",
                      borderRadius: 999,
                      border: "1px solid var(--cardBorder)",
                      background: !orgFitMode ? "var(--accent)" : "var(--card)",
                      color: !orgFitMode ? "#fff" : "var(--muted)",
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    100%
                  </button>

                  {/* Fit All */}
                  <button
                    onClick={() => {
                      if (
                        !orgScrollRef.current ||
                        !orgTreeRef.current ||
                        orgRoots.length === 0
                      )
                        return;
                      // Reset to zoom=1 first, measure natural tree size, then compute fit
                      setOrgZoom(1);
                      setOrgFitMode(false);
                      requestAnimationFrame(() => {
                        if (!orgScrollRef.current || !orgTreeRef.current)
                          return;
                        const cW = orgScrollRef.current.clientWidth - 16;
                        const cH = orgScrollRef.current.clientHeight - 16;
                        const tW = orgTreeRef.current.scrollWidth;
                        const tH = orgTreeRef.current.scrollHeight;
                        const zoom = Math.min(1, cW / tW, cH / tH);
                        setOrgZoom(zoom);
                        setOrgFitMode(true);
                      });
                    }}
                    style={{
                      padding: "3px 10px",
                      borderRadius: 999,
                      border: "1px solid var(--cardBorder)",
                      background: orgFitMode ? "var(--accent)" : "var(--card)",
                      color: orgFitMode ? "#fff" : "var(--muted)",
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    Fit All
                  </button>

                  <div
                    style={{
                      width: 1,
                      height: 18,
                      background: "var(--cardBorder)",
                      margin: "0 4px",
                    }}
                  />

                  <button
                    onClick={() => {
                      const toCollapse = new Set<number>();
                      function collectAll(nodes: typeof orgRoots) {
                        nodes.forEach((n) => {
                          if (n.children.length > 0)
                            toCollapse.add(n.emp.rawId);
                          collectAll(n.children);
                        });
                      }
                      collectAll(orgRoots);
                      setOrgCollapsedIds(toCollapse);
                      setOrgFitMode(false);
                    }}
                    style={{
                      padding: "3px 10px",
                      borderRadius: 999,
                      border: "1px solid var(--cardBorder)",
                      background: "var(--card)",
                      color: "var(--muted)",
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    Collapse All
                  </button>
                  <button
                    onClick={() => {
                      setOrgCollapsedIds(new Set());
                      setOrgFitMode(false);
                    }}
                    style={{
                      padding: "3px 10px",
                      borderRadius: 999,
                      border: "1px solid var(--cardBorder)",
                      background: "var(--card)",
                      color: "var(--muted)",
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    Expand All
                  </button>
                </div>

                {/* Scroll container — fills all remaining height in the card */}
                <div
                  ref={orgScrollRef}
                  style={{
                    flex: 1,
                    minHeight: 0,
                    overflowX: "auto",
                    overflowY: "auto",
                  }}
                >
                  <div
                    ref={orgTreeRef}
                    style={{
                      display: "inline-flex",
                      alignItems: "flex-start",
                      gap: 56,
                      minWidth: "100%",
                      justifyContent: "center",
                      // CSS zoom affects layout (unlike transform:scale) so scroll area matches
                      zoom: orgZoom,
                    }}
                  >
                    {orgRoots.map((root) => (
                      <OrgNode
                        key={root.emp.rawId}
                        node={root}
                        onView={(e) => setViewEmp(e)}
                        collapsedIds={orgCollapsedIds}
                        onToggleCollapse={(id) =>
                          setOrgCollapsedIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(id)) next.delete(id);
                            else next.add(id);
                            return next;
                          })
                        }
                      />
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </Card>
      ) : (
        /* List view */
        <Card>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--surface2,var(--accentLight))" }}>
                {[
                  "Employee",
                  "Role",
                  "Department",
                  "Manager",
                  "Joined",
                  "Status",
                  "Actions",
                ].map((h, i) => (
                  <th
                    key={i}
                    style={{
                      padding: "11px 16px",
                      textAlign: "left",
                      fontSize: 10.5,
                      fontWeight: 600,
                      color: "var(--muted)",
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      borderBottom: "1px solid var(--cardBorder)",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={7}
                    style={{
                      padding: 40,
                      textAlign: "center",
                      color: "var(--muted)",
                      fontSize: 13,
                    }}
                  >
                    Loading…
                  </td>
                </tr>
              ) : list.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    style={{
                      padding: 40,
                      textAlign: "center",
                      color: "var(--muted)",
                      fontSize: 13,
                    }}
                  >
                    No employees found.
                  </td>
                </tr>
              ) : (
                list.map((e) => (
                  <tr
                    key={e.id}
                    style={{
                      borderBottom: "1px solid var(--cardBorder)",
                      cursor: "pointer",
                    }}
                    onMouseEnter={(ev) =>
                      (ev.currentTarget.style.background =
                        "var(--surface2,var(--accentLight))")
                    }
                    onMouseLeave={(ev) =>
                      (ev.currentTarget.style.background = "transparent")
                    }
                  >
                    <td style={{ padding: "11px 16px" }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        <Av init={e.av} color={e.col} size={32} />
                        <div>
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: "var(--ink)",
                            }}
                          >
                            {e.name}
                          </div>
                          <div
                            style={{ fontSize: 10.5, color: "var(--muted)" }}
                          >
                            {e.id}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td
                      style={{
                        padding: "11px 16px",
                        fontSize: 12.5,
                        color: "var(--ink)",
                      }}
                    >
                      {e.role}
                    </td>
                    <td style={{ padding: "11px 16px" }}>
                      <Pill color="var(--accent)" bg="var(--accentLight)">
                        {e.dept}
                      </Pill>
                    </td>
                    <td
                      style={{
                        padding: "11px 16px",
                        fontSize: 12.5,
                        color: "var(--muted)",
                      }}
                    >
                      {e.manager}
                    </td>
                    <td
                      style={{
                        padding: "11px 16px",
                        fontSize: 11.5,
                        color: "var(--muted)",
                      }}
                    >
                      {e.joined}
                    </td>
                    <td style={{ padding: "11px 16px" }}>
                      <Pill
                        color={
                          e.status === "active" ? "#10b981" : "var(--muted)"
                        }
                      >
                        {e.status}
                      </Pill>
                    </td>
                    <td style={{ padding: "11px 16px" }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          onClick={() => setViewEmp(e)}
                          style={{
                            padding: "4px 10px",
                            borderRadius: 20,
                            border: "1px solid var(--cardBorder)",
                            background: "transparent",
                            color: "var(--muted)",
                            fontSize: 11.5,
                            cursor: "pointer",
                            fontFamily: "inherit",
                          }}
                        >
                          View
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div
              style={{
                padding: "12px 16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderTop: "1px solid var(--cardBorder)",
              }}
            >
              <span style={{ fontSize: 12, color: "var(--muted)" }}>
                {`${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, totalCount)} of ${totalCount}`}
              </span>
              <div style={{ display: "flex", gap: 4 }}>
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  style={{
                    padding: "5px 12px",
                    borderRadius: 999,
                    border: "1px solid var(--cardBorder)",
                    background: "var(--card)",
                    color: "var(--muted)",
                    fontSize: 12,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    opacity: page === 1 ? 0.35 : 1,
                  }}
                >
                  ← Prev
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  style={{
                    padding: "5px 12px",
                    borderRadius: 999,
                    border: "1px solid var(--cardBorder)",
                    background: "var(--card)",
                    color: "var(--muted)",
                    fontSize: 12,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    opacity: page === totalPages ? 0.35 : 1,
                  }}
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Add Employee modal */}
      {showAdd && (
        <Modal title="Add Employee" onClose={() => setShowAdd(false)}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "0 16px",
            }}
          >
            <Field
              label="Full Name"
              value={form.name}
              onChange={(v) => setForm((f) => ({ ...f, name: v }))}
              placeholder="e.g. Jane Smith"
              required
            />
            <Field
              label="Role"
              value={form.role}
              onChange={(v) => setForm((f) => ({ ...f, role: v }))}
              placeholder="e.g. Frontend Engineer"
              required
            />
            <Field
              label="Department"
              value={form.dept}
              onChange={(v) => setForm((f) => ({ ...f, dept: v }))}
              options={[
                "Engineering",
                "Design",
                "HR",
                "Analytics",
                "Sales",
                "Marketing",
              ]}
            />
            <Field
              label="Manager"
              value={form.manager}
              onChange={(v) => setForm((f) => ({ ...f, manager: v }))}
              placeholder="Manager name"
            />
            <Field
              label="Joining Date"
              value={form.joined}
              onChange={(v) => setForm((f) => ({ ...f, joined: v }))}
              type="date"
            />
            <Field
              label="Status"
              value={form.status}
              onChange={(v) => setForm((f) => ({ ...f, status: v }))}
              options={["active", "inactive"]}
            />
          </div>
          <div
            style={{
              display: "flex",
              gap: 10,
              justifyContent: "flex-end",
              marginTop: 8,
            }}
          >
            <Btn variant="outline" onClick={() => setShowAdd(false)}>
              Cancel
            </Btn>
            <Btn onClick={addEmp} icon="plus">
              Add Employee
            </Btn>
          </div>
        </Modal>
      )}

      {/* View Employee modal */}
      {viewEmp && (
        <Modal
          title="Employee Profile"
          onClose={() => setViewEmp(null)}
          width={520}
        >
          <div
            style={{
              display: "flex",
              gap: 16,
              alignItems: "center",
              marginBottom: 20,
              padding: 16,
              background: "var(--surface2,var(--accentLight))",
              borderRadius: 14,
            }}
          >
            <Av init={viewEmp.av} color={viewEmp.col} size={56} />
            <div>
              <div
                style={{ fontSize: 18, fontWeight: 800, color: "var(--ink)" }}
              >
                {viewEmp.name}
              </div>
              <div
                style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}
              >
                {viewEmp.role}
              </div>
              <div style={{ marginTop: 6 }}>
                <Pill
                  color={
                    viewEmp.status === "active" ? "#10b981" : "var(--muted)"
                  }
                  size={11}
                >
                  {viewEmp.status}
                </Pill>
              </div>
            </div>
          </div>
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
          >
            {(
              [
                ["Employee ID", viewEmp.id],
                ["Department", viewEmp.dept],
                ["Manager", viewEmp.manager],
                ["Joined", viewEmp.joined],
                ...(viewEmp.salary
                  ? [
                      [
                        "Annual CTC",
                        `₹${(viewEmp.salary / 100000).toFixed(1)}L`,
                      ],
                    ]
                  : []),
                ["Email", viewEmp.email || "—"],
                ["Status", viewEmp.status],
              ] as [string, string][]
            ).map(([k, v]) => (
              <div
                key={k}
                style={{
                  padding: "10px 12px",
                  background: "var(--surface2,var(--accentLight))",
                  borderRadius: 10,
                }}
              >
                <div
                  style={{
                    fontSize: 10.5,
                    color: "var(--muted)",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    marginBottom: 3,
                  }}
                >
                  {k}
                </div>
                <div
                  style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}
                >
                  {v}
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
