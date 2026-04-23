import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { NavPage } from "./Sidebar";
import TopBar from "./TopBar";
import Dashboard from "../dashboard/Dashboard";
import LeavePage from "../leaves/LeavePage";
import AttendancePage from "../attendance/AttendancePage";
import EmployeePage from "../employees/EmployeePage";
import { getAccess, clearTokens, getValidToken } from "../../auth";
import {
  fetchMe,
  fetchUnreadNotifications,
  refreshToken,
  WS_BASE,
  UserProfile,
  NotificationItem,
} from "../../api";
import ChatPage from "../../ChatPage";
import UpskillPage from "../upskilling/UpskillPage";

type ThemeId =
  | "aurora_teal"
  | "arctic_blue"
  | "solar_gold"
  | "midnight"
  | "blossom"
  | "forest";

type ThemeChoice = {
  id: ThemeId;
  name: string;
  mode: "Light" | "Dark mode";
  icon: string;
  preview: { from: string; to: string };
};

const THEME_CHOICES: ThemeChoice[] = [
  {
    id: "arctic_blue",
    name: "Arctic Blue",
    mode: "Light",
    icon: "❄︎",
    preview: { from: "#3B82F6", to: "#0EA5E9" },
  },
  {
    id: "solar_gold",
    name: "Solar Gold",
    mode: "Light",
    icon: "☀︎",
    preview: { from: "#F59E0B", to: "#EAB308" },
  },
  {
    id: "aurora_teal",
    name: "Aurora Teal",
    mode: "Light",
    icon: "❖",
    preview: { from: "#0D9488", to: "#14B8A6" },
  },
  {
    id: "midnight",
    name: "Midnight",
    mode: "Dark mode",
    icon: "☾",
    preview: { from: "#111827", to: "#0F172A" },
  },
  {
    id: "blossom",
    name: "Blossom",
    mode: "Light",
    icon: "✿",
    preview: { from: "#F472B6", to: "#FB7185" },
  },
  {
    id: "forest",
    name: "Forest",
    mode: "Light",
    icon: "❧",
    preview: { from: "#16A34A", to: "#22C55E" },
  },
];

const THEME_VARS: Record<ThemeId, Record<string, string>> = {
  aurora_teal: {
    // ─── New design-system variables ────────────────────────────────────────
    "--pageBg": "linear-gradient(160deg,#ccfbf1 0%,#ecfdf5 40%,#cffafe 100%)",
    "--card": "#ffffff",
    "--cardBorder": "rgba(13,148,136,0.07)",
    "--cardShadow":
      "0 2px 20px rgba(13,148,136,0.09),0 0 0 1px rgba(13,148,136,0.04)",
    "--cardShadowH":
      "0 4px 28px rgba(13,148,136,0.16),0 0 0 1px rgba(13,148,136,0.10)",
    "--surface2": "#f0fdf9",
    "--accent": "#0d9488",
    "--accentLight": "#ccfbf1",
    "--accentText": "#115e59",
    "--accent2": "#2dd4bf",
    "--navPill": "#134e4a",
    "--ink": "#0f1f1e",
    "--muted": "#5f7975",
    "--border": "rgba(13,148,136,0.09)",
    "--darkCard": "#134e4a",
    "--success": "#10b981",
    "--warning": "#f59e0b",
    "--danger": "#ef4444",
    "--barActive": "#0d9488",
    "--barInactive": "#99f6e4",
    "--timerDash": "#99f6e4",
    // ─── Legacy aliases (kept for gradual migration) ─────────────────────────
    "--page-bg": "#ecfdf5",
    "--card-bg": "#ffffff",
    "--text-dark": "#0f1f1e",
    "--text-muted": "#5f7975",
    "--primary-dark": "#134e4a",
    "--primary": "#0d9488",
    "--primary-pale": "#ccfbf1",
    "--card-border": "rgba(13,148,136,0.07)",
    "--topbar-bg": "transparent",
    "--topbar-border": "rgba(13,148,136,0.09)",
  },
  arctic_blue: {
    "--pageBg":
      "linear-gradient(315deg,hsla(214,81%,86%,1) 0%,hsla(217,57%,93%,1) 47%,hsla(218,60%,92%,1) 100%)",
    "--card": "rgba(255,255,255,0.55)",
    "--cardBorder": "rgba(255,255,255,0.6)",
    "--cardShadow":
      "0 2px 20px rgba(37,99,235,0.06),0 0 0 1px rgba(255,255,255,0.4) inset",
    "--cardShadowH":
      "0 4px 28px rgba(37,99,235,0.14),0 0 0 1px rgba(255,255,255,0.6) inset",
    "--surface2": "#f3f7ff",
    "--accent": "#2563eb",
    "--accentLight": "#dbeafe",
    "--accentText": "#1e40af",
    "--accent2": "#60a5fa",
    "--navPill": "#1e3a8a",
    "--ink": "#0c1a3a",
    "--muted": "#64748b",
    "--border": "rgba(37,99,235,0.09)",
    "--darkCard": "#1e2d5e",
    "--success": "#10b981",
    "--warning": "#f59e0b",
    "--danger": "#ef4444",
    "--barActive": "#2563eb",
    "--barInactive": "#c7d8f8",
    "--timerDash": "#c7d8f8",
    "--page-bg": "#eff6ff",
    "--card-bg": "rgba(255,255,255,0.55)",
    "--text-dark": "#0c1a3a",
    "--text-muted": "#64748b",
    "--primary-dark": "#1e3a8a",
    "--primary": "#2563eb",
    "--primary-pale": "#dbeafe",
    "--card-border": "rgba(255,255,255,0.6)",
    "--topbar-bg": "transparent",
    "--topbar-border": "rgba(37,99,235,0.09)",
  },
  solar_gold: {
    "--pageBg": "linear-gradient(160deg,#fef3c7 0%,#fffbeb 40%,#fde68a 100%)",
    "--card": "#ffffff",
    "--cardBorder": "rgba(217,119,6,0.07)",
    "--cardShadow":
      "0 2px 20px rgba(217,119,6,0.10),0 0 0 1px rgba(217,119,6,0.05)",
    "--cardShadowH":
      "0 4px 28px rgba(217,119,6,0.18),0 0 0 1px rgba(217,119,6,0.12)",
    "--surface2": "#fffdf0",
    "--accent": "#d97706",
    "--accentLight": "#fef3c7",
    "--accentText": "#92400e",
    "--accent2": "#fbbf24",
    "--navPill": "#92400e",
    "--ink": "#1c1410",
    "--muted": "#78716c",
    "--border": "rgba(217,119,6,0.10)",
    "--darkCard": "#292010",
    "--success": "#10b981",
    "--warning": "#f59e0b",
    "--danger": "#ef4444",
    "--barActive": "#d97706",
    "--barInactive": "#fde68a",
    "--timerDash": "#fde68a",
    "--page-bg": "#fffbeb",
    "--card-bg": "#ffffff",
    "--text-dark": "#1c1410",
    "--text-muted": "#78716c",
    "--primary-dark": "#92400e",
    "--primary": "#d97706",
    "--primary-pale": "#fef3c7",
    "--card-border": "rgba(217,119,6,0.07)",
    "--topbar-bg": "transparent",
    "--topbar-border": "rgba(217,119,6,0.10)",
  },
  midnight: {
    "--pageBg": "linear-gradient(160deg,#0d0d1f 0%,#09090f 40%,#0d0d1f 100%)",
    "--card": "#13131e",
    "--cardBorder": "rgba(129,140,248,0.10)",
    "--cardShadow":
      "0 2px 24px rgba(0,0,0,0.4),0 0 0 1px rgba(129,140,248,0.08)",
    "--cardShadowH":
      "0 4px 32px rgba(0,0,0,0.55),0 0 0 1px rgba(129,140,248,0.18)",
    "--surface2": "#1a1a2e",
    "--accent": "#818cf8",
    "--accentLight": "#1e1b4b",
    "--accentText": "#a5b4fc",
    "--accent2": "#38bdf8",
    "--navPill": "#4338ca",
    "--ink": "#e2e8f0",
    "--muted": "#94a3b8",
    "--border": "rgba(255,255,255,0.06)",
    "--darkCard": "#1e1b4b",
    "--success": "#34d399",
    "--warning": "#fbbf24",
    "--danger": "#f87171",
    "--barActive": "#818cf8",
    "--barInactive": "#312e81",
    "--timerDash": "#312e81",
    "--page-bg": "#0d0d1f",
    "--card-bg": "#13131e",
    "--text-dark": "#e2e8f0",
    "--text-muted": "#94a3b8",
    "--primary-dark": "#4338ca",
    "--primary": "#818cf8",
    "--primary-pale": "#1e1b4b",
    "--card-border": "rgba(129,140,248,0.10)",
    "--topbar-bg": "transparent",
    "--topbar-border": "rgba(255,255,255,0.06)",
  },
  blossom: {
    "--pageBg": "linear-gradient(160deg,#fecdd3 0%,#fff1f4 40%,#fce7f3 100%)",
    "--card": "#ffffff",
    "--cardBorder": "rgba(225,29,72,0.07)",
    "--cardShadow":
      "0 2px 20px rgba(225,29,72,0.08),0 0 0 1px rgba(225,29,72,0.04)",
    "--cardShadowH":
      "0 4px 28px rgba(225,29,72,0.16),0 0 0 1px rgba(225,29,72,0.12)",
    "--surface2": "#fff8fa",
    "--accent": "#e11d48",
    "--accentLight": "#ffe4e6",
    "--accentText": "#9f1239",
    "--accent2": "#fb7185",
    "--navPill": "#9f1239",
    "--ink": "#1a0a10",
    "--muted": "#9f6976",
    "--border": "rgba(225,29,72,0.09)",
    "--darkCard": "#4c0519",
    "--success": "#10b981",
    "--warning": "#f59e0b",
    "--danger": "#ef4444",
    "--barActive": "#e11d48",
    "--barInactive": "#fecdd3",
    "--timerDash": "#fecdd3",
    "--page-bg": "#fff1f4",
    "--card-bg": "#ffffff",
    "--text-dark": "#1a0a10",
    "--text-muted": "#9f6976",
    "--primary-dark": "#9f1239",
    "--primary": "#e11d48",
    "--primary-pale": "#ffe4e6",
    "--card-border": "rgba(225,29,72,0.07)",
    "--topbar-bg": "transparent",
    "--topbar-border": "rgba(225,29,72,0.09)",
  },
  forest: {
    "--pageBg": "linear-gradient(160deg,#bbf7d0 0%,#f0fdf4 40%,#d1fae5 100%)",
    "--card": "#ffffff",
    "--cardBorder": "rgba(22,163,74,0.07)",
    "--cardShadow":
      "0 2px 20px rgba(22,163,74,0.08),0 0 0 1px rgba(22,163,74,0.04)",
    "--cardShadowH":
      "0 4px 28px rgba(22,163,74,0.16),0 0 0 1px rgba(22,163,74,0.12)",
    "--surface2": "#f0fdf4",
    "--accent": "#16a34a",
    "--accentLight": "#dcfce7",
    "--accentText": "#14532d",
    "--accent2": "#4ade80",
    "--navPill": "#14532d",
    "--ink": "#0d1f14",
    "--muted": "#4a7c5f",
    "--border": "rgba(22,163,74,0.09)",
    "--darkCard": "#14532d",
    "--success": "#10b981",
    "--warning": "#f59e0b",
    "--danger": "#ef4444",
    "--barActive": "#16a34a",
    "--barInactive": "#bbf7d0",
    "--timerDash": "#bbf7d0",
    "--page-bg": "#f0fdf4",
    "--card-bg": "#ffffff",
    "--text-dark": "#0d1f14",
    "--text-muted": "#4a7c5f",
    "--primary-dark": "#14532d",
    "--primary": "#16a34a",
    "--primary-pale": "#dcfce7",
    "--card-border": "rgba(22,163,74,0.07)",
    "--topbar-bg": "transparent",
    "--topbar-border": "rgba(22,163,74,0.09)",
  },
};

export default function AppShell() {
  const navigate = useNavigate();
  const [page, setPage] = useState<NavPage>("dashboard");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string>("");
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [themeId, setThemeId] = useState<ThemeId>("aurora_teal");
  const [scrolled, setScrolled] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const seenIds = useRef<Set<number>>(new Set());
  const mainRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    async function init() {
      try {
        const storedTheme =
          (localStorage.getItem("theme") as ThemeId | null) ?? "aurora_teal";
        applyTheme(storedTheme);
        const t = await getValidToken(refreshToken);
        setToken(t);
        const me = await fetchMe(t);
        if (me) setProfile(me);
        const notifs = await fetchUnreadNotifications(t);
        setNotifications(notifs);
        const unread = notifs.filter((n) => !n.read);
        unread.forEach((n) => seenIds.current.add(n.id));
        setUnreadCount(unread.length);
        connectWS(t);
      } catch {
        handleLogout();
      }
    }
    init();
    return () => wsRef.current?.close();
  }, []);

  function applyTheme(next: ThemeId) {
    const vars = THEME_VARS[next] ?? THEME_VARS.aurora_teal;
    Object.entries(vars).forEach(([key, value]) => {
      document.documentElement.style.setProperty(key, value);
    });
    document.body.style.background = vars["--pageBg"] ?? "";
    document.body.style.minHeight = "100vh";
    localStorage.setItem("theme", next);
    setThemeId(next);
  }

  function connectWS(t: string) {
    const ws = new WebSocket(`${WS_BASE}/ws/notifications/?token=${t}`);
    wsRef.current = ws;
    ws.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);
        if (data.type === "notification") {
          if (!seenIds.current.has(data.id)) {
            seenIds.current.add(data.id);
            setNotifications((prev) => [
              {
                id: data.id,
                subject: data.subject,
                body: data.body,
                metadata: data.metadata ?? {},
                read: false,
                created_at: data.created_at ?? new Date().toISOString(),
              },
              ...prev,
            ]);
            setUnreadCount((c) => c + 1);
          }
        }
      } catch {}
    };
    ws.onclose = () => {
      setTimeout(() => {
        const tk = getAccess();
        if (tk) connectWS(tk);
      }, 3000);
    };
  }

  function handleMarkRead(id: number, navTarget?: NavPage) {
    const tk = getAccess();
    if (tk) {
      fetch(
        `${import.meta.env.VITE_API_BASE ?? "http://localhost:8000/api"}/notifications/${id}/read/`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${tk}` },
        },
      ).catch(() => {});
    }
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
    setUnreadCount((c) => {
      const notif = notifications.find((n) => n.id === id);
      return notif && !notif.read ? Math.max(0, c - 1) : c;
    });
    if (navTarget) setPage(navTarget);
  }

  function handleLogout() {
    clearTokens();
    navigate("/");
  }

  if (page === "chat") {
    return (
      <div
        className="flex flex-col h-screen"
        style={{ background: "var(--pageBg)" }}
      >
        <TopBar
          page={page}
          notifications={notifications}
          unreadCount={unreadCount}
          onMarkRead={handleMarkRead}
          onNav={setPage}
          userName={profile?.name ?? ""}
          onLogout={handleLogout}
          themeId={themeId}
          themes={THEME_CHOICES}
          onThemeSelect={applyTheme}
        />
        <div className="flex-1 min-h-0">
          <ChatPage embedded onNav={(p) => setPage(p as NavPage)} />
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-screen overflow-hidden"
      style={{ background: "var(--pageBg)" }}
    >
      <TopBar
        page={page}
        notifications={notifications}
        unreadCount={unreadCount}
        onMarkRead={handleMarkRead}
        onNav={setPage}
        userName={profile?.name ?? ""}
        onLogout={handleLogout}
        themeId={themeId}
        themes={THEME_CHOICES}
        onThemeSelect={applyTheme}
        scrolled={scrolled}
      />
      <main
        ref={mainRef}
        className="flex-1 overflow-y-auto"
        style={{ background: "transparent" }}
        onScroll={(e: React.UIEvent<HTMLElement>) =>
          setScrolled(e.currentTarget.scrollTop > 10)
        }
      >
        <div
          style={{ maxWidth: 1360, margin: "0 auto", padding: "8px 28px 60px" }}
        >
          {token && (
            <>
              {page === "dashboard" && (
                <Dashboard
                  token={token}
                  role={profile?.role ?? ""}
                  userName={profile?.name ?? ""}
                  onNav={setPage}
                />
              )}
              {page === "leaves" && (
                <LeavePage token={token} role={profile?.role ?? ""} />
              )}
              {page === "attendance" && (
                <AttendancePage token={token} role={profile?.role ?? ""} />
              )}
              {page === "employees" && (
                <EmployeePage token={token} role={profile?.role ?? ""} />
              )}
              {page === "upskilling" && (
                <UpskillPage token={token} role={profile?.role ?? ""} />
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
