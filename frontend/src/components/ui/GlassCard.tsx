import React, { useState } from "react";

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
  hover?: boolean;
  numbered?: string;
  /** Kept for API compatibility; ignored — use CSS variables for dark mode */
  dark?: boolean;
}

export default function GlassCard({
  children,
  className = "",
  style = {},
  onClick,
  hover = true,
  numbered,
  dark: _dark,
}: GlassCardProps) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => hover && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={className}
      style={{
        position: "relative",
        borderRadius: 20,
        background: "var(--card)",
        border: "1px solid var(--cardBorder)",
        boxShadow: hovered ? "var(--cardShadowH)" : "var(--cardShadow)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        transition: "box-shadow 0.2s, transform 0.2s",
        overflow: "hidden",
        padding: 20,
        cursor: onClick ? "pointer" : undefined,
        transform: hovered && onClick ? "translateY(-1px)" : undefined,
        ...style,
      }}
    >
      {numbered && (
        <span
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            fontSize: 10,
            fontWeight: 600,
            padding: "2px 7px",
            borderRadius: 999,
            background: "var(--accentLight)",
            color: "var(--accentText)",
          }}
        >
          {numbered}
        </span>
      )}
      {children}
    </div>
  );
}
