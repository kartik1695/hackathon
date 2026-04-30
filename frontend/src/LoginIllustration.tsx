import {
  ArrowLeft,
  BarChart3,
  Brain,
  CalendarDays,
  IndianRupee,
  ShieldCheck,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import "./LoginIllustration.css";

interface LoginIllustrationPanelProps {
  onBack?: () => void;
  mode?: "panel" | "watermark";
}

const BADGES = [
  { icon: Users, label: "People", tone: "blue", pos: "tl" },
  { icon: TrendingUp, label: "Analytics", tone: "mint", pos: "tc" },
  { icon: Brain, label: "AI Insights", tone: "violet", pos: "tr" },
  { icon: IndianRupee, label: "Payroll", tone: "amber", pos: "ml" },
  { icon: BarChart3, label: "Reports", tone: "sky", pos: "mr" },
  { icon: Target, label: "Goals", tone: "rose", pos: "bl" },
  { icon: CalendarDays, label: "Leave", tone: "green", pos: "bc" },
  { icon: ShieldCheck, label: "Compliance", tone: "indigo", pos: "br" },
] as const;

export function LoginIllustrationPanel({
  onBack,
  mode = "panel",
}: LoginIllustrationPanelProps) {
  const isWatermark = mode === "watermark";

  return (
    <div className={isWatermark ? "he-login-watermark" : "he-login-left"}>
      {!isWatermark && onBack && (
        <button className="he-login-back" onClick={onBack} type="button">
          <ArrowLeft width={14} height={14} strokeWidth={2} />
          <span>Back</span>
        </button>
      )}

      <div className="he-login-illus" aria-hidden="true">
        <div className="he-login-ring he-login-ring-in" />
        <div className="he-login-ring he-login-ring-out" />

        {BADGES.map(({ icon: Icon, label, tone, pos }) => (
          <div key={label} className={`he-li-badge he-li-${tone} he-li-${pos}`}>
            <Icon className="he-li-icon" strokeWidth={1.9} />
            <span>{label}</span>
          </div>
        ))}

        <div className="he-login-brand-center">
          <div className="he-login-lm-wrap">
            <span className="he-logo-mark he-login-lm" />
          </div>
          <h2 className="he-login-brand-name">Human Edge</h2>
          <p className="he-login-brand-sub">People intelligence, redefined.</p>
        </div>
      </div>
    </div>
  );
}
