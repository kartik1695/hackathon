import React, { useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "./api";
import { saveTokens } from "./auth";
import { LoginIllustrationPanel } from "./LoginIllustration";

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const tokens = await login(email, password);
      saveTokens(tokens.access, tokens.refresh);
      navigate("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex relative overflow-hidden"
      style={{
        background:
          "linear-gradient(315deg,hsla(214,81%,86%,1) 0%,hsla(217,57%,93%,1) 47%,hsla(218,60%,92%,1) 100%)",
      }}
    >
      {/* illustration — dead-centre watermark */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-100 -translate-x-[60px]">
        <LoginIllustrationPanel mode="watermark" />
      </div>

      {/* ── Left panel ───────────────────────────────────────────────────────── */}
      <div className="hidden lg:flex flex-col justify-between w-[55%] pl-24 pr-8 py-14 relative z-10">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 9,
              background: "#1e3a8a",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            HE
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#0c1a3a" }}>
              Human Edge
            </div>
            <div style={{ fontSize: 10, color: "#64748b" }}>
              AI-Powered HRMS
            </div>
          </div>
        </div>

        {/* Hero */}
        <div className="space-y-8">
          <div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 12px",
                borderRadius: 999,
                background: "rgba(37,99,235,0.1)",
                color: "#1e40af",
                fontSize: 11,
                fontWeight: 600,
                marginBottom: 20,
              }}
            >
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: "#2563eb",
                  display: "inline-block",
                }}
              />
              AI-Enabled HR Platform
            </div>
            <h1
              style={{
                fontSize: 50,
                fontWeight: 250,
                color: "#0c1a3a",
                lineHeight: 1.1,
                letterSpacing: "-0.03em",
                margin: "0 0 16px",
              }}
            >
              The smartest
              <br />
              HR workspace
              <br />
              <span style={{ color: "#2563eb" }}>you'll ever use.</span>
            </h1>
            <p
              style={{
                fontSize: 14,
                color: "#64748b",
                fontWeight: 300,
                maxWidth: 340,
                margin: 0,
              }}
            >
              Leave management, attendance, org insights — powered by
              conversational AI. No forms, no friction.
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-10">
          {[
            { val: "+18K", label: "Requests processed" },
            { val: "94%", label: "AI accuracy" },
            { val: "4.8★", label: "Satisfaction" },
          ].map((s) => (
            <div key={s.label}>
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 250,
                  color: "#0c1a3a",
                  letterSpacing: "-0.02em",
                }}
              >
                {s.val}
              </div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right panel — login form ──────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 items-center justify-center px-8 py-12 relative z-10">
        {/* Mobile logo */}
        <div className="flex items-center gap-2 mb-10 lg:hidden">
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: "#1e3a8a",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            HE
          </div>
          <span style={{ fontWeight: 600, fontSize: 15, color: "#0c1a3a" }}>
            Human Edge
          </span>
        </div>

        <div className="w-full max-w-sm">
          <div
            style={{
              background: "rgba(255,255,255,0.55)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              borderRadius: 20,
              padding: 32,
              border: "1px solid rgba(255,255,255,0.6)",
              boxShadow:
                "0 2px 20px rgba(37,99,235,0.06),0 0 0 1px rgba(255,255,255,0.4) inset",
            }}
          >
            <div style={{ marginBottom: 24 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 14,
                  background: "#1e3a8a",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 18,
                }}
              >
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
                  <path
                    d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"
                    stroke="#fff"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <circle cx="12" cy="7" r="4" stroke="#fff" strokeWidth="2" />
                </svg>
              </div>
              <h2
                style={{
                  fontSize: 22,
                  fontWeight: 250,
                  color: "#0c1a3a",
                  letterSpacing: "-0.02em",
                  margin: "0 0 6px",
                }}
              >
                Welcome back
              </h2>
              <p
                style={{
                  fontSize: 13,
                  color: "#64748b",
                  margin: 0,
                  fontWeight: 300,
                }}
              >
                Sign in to your workspace
              </p>
            </div>

            <form
              onSubmit={handleSubmit}
              style={{ display: "flex", flexDirection: "column", gap: 14 }}
            >
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 10.5,
                    fontWeight: 600,
                    color: "#64748b",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    marginBottom: 5,
                  }}
                >
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: 10,
                    fontSize: 13,
                    color: "#0c1a3a",
                    fontFamily: "inherit",
                    background: "rgba(255,255,255,0.7)",
                    border: "1px solid rgba(255,255,255,0.6)",
                    outline: "none",
                    boxSizing: "border-box",
                    transition: "border-color 0.15s, background 0.15s",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#2563eb";
                    e.currentTarget.style.background = "#fff";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.6)";
                    e.currentTarget.style.background = "rgba(255,255,255,0.7)";
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 10.5,
                    fontWeight: 600,
                    color: "#64748b",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    marginBottom: 5,
                  }}
                >
                  Password
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showPass ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      paddingRight: 50,
                      borderRadius: 10,
                      fontSize: 13,
                      color: "#0c1a3a",
                      fontFamily: "inherit",
                      background: "rgba(255,255,255,0.7)",
                      border: "1px solid rgba(255,255,255,0.6)",
                      outline: "none",
                      boxSizing: "border-box",
                      transition: "border-color 0.15s, background 0.15s",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "#2563eb";
                      e.currentTarget.style.background = "#fff";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor =
                        "rgba(255,255,255,0.6)";
                      e.currentTarget.style.background =
                        "rgba(255,255,255,0.7)";
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    style={{
                      position: "absolute",
                      right: 12,
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontSize: 11.5,
                      fontWeight: 600,
                      color: "#64748b",
                      fontFamily: "inherit",
                    }}
                  >
                    {showPass ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              {error && (
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    background: "rgba(239,68,68,0.08)",
                    border: "1px solid rgba(239,68,68,0.2)",
                    fontSize: 12.5,
                    color: "#ef4444",
                  }}
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: 999,
                  background: "#1e3a8a",
                  color: "#fff",
                  fontSize: 13.5,
                  fontWeight: 600,
                  fontFamily: "inherit",
                  border: "none",
                  cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.7 : 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  transition: "opacity 0.15s",
                  marginTop: 6,
                }}
              >
                {loading ? (
                  <>
                    <span
                      style={{
                        width: 16,
                        height: 16,
                        border: "2px solid rgba(255,255,255,0.3)",
                        borderTopColor: "#fff",
                        borderRadius: "50%",
                        animation: "spin 1s linear infinite",
                      }}
                    />
                    Signing in…
                  </>
                ) : (
                  "Sign in →"
                )}
              </button>
            </form>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                margin: "20px 0",
              }}
            >
              <div
                style={{
                  flex: 1,
                  height: 1,
                  background: "rgba(37,99,235,0.09)",
                }}
              />
              <span style={{ fontSize: 10, color: "#64748b", fontWeight: 500 }}>
                SECURED
              </span>
              <div
                style={{
                  flex: 1,
                  height: 1,
                  background: "rgba(37,99,235,0.09)",
                }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "center", gap: 20 }}>
              {["JWT Auth", "AES-256", "SOC2"].map((b) => (
                <div
                  key={b}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 10,
                    color: "#64748b",
                    fontWeight: 500,
                  }}
                >
                  <span style={{ color: "#2563eb" }}>✓</span>
                  <span>{b}</span>
                </div>
              ))}
            </div>
          </div>

          <p
            style={{
              textAlign: "center",
              fontSize: 11,
              color: "#64748b",
              marginTop: 20,
            }}
          >
            HRMS · AI-Powered Human Resource Management
          </p>
        </div>
      </div>
    </div>
  );
}
