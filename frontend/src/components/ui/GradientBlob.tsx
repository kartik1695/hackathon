import React from "react";

interface BlobProps {
  variant?: "pink" | "teal" | "orange" | "purple" | "blue";
  className?: string;
  size?: "sm" | "md" | "lg";
}

const GRADIENTS = {
  pink: "from-pink-400 via-rose-300 to-orange-300",
  teal: "from-teal-300 via-cyan-400 to-blue-400",
  orange: "from-orange-400 via-amber-300 to-yellow-300",
  purple: "from-purple-400 via-violet-300 to-pink-300",
  blue: "from-blue-400 via-indigo-300 to-cyan-300",
};

const SIZES = { sm: "w-32 h-32", md: "w-48 h-48", lg: "w-72 h-72" };

export default function GradientBlob({
  variant = "pink",
  className = "",
  size = "md",
}: BlobProps) {
  return (
    <div
      aria-hidden
      className={`rounded-full bg-gradient-to-br ${GRADIENTS[variant]} ${SIZES[size]} opacity-50 pointer-events-none ${className}`}
      style={{ filter: "blur(40px)" }}
    />
  );
}
