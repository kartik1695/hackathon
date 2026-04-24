import React from "react";

export type NavPage = "dashboard" | "leaves" | "attendance" | "employees" | "chat" | "upskilling" | "feedback";

interface SidebarProps {
  current: NavPage;
  onNav: (p: NavPage) => void;
  role: string;
  userName: string;
  onLogout: () => void;
}

// Sidebar is hidden — navigation moved to TopBar
export default function Sidebar(_props: SidebarProps) {
  return null;
}
