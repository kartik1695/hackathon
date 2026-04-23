import { useState, useEffect } from "react";
import { NavPage } from "./Sidebar";

interface NotificationItem {
  id: number;
  subject: string;
  body: string;
  read: boolean;
  created_at: string;
  metadata?: Record<string, unknown>;
}
type ThemeChoice = {
  id: string;
  name: string;
  mode: string;
  icon: string;
  preview: { from: string; to: string };
};
interface TopBarProps {
  page: NavPage;
  notifications: NotificationItem[];
  unreadCount: number;
  onMarkRead: (id: number, navTarget?: NavPage) => void;
  onNav: (p: NavPage) => void;
  userName?: string;
  onLogout?: () => void;
  themeId: string;
  themes: ThemeChoice[];
  onThemeSelect: (id: string) => void;
  scrolled?: boolean;
}

function navTargetFromNotif(n: NotificationItem): NavPage | undefined {
  const m = n.metadata ?? {};
  if (m.leave_id != null) return "leaves";
  if (m.regularization_id != null || m.wfh_id != null || m.penalty_id != null)
    return "attendance";
  if (m.roadmap_id != null || m.step_id != null) return "upskilling";
  return undefined;
}

// Nav tabs — label drives display; id drives navigation
const NAV_TABS: { id: NavPage; label: string; activeFor?: NavPage[] }[] = [
  { id: "dashboard", label: "Dashboard", activeFor: ["dashboard"] },
  { id: "employees", label: "People", activeFor: ["employees"] },
  { id: "attendance", label: "Attendance", activeFor: ["attendance"] },
  { id: "leaves", label: "Leave", activeFor: ["leaves"] },
  { id: "upskilling", label: "Upskilling", activeFor: ["upskilling"] },
  { id: "chat", label: "AI Insights", activeFor: ["chat"] },
];

export default function TopBar({
  page,
  notifications,
  unreadCount,
  onMarkRead,
  onNav,
  userName = "",
  onLogout,
  themeId,
  themes,
  onThemeSelect,
  scrolled = false,
}: TopBarProps) {
  const [showNotifs, setShowNotifs] = useState(false);
  const [showThemes, setShowThemes] = useState(false);

  const isDark = themeId === "midnight";
  const pillBg = isDark ? "rgba(30,30,50,0.75)" : "rgba(255,255,255,0.82)";
  const pillShadow = isDark
    ? "0 2px 20px rgba(0,0,0,0.4),0 0 0 1px rgba(255,255,255,0.08)"
    : "0 2px 20px rgba(0,0,0,0.08),0 0 0 1px rgba(255,255,255,0.6)";

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 200,
        height: 64,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 16px",
        flexShrink: 0,
      }}
    >
      {/* Blur — only when scrolled. Mask fades from full at top to zero at
          bottom of the overflow zone so there is no hard line. */}
      {scrolled && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: -80,
            pointerEvents: "none",
            backdropFilter: "blur(36px)",
            WebkitBackdropFilter: "blur(36px)",
            maskImage:
              "linear-gradient(to bottom, black 0%, black 44%, transparent 100%)",
            WebkitMaskImage:
              "linear-gradient(to bottom, black 0%, black 44%, transparent 100%)",
          }}
        />
      )}

      {/* Content row */}
      <div
        style={{
          position: "relative",
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
        }}
      >
        {/* Main nav pill */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 2,
            background: pillBg,
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            borderRadius: 999,
            padding: "5px",
            boxShadow: pillShadow,
            overflowX: "auto",
            scrollbarWidth: "none",
            maxWidth: "calc(100vw - 200px)",
          }}
        >
          {NAV_TABS.map((tab, i) => {
            const isActive = tab.activeFor
              ? tab.activeFor.includes(page)
              : false;
            const isActiveTab =
              isActive &&
              NAV_TABS.findIndex((x) => x.activeFor?.includes(page)) === i;
            return (
              <button
                key={`${tab.id}-${tab.label}`}
                onClick={() => onNav(tab.id)}
                style={{
                  padding: isActiveTab ? "7px 18px" : "7px 14px",
                  borderRadius: 999,
                  border: "none",
                  background: isActiveTab ? "var(--navPill)" : "transparent",
                  color: isActiveTab ? "#fff" : "var(--muted)",
                  fontSize: 13,
                  fontWeight: isActiveTab ? 600 : 400,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  transition: "all 0.18s",
                  fontFamily: "inherit",
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Settings pill */}
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              background: pillBg,
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              borderRadius: 999,
              padding: "5px 8px",
              boxShadow: pillShadow,
              gap: 4,
              flexShrink: 0,
            }}
          >
            {/* Setting button */}
            <button
              onClick={() => {
                setShowThemes(true);
                setShowNotifs(false);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "6px 12px",
                borderRadius: 999,
                border: "none",
                background: "transparent",
                color: "var(--muted)",
                fontSize: 12.5,
                fontWeight: 400,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24">
                <circle
                  cx="12"
                  cy="12"
                  r="3"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
                <path
                  d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
              </svg>
              Setting
            </button>

            <div
              style={{ width: 1, height: 16, background: "var(--border)" }}
            />

            {/* Bell */}
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setShowNotifs((v) => !v)}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--muted)",
                  position: "relative",
                }}
              >
                <svg width="15" height="15" fill="none" viewBox="0 0 24 24">
                  <path
                    d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                  <path
                    d="M13.73 21a2 2 0 0 1-3.46 0"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
                {unreadCount > 0 && (
                  <span
                    style={{
                      position: "absolute",
                      top: 2,
                      right: 2,
                      width: 14,
                      height: 14,
                      borderRadius: "50%",
                      background: "var(--accent)",
                      color: "#fff",
                      fontSize: 8,
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>

              {/* Notification dropdown */}
              {showNotifs && (
                <div
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "calc(100% + 10px)",
                    width: 320,
                    borderRadius: 16,
                    overflow: "hidden",
                    zIndex: 999,
                    background: "var(--card)",
                    backdropFilter: "blur(20px)",
                    WebkitBackdropFilter: "blur(20px)",
                    boxShadow: "var(--cardShadow)",
                    border: "1px solid var(--cardBorder)",
                  }}
                >
                  <div
                    style={{
                      padding: "12px 16px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 600,
                        fontSize: 13,
                        color: "var(--ink)",
                      }}
                    >
                      Notifications
                    </span>
                    {unreadCount > 0 && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          padding: "2px 8px",
                          borderRadius: 999,
                          background: "var(--accentLight)",
                          color: "var(--navPill)",
                        }}
                      >
                        {unreadCount} new
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      maxHeight: 280,
                      overflowY: "auto",
                      scrollbarWidth: "none",
                    }}
                  >
                    {notifications.length === 0 ? (
                      <div
                        style={{
                          padding: "32px 16px",
                          textAlign: "center",
                          fontSize: 13,
                          color: "var(--muted)",
                        }}
                      >
                        All caught up ✓
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          onClick={() => {
                            onMarkRead(n.id, navTargetFromNotif(n));
                            setShowNotifs(false);
                          }}
                          style={{
                            padding: "12px 16px",
                            cursor: "pointer",
                            background: !n.read
                              ? "var(--accentLight)"
                              : "transparent",
                            borderBottom: "1px solid var(--border)",
                            transition: "background 0.15s",
                          }}
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.background =
                              "var(--surface2)")
                          }
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.background = !n.read
                              ? "var(--accentLight)"
                              : "transparent")
                          }
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "flex-start",
                              gap: 8,
                            }}
                          >
                            {!n.read && (
                              <div
                                style={{
                                  width: 6,
                                  height: 6,
                                  borderRadius: "50%",
                                  marginTop: 5,
                                  flexShrink: 0,
                                  background: "var(--accent)",
                                }}
                              />
                            )}
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div
                                style={{
                                  fontSize: 12,
                                  fontWeight: 600,
                                  color: "var(--ink)",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {n.subject}
                              </div>
                              <div
                                style={{
                                  fontSize: 11.5,
                                  marginTop: 2,
                                  color: "var(--muted)",
                                  display: "-webkit-box",
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: "vertical" as const,
                                  overflow: "hidden",
                                }}
                              >
                                {n.body}
                              </div>
                              {n.metadata?.actioned_by_name && (
                                <div
                                  style={{
                                    fontSize: 10,
                                    marginTop: 3,
                                    color: "var(--muted)",
                                  }}
                                >
                                  {String(n.metadata.status) === "APPROVED"
                                    ? "✓ Approved"
                                    : "✗ Rejected"}{" "}
                                  by{" "}
                                  <span
                                    style={{
                                      fontWeight: 600,
                                      color: "var(--ink)",
                                    }}
                                  >
                                    {String(n.metadata.actioned_by_name)}
                                  </span>
                                </div>
                              )}
                              <div
                                style={{
                                  fontSize: 10,
                                  marginTop: 3,
                                  color: "var(--muted)",
                                }}
                              >
                                {new Date(n.created_at).toLocaleString("en-IN")}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* User / logout button */}
            <button
              onClick={onLogout}
              title={`Logout${userName ? ` (${userName})` : ""}`}
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--muted)",
              }}
            >
              <svg width="15" height="15" fill="none" viewBox="0 0 24 24">
                <path
                  d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <circle
                  cx="12"
                  cy="7"
                  r="4"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Theme picker modal */}
      {showThemes && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            background: "rgba(0,0,0,0.45)",
            backdropFilter: "blur(6px)",
          }}
          onMouseDown={(e) => {
            if (e.currentTarget === e.target) setShowThemes(false);
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 520,
              borderRadius: 20,
              overflow: "hidden",
              background: "var(--card)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              border: "1px solid var(--cardBorder)",
              boxShadow: "0 24px 80px rgba(0,0,0,0.2)",
            }}
          >
            <div
              style={{
                padding: "24px 24px 16px",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 250,
                    letterSpacing: "-0.01em",
                    color: "var(--ink)",
                    margin: 0,
                  }}
                >
                  Choose Theme
                </div>
                <div
                  style={{ fontSize: 12, marginTop: 4, color: "var(--muted)" }}
                >
                  Personalise your Human Edge experience
                </div>
              </div>
              <button
                onClick={() => setShowThemes(false)}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "transparent",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--muted)",
                }}
              >
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24">
                  <path
                    d="M6 6l12 12M18 6L6 18"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
            <div style={{ padding: "0 24px 24px" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                }}
              >
                {themes.map((t) => {
                  const selected = t.id === themeId;
                  return (
                    <button
                      key={t.id}
                      onClick={() => {
                        onThemeSelect(t.id);
                        setShowThemes(false);
                      }}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        borderRadius: 14,
                        padding: "14px 16px",
                        border: selected
                          ? "2px solid var(--accent)"
                          : "1px solid var(--cardBorder)",
                        background: selected
                          ? "var(--accentLight)"
                          : "var(--surface2)",
                        cursor: "pointer",
                        transition: "all 0.15s",
                        fontFamily: "inherit",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 10,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            minWidth: 0,
                          }}
                        >
                          <div
                            style={{
                              width: 40,
                              height: 40,
                              borderRadius: 12,
                              flexShrink: 0,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              background: `linear-gradient(135deg, ${t.preview.from}, ${t.preview.to})`,
                              fontSize: 16,
                            }}
                          >
                            {t.icon}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: 13,
                                fontWeight: 600,
                                color: "var(--ink)",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {t.name}
                            </div>
                            <div
                              style={{
                                fontSize: 10,
                                marginTop: 2,
                                color: "var(--muted)",
                              }}
                            >
                              {t.mode}
                            </div>
                          </div>
                        </div>
                        {selected && (
                          <div
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: "50%",
                              background: "var(--accent)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                            }}
                          >
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                            >
                              <path
                                d="M20 6L9 17l-5-5"
                                stroke="#fff"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
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
    </header>
  );
}
