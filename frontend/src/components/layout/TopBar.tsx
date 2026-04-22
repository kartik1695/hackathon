import { useState } from "react";
import { NavPage } from "./Sidebar";

interface NotificationItem {
  id: number; subject: string; body: string; read: boolean;
  created_at: string; metadata?: Record<string, unknown>;
}
type ThemeChoice = {
  id: string;
  name: string;
  mode: string;
  icon: string;
  preview: { from: string; to: string };
};
interface TopBarProps {
  page: NavPage; notifications: NotificationItem[]; unreadCount: number;
  onMarkRead: (id: number) => void; onNav: (p: NavPage) => void;
  userName?: string; onLogout?: () => void;
  themeId: string;
  themes: ThemeChoice[];
  onThemeSelect: (id: string) => void;
}

// Nav tabs — label drives display; id drives navigation
const NAV_TABS: { id: NavPage; label: string; activeFor?: NavPage[] }[] = [
  { id: "dashboard",  label: "Dashboard",   activeFor: ["dashboard"] },
  { id: "employees",  label: "People",      activeFor: ["employees"] },
  { id: "employees",  label: "Hiring" },
  { id: "attendance", label: "Attendance",  activeFor: ["attendance"] },
  { id: "leaves",     label: "Leave",       activeFor: ["leaves"] },
  { id: "employees",  label: "Salary" },
  { id: "employees",  label: "Reviews" },
  { id: "upskilling", label: "Upskilling",  activeFor: ["upskilling"] },
  { id: "chat",       label: "AI Insights", activeFor: ["chat"] },
  { id: "employees",  label: "Reports" },
];

const darkTeal = "var(--primary-dark)";
const teal     = "var(--primary)";
const tealPale = "var(--primary-pale)";
const textMuted = "var(--text-muted)";

export default function TopBar({ page, notifications, unreadCount, onMarkRead, onNav, userName = "", onLogout, themeId, themes, onThemeSelect }: TopBarProps) {
  const [showNotifs, setShowNotifs] = useState(false);
  const [showThemes, setShowThemes] = useState(false);

  return (
    <header
      className="flex items-center justify-center px-6 flex-shrink-0 relative"
      style={{
        background: "var(--topbar-bg)",
        borderBottom: "1px solid var(--topbar-border)",
        height: "56px",
        position: "sticky",
        top: 0,
        zIndex: 40,
      }}
    >
      {/* Centered nav tabs */}
      <nav className="flex items-center gap-0.5">
        {NAV_TABS.map((t, i) => {
          const isActive = t.activeFor
            ? t.activeFor.includes(page)
            : false;
          // Only one "People" tab should be active at a time
          const isActiveTab = isActive && NAV_TABS.findIndex(
            x => x.activeFor?.includes(page)
          ) === i;

          return (
            <button
              key={`${t.id}-${t.label}`}
              onClick={() => onNav(t.id)}
              className="px-4 py-1.5 rounded-full text-sm transition-all duration-150 whitespace-nowrap"
              style={{
                background: isActiveTab ? darkTeal : "transparent",
                color: isActiveTab ? "#FFFFFF" : "#374151",
                fontWeight: isActiveTab ? 600 : 400,
                fontSize: "13.5px",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </nav>

      {/* Right actions — absolutely positioned */}
      <div className="absolute right-6 flex items-center gap-2">
        {/* Setting pill */}
        <button
          onClick={() => { setShowThemes(true); setShowNotifs(false); }}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm transition-all hover:bg-teal-50"
          style={{ border: "1px solid var(--card-border)", color: "#374151", background: "#F0FDF9", fontSize: "13px" }}
        >
          {/* snowflake/gear icon */}
          <svg width="13" height="13" fill="none" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" stroke="currentColor" strokeWidth="1.8"/>
          </svg>
          <span>Setting</span>
        </button>

        {showThemes && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(13,61,54,0.22)", backdropFilter: "blur(6px)" }}
            onMouseDown={(e) => { if (e.currentTarget === e.target) setShowThemes(false); }}
          >
            <div className="w-full max-w-xl rounded-3xl overflow-hidden" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", boxShadow: "0 24px 60px rgba(0,0,0,0.18)" }}>
              <div className="px-6 py-5 flex items-start justify-between">
                <div>
                  <div className="text-lg font-bold" style={{ color: "var(--text-dark)" }}>Choose Theme</div>
                  <div className="text-xs mt-1" style={{ color: textMuted }}>Personalise your Human Edge experience</div>
                </div>
                <button
                  onClick={() => setShowThemes(false)}
                  className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
                  style={{ border: "1px solid var(--card-border)", background: "transparent", color: "var(--text-dark)" }}
                  title="Close"
                >
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24">
                    <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                  </svg>
                </button>
              </div>

              <div className="px-6 pb-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {themes.map((t) => {
                    const selected = t.id === themeId;
                    return (
                      <button
                        key={t.id}
                        onClick={() => { onThemeSelect(t.id); setShowThemes(false); }}
                        className="w-full text-left rounded-2xl p-4 transition-all"
                        style={{
                          border: selected ? `2px solid ${teal}` : "1px solid var(--card-border)",
                          background: selected ? "rgba(204,251,241,0.35)" : "rgba(240,253,251,0.55)",
                        }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className="w-11 h-11 rounded-2xl flex items-center justify-center text-white font-black flex-shrink-0"
                              style={{ background: `linear-gradient(135deg, ${t.preview.from}, ${t.preview.to})` }}
                            >
                              <span className="text-sm">{t.icon}</span>
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-bold truncate" style={{ color: "var(--text-dark)" }}>{t.name}</div>
                              <div className="text-[10px] mt-0.5" style={{ color: textMuted }}>{t.mode}</div>
                            </div>
                          </div>
                          {selected && (
                            <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: teal }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                                <path d="M20 6L9 17l-5-5" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Bell */}
        <div className="relative">
          <button
            onClick={() => setShowNotifs(v => !v)}
            className="w-8 h-8 flex items-center justify-center rounded-full transition-colors relative hover:bg-teal-50"
            style={{ border: "1px solid var(--card-border)", color: "#374151", background: "#F0FDF9" }}
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 text-[9px] font-bold rounded-full flex items-center justify-center"
                style={{ background: teal, color: "white" }}>
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          {showNotifs && (
            <div className="absolute right-0 top-10 w-80 rounded-2xl overflow-hidden z-50"
              style={{ background: "var(--card-bg)", boxShadow: "0 8px 32px rgba(13,61,54,0.12)", border: "1px solid var(--card-border)" }}>
              <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--topbar-border)" }}>
                <span className="font-semibold text-sm" style={{ color: "var(--text-dark)" }}>Notifications</span>
                {unreadCount > 0 && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: tealPale, color: darkTeal }}>
                    {unreadCount} new
                  </span>
                )}
              </div>
              <div className="max-h-72 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
                {notifications.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm" style={{ color: textMuted }}>All caught up ✓</div>
                ) : (
                  notifications.map(n => (
                    <div key={n.id}
                      onClick={() => { onMarkRead(n.id); setShowNotifs(false); }}
                      className="px-4 py-3 cursor-pointer transition-colors"
                      style={{ background: !n.read ? "#F0FDFB" : undefined, borderBottom: "1px solid #F0FDFB" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "#EAF7F3")}
                      onMouseLeave={e => (e.currentTarget.style.background = !n.read ? "#F0FDFB" : "")}
                    >
                      <div className="flex items-start gap-2">
                        {!n.read && <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: teal }} />}
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold truncate" style={{ color: "var(--text-dark)" }}>{n.subject}</div>
                          <div className="text-xs mt-0.5 line-clamp-2 leading-relaxed" style={{ color: textMuted }}>{n.body}</div>
                          {n.metadata?.actioned_by_name && (
                            <div className="text-[10px] mt-1" style={{ color: textMuted }}>
                              {String(n.metadata.status) === "APPROVED" ? "✓ Approved" : "✗ Rejected"} by{" "}
                              <span className="font-semibold" style={{ color: "var(--text-dark)" }}>{String(n.metadata.actioned_by_name)}</span>
                            </div>
                          )}
                          <div className="text-[10px] mt-1" style={{ color: "#9DCFC9" }}>{new Date(n.created_at).toLocaleString("en-IN")}</div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User icon */}
        <button
          onClick={onLogout}
          className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:bg-teal-50"
          style={{ border: "1px solid var(--card-border)", color: "#374151", background: "#F0FDF9" }}
          title="Logout"
        >
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            <circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="1.8"/>
          </svg>
        </button>
      </div>
    </header>
  );
}
