import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { NavPage } from "./Sidebar";
import TopBar from "./TopBar";
import Dashboard from "../dashboard/Dashboard";
import LeavePage from "../leaves/LeavePage";
import AttendancePage from "../attendance/AttendancePage";
import EmployeePage from "../employees/EmployeePage";
import { getAccess, clearTokens, getValidToken } from "../../auth";
import { fetchMe, fetchUnreadNotifications, refreshToken, WS_BASE, UserProfile, NotificationItem } from "../../api";
import ChatPage from "../../ChatPage";
import UpskillPage from "../upskilling/UpskillPage";

type ThemeId = "aurora_teal" | "arctic_blue" | "solar_gold" | "midnight" | "blossom" | "forest";

type ThemeChoice = {
  id: ThemeId;
  name: string;
  mode: "Light" | "Dark mode";
  icon: string;
  preview: { from: string; to: string };
};

const THEME_CHOICES: ThemeChoice[] = [
  { id: "arctic_blue", name: "Arctic Blue", mode: "Light", icon: "❄︎", preview: { from: "#3B82F6", to: "#0EA5E9" } },
  { id: "solar_gold", name: "Solar Gold", mode: "Light", icon: "☀︎", preview: { from: "#F59E0B", to: "#EAB308" } },
  { id: "aurora_teal", name: "Aurora Teal", mode: "Light", icon: "❖", preview: { from: "#0D9488", to: "#14B8A6" } },
  { id: "midnight", name: "Midnight", mode: "Dark mode", icon: "☾", preview: { from: "#111827", to: "#0F172A" } },
  { id: "blossom", name: "Blossom", mode: "Light", icon: "✿", preview: { from: "#F472B6", to: "#FB7185" } },
  { id: "forest", name: "Forest", mode: "Light", icon: "❧", preview: { from: "#16A34A", to: "#22C55E" } },
];

const THEME_VARS: Record<ThemeId, Record<string, string>> = {
  aurora_teal: {
    "--page-bg": "#EBF9F6",
    "--card-bg": "#FFFFFF",
    "--text-dark": "#0D3D36",
    "--text-muted": "#6B9E9A",
    "--primary-dark": "#0D3D36",
    "--primary": "#0D9488",
    "--primary-pale": "#CCFBF1",
    "--card-border": "#D0EFE9",
    "--topbar-bg": "#FFFFFF",
    "--topbar-border": "#E2F4F0",
  },
  arctic_blue: {
    "--page-bg": "#EFF6FF",
    "--card-bg": "#FFFFFF",
    "--text-dark": "#0F172A",
    "--text-muted": "#64748B",
    "--primary-dark": "#1E3A8A",
    "--primary": "#2563EB",
    "--primary-pale": "#DBEAFE",
    "--card-border": "#BFDBFE",
    "--topbar-bg": "#FFFFFF",
    "--topbar-border": "#DBEAFE",
  },
  solar_gold: {
    "--page-bg": "#FFFBEB",
    "--card-bg": "#FFFFFF",
    "--text-dark": "#1F2937",
    "--text-muted": "#6B7280",
    "--primary-dark": "#111827",
    "--primary": "#D97706",
    "--primary-pale": "#FEF3C7",
    "--card-border": "#FDE68A",
    "--topbar-bg": "#FFFFFF",
    "--topbar-border": "#FEF3C7",
  },
  midnight: {
    "--page-bg": "#0B1220",
    "--card-bg": "#0F172A",
    "--text-dark": "#E5E7EB",
    "--text-muted": "#94A3B8",
    "--primary-dark": "#111827",
    "--primary": "#38BDF8",
    "--primary-pale": "#0B2A3A",
    "--card-border": "rgba(148,163,184,0.18)",
    "--topbar-bg": "#0F172A",
    "--topbar-border": "rgba(148,163,184,0.18)",
  },
  blossom: {
    "--page-bg": "#FFF1F2",
    "--card-bg": "#FFFFFF",
    "--text-dark": "#111827",
    "--text-muted": "#6B7280",
    "--primary-dark": "#111827",
    "--primary": "#F43F5E",
    "--primary-pale": "#FFE4E6",
    "--card-border": "#FECDD3",
    "--topbar-bg": "#FFFFFF",
    "--topbar-border": "#FFE4E6",
  },
  forest: {
    "--page-bg": "#ECFDF5",
    "--card-bg": "#FFFFFF",
    "--text-dark": "#064E3B",
    "--text-muted": "#6B7280",
    "--primary-dark": "#064E3B",
    "--primary": "#16A34A",
    "--primary-pale": "#DCFCE7",
    "--card-border": "#BBF7D0",
    "--topbar-bg": "#FFFFFF",
    "--topbar-border": "#DCFCE7",
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
  const wsRef = useRef<WebSocket | null>(null);
  const seenIds = useRef<Set<number>>(new Set());

  useEffect(() => {
    async function init() {
      try {
        const storedTheme = (localStorage.getItem("theme") as ThemeId | null) ?? "aurora_teal";
        applyTheme(storedTheme);
        const t = await getValidToken(refreshToken);
        setToken(t);
        const me = await fetchMe(t);
        if (me) setProfile(me);
        const notifs = await fetchUnreadNotifications(t);
        setNotifications(notifs);
        const unread = notifs.filter(n => !n.read);
        unread.forEach(n => seenIds.current.add(n.id));
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
            setNotifications(prev => [{
              id: data.id,
              subject: data.subject,
              body: data.body,
              metadata: data.metadata ?? {},
              read: false,
              created_at: data.created_at ?? new Date().toISOString(),
            }, ...prev]);
            setUnreadCount(c => c + 1);
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
      fetch(`${import.meta.env.VITE_API_BASE ?? "http://localhost:8002/api"}/notifications/${id}/read/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tk}` },
      }).catch(() => {});
    }
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    setUnreadCount(c => {
      const notif = notifications.find(n => n.id === id);
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
      <div className="flex flex-col h-screen" style={{ background: "var(--page-bg)" }}>
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
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: "var(--page-bg)" }}>
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
      <main className="flex-1 overflow-y-auto" style={{ background: "var(--page-bg)" }}>
        {token && (
          <>
            {page === "dashboard" && <Dashboard token={token} role={profile?.role ?? ""} userName={profile?.name ?? ""} onNav={setPage} />}
            {page === "leaves" && <LeavePage token={token} role={profile?.role ?? ""} />}
            {page === "attendance" && <AttendancePage token={token} role={profile?.role ?? ""} />}
            {page === "employees" && <EmployeePage token={token} role={profile?.role ?? ""} />}
            {page === "upskilling" && <UpskillPage token={token} role={profile?.role ?? ""} />}
          </>
        )}
      </main>
    </div>
  );
}
