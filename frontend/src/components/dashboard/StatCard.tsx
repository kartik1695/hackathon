import React from "react";

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

export default function StatCard({ label, value, sublabel, dark, icon, trend, onClick, numbered, accent }: StatCardProps) {
  const cardStyle: React.CSSProperties = dark
    ? { background: "var(--primary-dark)", color: "white" }
    : accent
    ? { background: "var(--primary)", color: "white" }
    : { background: "var(--card-bg)", border: "1px solid var(--card-border)", color: "var(--text-dark)" };

  const subStyle: React.CSSProperties = dark || accent
    ? { color: "rgba(255,255,255,0.55)" }
    : { color: "var(--text-muted)" };

  return (
    <div
      onClick={onClick}
      className={`relative rounded-2xl p-5 shadow-[0_1px_4px_rgba(0,0,0,0.07)] overflow-hidden ${onClick ? "cursor-pointer transition-all duration-200 hover:shadow-[0_4px_16px_rgba(0,0,0,0.10)] hover:-translate-y-0.5" : ""}`}
      style={cardStyle}
    >
      {numbered && (
        <span className="absolute top-3 right-3 text-[10px] font-semibold px-2 py-0.5 rounded-full"
          style={{ background: "rgba(255,255,255,0.15)", color: "inherit", opacity: 0.7 }}>
          {numbered}
        </span>
      )}
      {icon && <div className="text-xl mb-2">{icon}</div>}
      <div className="text-4xl font-bold tracking-tight">{value}</div>
      <div className="text-sm font-medium mt-1">{label}</div>
      {sublabel && <div className="text-xs mt-0.5" style={subStyle}>{sublabel}</div>}
      {trend && (
        <div className="text-xs mt-3 flex items-center gap-1" style={subStyle}>
          <span>↗</span><span>{trend}</span>
        </div>
      )}
    </div>
  );
}
