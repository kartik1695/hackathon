import React, { useState } from "react";

interface StatCardProps {
  label: string;
  value: string | number;
  sublabel?: string;
  gradient?: string;
  dark?: boolean;
  icon?: string;
  trend?: string;
  onClick?: () => void;
  numbered?: string;
  accent?: boolean;
}

export default function StatCard({
  label,
  value,
  sublabel,
  dark,
  icon,
  trend,
  onClick,
  numbered,
  accent,
}: StatCardProps) {
  const [hov, setHov] = useState(false);

  const cardStyle: React.CSSProperties = dark
    ? { background: "var(--darkCard)", color: "var(--ink)" }
    : accent
      ? { background: "var(--accent)", color: "#fff" }
      : {
          background: "var(--card)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid var(--cardBorder)",
          color: "var(--ink)",
        };

  const subStyle: React.CSSProperties =
    dark || accent
      ? { color: "rgba(255,255,255,0.55)" }
      : { color: "var(--muted)" };

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={onClick}
      style={{
        position: "relative",
        borderRadius: 20,
        padding: 20,
        overflow: "hidden",
        boxShadow: hov ? "var(--cardShadowH)" : "var(--cardShadow)",
        transition: "box-shadow 0.2s, transform 0.2s",
        cursor: onClick ? "pointer" : undefined,
        transform: hov && onClick ? "translateY(-1px)" : undefined,
        ...cardStyle,
      }}
    >
      {numbered && (
        <span
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            fontSize: 10,
            fontWeight: 600,
            padding: "2px 7px",
            borderRadius: 999,
            background: "rgba(255,255,255,0.15)",
            color: "inherit",
            opacity: 0.7,
          }}
        >
          {numbered}
        </span>
      )}
      {icon && <div style={{ fontSize: 20, marginBottom: 8 }}>{icon}</div>}
      <div
        style={{
          fontSize: 36,
          fontWeight: 300,
          letterSpacing: "-0.02em",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 13, fontWeight: 500, marginTop: 5 }}>{label}</div>
      {sublabel && (
        <div style={{ fontSize: 11.5, marginTop: 3, ...subStyle }}>
          {sublabel}
        </div>
      )}
      {trend && (
        <div
          style={{
            fontSize: 11.5,
            marginTop: 10,
            display: "flex",
            alignItems: "center",
            gap: 4,
            ...subStyle,
          }}
        >
          <span>↗</span>
          <span>{trend}</span>
        </div>
      )}
    </div>
  );
}
