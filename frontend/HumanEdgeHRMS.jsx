import { useState, useEffect, useRef } from "react";
import profilePhoto from "@assets/man-smiling_1776747477665.png";

// ─── THEMES ──────────────────────────────────────────────────────────────────
const THEMES = {
  arctic: {
    name:"Arctic Blue",emoji:"🧊",
    pageBg:"linear-gradient(315deg, hsla(214, 81%, 86%, 1) 0%, hsla(217, 57%, 93%, 1) 47%, hsla(218, 60%, 92%, 1) 100%)",
    card:"rgba(255,255,255,0.55)",cardBorder:"rgba(255,255,255,0.6)",
    cardShadow:"0 2px 20px rgba(37,99,235,0.06),0 0 0 1px rgba(255,255,255,0.4) inset",
    surface2:"#f3f7ff",accent:"#2563eb",accentLight:"#dbeafe",accentText:"#1e40af",
    accent2:"#60a5fa",navPill:"#1e3a8a",ink:"#0c1a3a",muted:"#64748b",
    border:"rgba(37,99,235,0.09)",darkCard:"#1e2d5e",
    success:"#10b981",warning:"#f59e0b",danger:"#ef4444",
    barActive:"#2563eb",barInactive:"#c7d8f8",timerDash:"#c7d8f8",
  },
  solar: {
    name:"Solar Gold",emoji:"☀️",
    pageBg:"linear-gradient(160deg,#fef3c7 0%,#fffbeb 40%,#fde68a 100%)",
    card:"#ffffff",cardBorder:"rgba(217,119,6,0.07)",
    cardShadow:"0 2px 20px rgba(217,119,6,0.1),0 0 0 1px rgba(217,119,6,0.05)",
    surface2:"#fffdf0",accent:"#d97706",accentLight:"#fef3c7",accentText:"#92400e",
    accent2:"#fbbf24",navPill:"#92400e",ink:"#1c1410",muted:"#78716c",
    border:"rgba(217,119,6,0.1)",darkCard:"#292010",
    success:"#10b981",warning:"#f59e0b",danger:"#ef4444",
    barActive:"#d97706",barInactive:"#fde68a",timerDash:"#fde68a",
  },
  aurora: {
    name:"Aurora Teal",emoji:"🌊",
    pageBg:"linear-gradient(160deg,#ccfbf1 0%,#ecfdf5 40%,#cffafe 100%)",
    card:"#ffffff",cardBorder:"rgba(13,148,136,0.07)",
    cardShadow:"0 2px 20px rgba(13,148,136,0.09),0 0 0 1px rgba(13,148,136,0.04)",
    surface2:"#f0fdf9",accent:"#0d9488",accentLight:"#ccfbf1",accentText:"#115e59",
    accent2:"#2dd4bf",navPill:"#134e4a",ink:"#0f1f1e",muted:"#5f7975",
    border:"rgba(13,148,136,0.09)",darkCard:"#134e4a",
    success:"#10b981",warning:"#f59e0b",danger:"#ef4444",
    barActive:"#0d9488",barInactive:"#99f6e4",timerDash:"#99f6e4",
  },
  midnight: {
    name:"Midnight",emoji:"🌙",isDark:true,
    pageBg:"linear-gradient(160deg,#0d0d1f 0%,#09090f 40%,#0d0d1f 100%)",
    card:"#13131e",cardBorder:"rgba(129,140,248,0.1)",
    cardShadow:"0 2px 24px rgba(0,0,0,0.4),0 0 0 1px rgba(129,140,248,0.08)",
    surface2:"#1a1a2e",accent:"#818cf8",accentLight:"#1e1b4b",accentText:"#a5b4fc",
    accent2:"#38bdf8",navPill:"#4338ca",ink:"#e2e8f0",muted:"#94a3b8",
    border:"rgba(255,255,255,0.06)",darkCard:"#1e1b4b",
    success:"#34d399",warning:"#fbbf24",danger:"#f87171",
    barActive:"#818cf8",barInactive:"#312e81",timerDash:"#312e81",
  },
  blossom: {
    name:"Blossom",emoji:"🌸",
    pageBg:"linear-gradient(160deg,#fecdd3 0%,#fff1f4 40%,#fce7f3 100%)",
    card:"#ffffff",cardBorder:"rgba(225,29,72,0.07)",
    cardShadow:"0 2px 20px rgba(225,29,72,0.08),0 0 0 1px rgba(225,29,72,0.04)",
    surface2:"#fff8fa",accent:"#e11d48",accentLight:"#ffe4e6",accentText:"#9f1239",
    accent2:"#fb7185",navPill:"#9f1239",ink:"#1a0a10",muted:"#9f6976",
    border:"rgba(225,29,72,0.09)",darkCard:"#4c0519",
    success:"#10b981",warning:"#f59e0b",danger:"#ef4444",
    barActive:"#e11d48",barInactive:"#fecdd3",timerDash:"#fecdd3",
  },
  forest: {
    name:"Forest",emoji:"🌿",
    pageBg:"linear-gradient(160deg,#bbf7d0 0%,#f0fdf4 40%,#d1fae5 100%)",
    card:"#ffffff",cardBorder:"rgba(22,163,74,0.07)",
    cardShadow:"0 2px 20px rgba(22,163,74,0.08),0 0 0 1px rgba(22,163,74,0.04)",
    surface2:"#f0fdf4",accent:"#16a34a",accentLight:"#dcfce7",accentText:"#14532d",
    accent2:"#4ade80",navPill:"#14532d",ink:"#0d1f14",muted:"#4a7c5f",
    border:"rgba(22,163,74,0.09)",darkCard:"#14532d",
    success:"#10b981",warning:"#f59e0b",danger:"#ef4444",
    barActive:"#16a34a",barInactive:"#bbf7d0",timerDash:"#bbf7d0",
  },
};

// ─── STATIC DATA ──────────────────────────────────────────────────────────────
const INIT_EMPLOYEES = [
  {id:"E001",name:"Priya Ramesh",  role:"Sr. Frontend Engineer",dept:"Engineering",manager:"Arjun Nair",  joined:"Jan 12, 2022",status:"active",  av:"PR",col:"#7c3aed",salary:1800000},
  {id:"E002",name:"Arjun Nair",    role:"Engineering Manager",  dept:"Engineering",manager:"Sneha Iyer",  joined:"Mar 5, 2020", status:"active",  av:"AN",col:"#2563eb",salary:2800000},
  {id:"E003",name:"Sneha Iyer",    role:"VP Engineering",       dept:"Engineering",manager:"—",           joined:"Aug 1, 2019", status:"active",  av:"SI",col:"#0d9488",salary:5200000},
  {id:"E004",name:"Rohan Mehta",   role:"Product Designer",     dept:"Design",     manager:"Kavya Sharma",joined:"Jun 20, 2022",status:"active",  av:"RM",col:"#e11d48",salary:1400000},
  {id:"E005",name:"Kavya Sharma",  role:"Design Lead",          dept:"Design",     manager:"Sneha Iyer",  joined:"Feb 14, 2021",status:"active",  av:"KS",col:"#d97706",salary:2200000},
  {id:"E006",name:"Vikram Singh",  role:"Backend Engineer",     dept:"Engineering",manager:"Arjun Nair",  joined:"Sep 10, 2023",status:"active",  av:"VS",col:"#16a34a",salary:1500000},
  {id:"E007",name:"Nisha Patel",   role:"HR Business Partner",  dept:"HR",         manager:"Sneha Iyer",  joined:"Nov 2, 2021", status:"active",  av:"NP",col:"#7c3aed",salary:1600000},
  {id:"E008",name:"Aditya Rao",    role:"Data Analyst",         dept:"Analytics",  manager:"Sneha Iyer",  joined:"Jan 8, 2023", status:"inactive",av:"AR",col:"#0ea5e9",salary:1300000},
];

const INIT_LEAVES = [
  {id:1,emp:"Rohan Mehta",  type:"Casual",   from:"Apr 22",to:"Apr 23",days:2,reason:"Personal work",   status:"pending"},
  {id:2,emp:"Vikram Singh", type:"Sick",     from:"Apr 21",to:"Apr 21",days:1,reason:"Fever",           status:"pending"},
  {id:3,emp:"Priya Ramesh", type:"Earned",   from:"Apr 28",to:"May 2", days:5,reason:"Family vacation", status:"approved"},
  {id:4,emp:"Nisha Patel",  type:"WFH",      from:"Apr 24",to:"Apr 25",days:2,reason:"Home repair",     status:"approved"},
  {id:5,emp:"Aditya Rao",   type:"Comp-off", from:"Apr 26",to:"Apr 26",days:1,reason:"Worked Sunday",   status:"rejected"},
];

const INIT_OB_TASKS = [
  {id:1,title:"Complete IT Setup",        date:"Sep 13, 08:30",done:true, icon:"💻"},
  {id:2,title:"Design Review",            date:"Sep 13, 10:30",done:true, icon:"🎨"},
  {id:3,title:"Project Update",           date:"Sep 13, 13:00",done:true, icon:"📊"},
  {id:4,title:"Discuss Q3 Goals",         date:"Sep 13, 14:45",done:false,icon:"🎯"},
  {id:5,title:"HR Policy Review",         date:"Sep 13, 16:00",done:false,icon:"📋"},
  {id:6,title:"Benefits Enrollment",      date:"Sep 14, 10:00",done:false,icon:"🏥"},
  {id:7,title:"Setup Dev Environment",    date:"Sep 15, 09:00",done:false,icon:"⚙️"},
  {id:8,title:"First Code Review",        date:"Sep 16, 14:00",done:false,icon:"👁️"},
];

const INIT_GOALS = [
  {id:1,emp:"Priya Ramesh",obj:"Improve Frontend Performance",pct:72,krs:["Reduce LCP to <2s","Lighthouse score 95","Zero CLS violations"],status:"on-track"},
  {id:2,emp:"Arjun Nair",  obj:"Scale Engineering Team",      pct:45,krs:["Hire 3 senior engineers","Reduce onboarding to 2wks","Establish review SLA"],status:"at-risk"},
  {id:3,emp:"Vikram Singh",obj:"API Reliability 99.9%",       pct:88,krs:["99.9% uptime SLA","P95 latency <200ms","Zero critical incidents"],status:"on-track"},
];

const ATT_WEEK = [
  {d:"S",h:0},{d:"M",h:8.2},{d:"T",h:7.4,late:true},{d:"W",h:9.1},{d:"T",h:8.8},{d:"F",h:6.2},{d:"S",h:0},
];

// ─── ICONS ────────────────────────────────────────────────────────────────────
const IC = ({n,s=16,c="currentColor"}) => {
  const paths = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
    people:    <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    clock:     <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
    calendar:  <><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
    wallet:    <><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/></>,
    target:    <><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></>,
    sparkle:   <><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"/><path d="M19 15l.75 2.25L22 18l-2.25.75L19 21l-.75-2.25L16 18l2.25-.75z"/></>,
    chart:     <><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></>,
    check:     <><polyline points="20 6 9 17 4 12"/></>,
    x:         <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    search:    <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>,
    plus:      <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    bell:      <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></>,
    settings:  <><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></>,
    palette:   <><circle cx="13.5" cy="6.5" r=".5" fill={c}/><circle cx="17.5" cy="10.5" r=".5" fill={c}/><circle cx="8.5" cy="7.5" r=".5" fill={c}/><circle cx="6.5" cy="12.5" r=".5" fill={c}/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></>,
    onboard:   <><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></>,
    trend:     <><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></>,
    chevD:     <><polyline points="6 9 12 15 18 9"/></>,
    chevU:     <><polyline points="18 15 12 9 6 15"/></>,
    chevR:     <><polyline points="9 18 15 12 9 6"/></>,
    user:      <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
    dots:      <><circle cx="5" cy="12" r="1" fill={c}/><circle cx="12" cy="12" r="1" fill={c}/><circle cx="19" cy="12" r="1" fill={c}/></>,
    edit:      <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>,
    trash:     <><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></>,
    arrowNE:   <><path d="M7 17L17 7M7 7h10v10"/></>,
    send:      <><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>,
  };
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c}
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {paths[n]}
    </svg>
  );
};

// ─── ATOMS ────────────────────────────────────────────────────────────────────
const Av = ({init,color,size=34}) => (
  <div style={{width:size,height:size,borderRadius:Math.round(size/3),
    background:color||"#64748b",display:"flex",alignItems:"center",
    justifyContent:"center",color:"#fff",fontWeight:700,flexShrink:0,
    fontSize:Math.round(size*0.34)}}>
    {init}
  </div>
);

const Pill = ({children,color,bg,dot=true,size=10.5}) => (
  <span style={{display:"inline-flex",alignItems:"center",gap:4,
    padding:"3px 9px",borderRadius:20,fontSize:size,fontWeight:600,
    background:bg||color+"18",color}}>
    {dot&&<span style={{width:5,height:5,borderRadius:"50%",background:color,display:"inline-block"}}/>}
    {children}
  </span>
);

const Btn = ({children,onClick,variant="primary",t,small=false,icon,danger=false}) => {
  const bg = danger ? t.danger : variant==="primary" ? t.accent : "transparent";
  const col = variant==="primary"||danger ? "#fff" : t.muted;
  const bdr = variant==="outline" ? `1px solid ${t.border}` : "none";
  return (
    <button onClick={onClick} style={{
      display:"flex",alignItems:"center",gap:6,
      padding: small ? "5px 12px" : "8px 18px",
      borderRadius:999,border:bdr,background:bg,color:col,
      fontSize: small ? 11.5 : 13,fontWeight:600,cursor:"pointer",
      whiteSpace:"nowrap",transition:"opacity 0.15s",
    }}
      onMouseEnter={e=>e.currentTarget.style.opacity="0.85"}
      onMouseLeave={e=>e.currentTarget.style.opacity="1"}
    >
      {icon && <IC n={icon} s={small?12:14} c={col}/>}{children}
    </button>
  );
};

// Card with hover shadow
const Card = ({children,style={}}) => {
  const [hov,setH]=useState(false);
  return (
    <div
      onMouseEnter={()=>setH(true)}
      onMouseLeave={()=>setH(false)}
      style={{
        background:"var(--card)",borderRadius:20,
        border:"1px solid var(--cardBorder)",
        boxShadow:hov?"var(--cardShadowH)":"var(--cardShadow)",
        backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",
        transition:"box-shadow 0.2s",overflow:"hidden",...style,
      }}>
      {children}
    </div>
  );
};

// Modal overlay
const Modal = ({title,onClose,children,width=480}) => (
  <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",
    display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999,
    backdropFilter:"blur(6px)",padding:20}} onClick={onClose}>
    <div style={{background:"var(--card)",borderRadius:20,padding:28,width,maxWidth:"95vw",
      boxShadow:"0 24px 80px rgba(0,0,0,0.2)",border:"1px solid var(--cardBorder)",maxHeight:"90vh",overflowY:"auto"}}
      onClick={e=>e.stopPropagation()}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <h2 style={{fontSize:18,fontWeight:250,color:"var(--ink)",margin:0,letterSpacing:"-0.01em"}}>{title}</h2>
        <button onClick={onClose} style={{width:30,height:30,borderRadius:8,border:"1px solid var(--border)",
          background:"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
          <IC n="x" s={14} c="var(--muted)"/>
        </button>
      </div>
      {children}
    </div>
  </div>
);

// Form field
const Field = ({label,value,onChange,type="text",placeholder,options,required}) => (
  <div style={{marginBottom:14}}>
    <label style={{display:"block",fontSize:11.5,fontWeight:600,color:"var(--muted)",
      textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:5}}>
      {label}{required&&<span style={{color:"var(--danger)",marginLeft:2}}>*</span>}
    </label>
    {options ? (
      <select value={value} onChange={e=>onChange(e.target.value)} style={{
        width:"100%",padding:"9px 12px",borderRadius:10,border:"1px solid var(--border)",
        background:"var(--card)",color:"var(--ink)",fontSize:13,fontFamily:"inherit",outline:"none",
      }}>
        {options.map(o=><option key={o} value={o}>{o}</option>)}
      </select>
    ) : (
      <input type={type} value={value} onChange={e=>onChange(e.target.value)}
        placeholder={placeholder} required={required} style={{
        width:"100%",padding:"9px 12px",borderRadius:10,border:"1px solid var(--border)",
        background:"var(--card)",color:"var(--ink)",fontSize:13,fontFamily:"inherit",outline:"none",
      }}/>
    )}
  </div>
);

// ─── TIME TRACKER ─────────────────────────────────────────────────────────────
const TimeTracker = ({t}) => {
  const [secs,setSecs]=useState(225);
  const [running,setRunning]=useState(false);
  useEffect(()=>{
    if(!running) return;
    const id=setInterval(()=>setSecs(s=>s+1),1000);
    return ()=>clearInterval(id);
  },[running]);
  const mm=String(Math.floor(secs/60)).padStart(2,"0");
  const ss=String(secs%60).padStart(2,"0");
  const W=144,R=54,C=72,circ=2*Math.PI*R;
  const frac=secs>0?Math.min(secs/3600,1):0.73;
  const off=circ*(1-frac);
  return (
    <div style={{padding:"18px 18px 16px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <span style={{fontSize:12,color:"var(--muted)",fontWeight:600}}>Time tracker</span>
        <div style={{width:26,height:26,borderRadius:7,border:"1px solid var(--border)",
          display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",
          background:"var(--surface2)"}}>
          <IC n="arrowNE" s={11} c="var(--muted)"/>
        </div>
      </div>
      <div style={{display:"flex",justifyContent:"center",marginBottom:16}}>
        <div style={{position:"relative",width:W,height:W}}>
          <svg width={W} height={W} viewBox={`0 0 ${W} ${W}`} style={{transform:"rotate(-90deg)"}}>
            <circle cx={C} cy={C} r={R} fill="none" stroke={t.timerDash} strokeWidth="2.5" strokeDasharray="3 5" strokeLinecap="round"/>
            <circle cx={C} cy={C} r={R} fill="none" stroke={t.accent} strokeWidth="7.5"
              strokeDasharray={`${circ}`} strokeDashoffset={`${off}`} strokeLinecap="round"/>
          </svg>
          <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",
            alignItems:"center",justifyContent:"center",gap:3}}>
            <span style={{fontSize:26,fontWeight:300,color:"var(--ink)",letterSpacing:"-0.03em",
              fontVariantNumeric:"tabular-nums",lineHeight:1}}>{mm}:{ss}</span>
            <span style={{fontSize:10,color:"var(--muted)"}}>Work Time</span>
          </div>
        </div>
      </div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",gap:7}}>
          <button onClick={()=>setRunning(true)} style={{width:33,height:33,borderRadius:9,
            border:"1px solid var(--border)",
            background:!running?t.accentLight:"var(--surface2)",
            display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
            <svg width={12} height={12} viewBox="0 0 24 24">
              <polygon points="5 3 19 12 5 21 5 3" fill={!running?t.accent:"var(--muted)"}/>
            </svg>
          </button>
          <button onClick={()=>setRunning(false)} style={{width:33,height:33,borderRadius:9,
            border:"1px solid var(--border)",
            background:running?t.accentLight:"var(--surface2)",
            display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
            <svg width={12} height={12} viewBox="0 0 24 24">
              <rect x="6" y="4" width="4" height="16" fill={running?t.accent:"var(--muted)"}/>
              <rect x="14" y="4" width="4" height="16" fill={running?t.accent:"var(--muted)"}/>
            </svg>
          </button>
        </div>
        <button onClick={()=>{setSecs(0);setRunning(false);}} style={{width:33,height:33,borderRadius:9,
          background:"var(--ink)",border:"none",
          display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
          <IC n="clock" s={15} c="#fff"/>
        </button>
      </div>
    </div>
  );
};

// ─── THEME PICKER ─────────────────────────────────────────────────────────────
const ThemePicker = ({current,onSelect,onClose,t}) => (
  <Modal title="Choose Theme" onClose={onClose} width={500}>
    <p style={{fontSize:13,color:"var(--muted)",marginBottom:20,marginTop:-10}}>Personalise your Human Edge experience</p>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
      {Object.entries(THEMES).map(([k,th])=>(
        <button key={k} onClick={()=>{onSelect(k);onClose();}} style={{
          padding:"14px 16px",borderRadius:14,cursor:"pointer",textAlign:"left",
          border:`2px solid ${current===k?th.accent:t.border}`,
          background:current===k?th.accentLight:"var(--surface2)",
          display:"flex",alignItems:"center",gap:12,
        }}>
          <div style={{width:36,height:36,borderRadius:10,flexShrink:0,
            background:`linear-gradient(135deg,${th.accent},${th.accent2})`,
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>{th.emoji}</div>
          <div style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:700,color:current===k?th.accentText:"var(--ink)"}}>{th.name}</div>
            <div style={{fontSize:10.5,color:"var(--muted)",marginTop:1}}>{k==="midnight"?"Dark mode":"Light"}</div>
          </div>
          {current===k&&<IC n="check" s={14} c={th.accent}/>}
        </button>
      ))}
    </div>
  </Modal>
);

// ─── NAV — correctly mapped ───────────────────────────────────────────────────
// Each label maps exactly to the module that renders it
const NAV = [
  {id:"dashboard",  label:"Dashboard"},
  {id:"people",     label:"People"},
  {id:"hiring",     label:"Hiring"},
  {id:"attendance", label:"Attendance"},
  {id:"leave",      label:"Leave"},
  {id:"payroll",    label:"Salary"},
  {id:"performance",label:"Reviews"},
  {id:"ai",         label:"AI Insights"},
  {id:"reports",    label:"Reports"},
];

const TopNav = ({active,onNav,t,onTheme}) => {
  const [scrolled,setScrolled]=useState(false);
  useEffect(()=>{
    const onScroll=()=>setScrolled(window.scrollY>10);
    onScroll();
    window.addEventListener("scroll",onScroll,{passive:true});
    return()=>window.removeEventListener("scroll",onScroll);
  },[]);
  return (
  <header style={{position:"sticky",top:0,zIndex:200,
    background:"transparent",padding:"12px 32px"}}>
    {/* Stacked gradient blur overlays — progressively stronger blur at the top */}
    {scrolled && [
      {blur:4,  mask:"linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.7) 60%, rgba(0,0,0,0) 100%)"},
      {blur:10, mask:"linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.6) 50%, rgba(0,0,0,0) 90%)"},
      {blur:20, mask:"linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.5) 35%, rgba(0,0,0,0) 75%)"},
      {blur:40, mask:"linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.7) 20%, rgba(0,0,0,0) 55%)"},
    ].map((l,i)=>(
      <div key={i} aria-hidden style={{
        position:"absolute",inset:0,pointerEvents:"none",
        backdropFilter:`blur(${l.blur}px)`,
        WebkitBackdropFilter:`blur(${l.blur}px)`,
        maskImage:l.mask,WebkitMaskImage:l.mask,
      }}/>
    ))}
    <div aria-hidden style={{
      position:"absolute",inset:0,pointerEvents:"none",
      background:scrolled?(t.isDark
        ?"linear-gradient(to bottom, rgba(13,13,31,0.75) 0%, rgba(13,13,31,0.4) 50%, rgba(13,13,31,0) 100%)"
        :"linear-gradient(to bottom, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0.35) 50%, rgba(255,255,255,0) 100%)"):"transparent",
      transition:"background 0.25s",
    }}/>
    <div style={{position:"relative",display:"flex",alignItems:"center",justifyContent:"center",gap:10}}>
      {/* Main pill */}
      <div style={{display:"flex",alignItems:"center",
        background:t.isDark?"rgba(30,30,50,0.7)":"rgba(255,255,255,0.82)",backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",
        borderRadius:999,padding:"5px",
        boxShadow:t.isDark
          ?"0 2px 20px rgba(0,0,0,0.4),0 0 0 1px rgba(255,255,255,0.08)"
          :"0 2px 20px rgba(37,99,235,0.10),0 0 0 1px rgba(255,255,255,0.6)",
        gap:2,overflowX:"auto",scrollbarWidth:"none",maxWidth:"calc(100vw - 200px)"}}>
        {NAV.map(item=>{
          const a=active===item.id;
          return (
            <button key={item.id} onClick={()=>onNav(item.id)} style={{
              padding:a?"7px 18px":"7px 14px",borderRadius:999,border:"none",
              background:a?t.navPill:"transparent",
              color:a?"#fff":t.muted,
              fontSize:13,fontWeight:a?600:400,cursor:"pointer",whiteSpace:"nowrap",
              transition:"all 0.18s",
            }}>
              {item.label}
            </button>
          );
        })}
      </div>
      {/* Settings pill */}
      <div style={{display:"flex",alignItems:"center",
        background:t.isDark?"rgba(30,30,50,0.7)":"rgba(255,255,255,0.82)",backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",
        borderRadius:999,padding:"5px 8px",
        boxShadow:t.isDark
          ?"0 2px 20px rgba(0,0,0,0.4),0 0 0 1px rgba(255,255,255,0.08)"
          :"0 2px 20px rgba(37,99,235,0.10),0 0 0 1px rgba(255,255,255,0.6)",
        gap:4,flexShrink:0}}>
        <button onClick={onTheme} style={{display:"flex",alignItems:"center",gap:5,
          padding:"6px 12px",borderRadius:999,border:"none",background:"transparent",
          color:t.muted,fontSize:12.5,fontWeight:400,cursor:"pointer"}}>
          <IC n="settings" s={13} c={t.muted}/>Setting
        </button>
        <div style={{width:1,height:16,background:t.border}}/>
        <button style={{width:32,height:32,borderRadius:"50%",border:"none",background:"transparent",
          cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
          <IC n="bell" s={15} c={t.muted}/>
        </button>
        <button style={{width:32,height:32,borderRadius:"50%",border:"none",background:"transparent",
          cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
          <IC n="user" s={15} c={t.muted}/>
        </button>
      </div>
    </div>
  </header>
  );
};

// ─── PAGE HEADING ─────────────────────────────────────────────────────────────
const PH = ({title,subtitle,action}) => (
  <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",
    marginBottom:20,flexWrap:"wrap",gap:12}}>
    <div>
      <h1 style={{fontSize:28,fontWeight:250,color:"var(--ink)",letterSpacing:"-0.02em",margin:0}}>{title}</h1>
      {subtitle&&<p style={{fontSize:13,color:"var(--muted)",marginTop:4,fontWeight:300}}>{subtitle}</p>}
    </div>
    {action}
  </div>
);

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
const Dashboard = ({t,onNav}) => {
  const [tasks,setTasks]=useState(INIT_OB_TASKS);
  const [leaves,setLeaves]=useState(INIT_LEAVES);
  const [open,setOpen]=useState({devices:true,pension:false,comp:false,benefits:false});
  const [qaTab,setQaTab]=useState("leave");
  const [qaForm,setQaForm]=useState({type:"Casual",from:"",to:"",reason:""});
  const [qaToast,setQaToast]=useState("");
  const maxH=Math.max(...ATT_WEEK.map(d=>d.h));
  const done=tasks.filter(x=>x.done).length;

  const approve=id=>setLeaves(ls=>ls.map(l=>l.id===id?{...l,status:"approved"}:l));
  const reject=id=>setLeaves(ls=>ls.map(l=>l.id===id?{...l,status:"rejected"}:l));

  const fmt=d=>{ if(!d) return ""; const dt=new Date(d);
    return dt.toLocaleDateString("en-US",{month:"short",day:"numeric"}); };
  const submitQA=()=>{
    if(!qaForm.from||!qaForm.to||!qaForm.reason.trim()){
      setQaToast("Please fill in all fields"); setTimeout(()=>setQaToast(""),2200); return;
    }
    const d1=new Date(qaForm.from), d2=new Date(qaForm.to);
    const days=Math.max(1,Math.round((d2-d1)/86400000)+1);
    setLeaves(ls=>[{id:Date.now(),emp:"Nisha Patel",
      type:qaTab==="wfh"?"WFH":qaForm.type,
      from:fmt(qaForm.from),to:fmt(qaForm.to),days,
      reason:qaForm.reason,status:"pending"},...ls]);
    setQaToast(qaTab==="wfh"?"WFH request submitted":"Leave request submitted");
    setQaForm({type:"Casual",from:"",to:"",reason:""});
    setTimeout(()=>setQaToast(""),2200);
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      <h1 style={{fontSize:36,fontWeight:250,color:"var(--ink)",letterSpacing:"-0.03em",lineHeight:1.1}}>
        Welcome in, Nixtio
      </h1>

      {/* Stats bar */}
      <div style={{display:"flex",alignItems:"center",gap:20,flexWrap:"wrap"}}>
        <div style={{display:"flex",gap:8,flex:1,minWidth:280}}>
          {[{l:"Interviews",v:25},{l:"Hired",v:30},{l:"Project time",v:46}].map(b=>(
            <div key={b.l} style={{display:"flex",flexDirection:"column",gap:4}}>
              <span style={{fontSize:10,color:"var(--muted)",fontWeight:500}}>{b.l}</span>
              <div style={{height:28,borderRadius:14,minWidth:b.l==="Project time"?90:60,
                background:t.accent,display:"flex",alignItems:"center",paddingLeft:10}}>
                <span style={{fontSize:11,fontWeight:700,color:"#fff"}}>{b.v}%</span>
              </div>
            </div>
          ))}
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            <span style={{fontSize:10,color:"var(--muted)",fontWeight:500}}>Output</span>
            <div style={{height:28,borderRadius:14,minWidth:100,
              background:`repeating-linear-gradient(45deg,#e2e8f0,#e2e8f0 3px,#f1f5f9 3px,#f1f5f9 8px)`,
              display:"flex",alignItems:"center",paddingRight:8,justifyContent:"flex-end"}}>
              <span style={{fontSize:11,fontWeight:600,color:"var(--muted)",background:"var(--card)",
                borderRadius:10,padding:"2px 7px"}}>65%</span>
            </div>
          </div>
        </div>
        <div style={{display:"flex",gap:28,marginLeft:"auto"}}>
          {[{i:"👤",v:"92",l:"Employee"},{i:"🔗",v:"75",l:"Hirings"},{i:"📁",v:"315",l:"Projects"}].map(s=>(
            <div key={s.l} style={{textAlign:"right"}}>
              <div style={{fontSize:38,fontWeight:250,color:"var(--ink)",lineHeight:1,letterSpacing:"-0.03em"}}>{s.v}</div>
              <div style={{fontSize:10.5,color:"var(--muted)",marginTop:2}}>{s.i} {s.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Row 2 */}
      <div style={{display:"grid",gridTemplateColumns:"200px 1fr 180px 1fr",gap:10}}>
        {/* Profile */}
        <Card style={{background:"linear-gradient(170deg,#b8d4f8 0%,#c8dffc 60%,#d4e8ff 100%)",
          display:"flex",flexDirection:"column",justifyContent:"flex-end",minHeight:200,position:"relative"}}>
          <img src={profilePhoto} alt="Nisha Patel" style={{
            position:"absolute",top:0,left:0,right:0,bottom:0,
            width:"100%",height:"100%",objectFit:"cover",objectPosition:"top center",
          }}/>
          {/* Bottom blur fading upward */}
          <div aria-hidden style={{
            position:"absolute",left:0,right:0,bottom:0,height:"55%",
            backdropFilter:"blur(14px)",WebkitBackdropFilter:"blur(14px)",
            maskImage:"linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 40%, rgba(0,0,0,0) 100%)",
            WebkitMaskImage:"linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 40%, rgba(0,0,0,0) 100%)",
            pointerEvents:"none",
          }}/>
          {/* Dark gradient overlay bottom→top for text legibility */}
          <div aria-hidden style={{
            position:"absolute",left:0,right:0,bottom:0,height:"60%",
            background:"linear-gradient(to top, rgba(15,30,60,0.7) 0%, rgba(15,30,60,0.35) 50%, rgba(15,30,60,0) 100%)",
            pointerEvents:"none",
          }}/>
          <div style={{position:"relative",padding:"0 16px 16px",zIndex:1}}>
            <div style={{fontSize:16,fontWeight:600,color:"#ffffff",letterSpacing:"-0.01em",textShadow:"0 1px 6px rgba(0,0,0,0.25)"}}>Nisha Patel</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.85)",textShadow:"0 1px 4px rgba(0,0,0,0.25)"}}>HR Business Partner</div>
          </div>
        </Card>

        {/* Progress bar chart */}
        <Card style={{padding:"18px 20px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
            <div>
              <div style={{fontSize:12,color:"var(--muted)",fontWeight:600,marginBottom:2}}>Progress</div>
              <div style={{display:"flex",alignItems:"baseline",gap:6}}>
                <span style={{fontSize:28,fontWeight:300,color:"var(--ink)",letterSpacing:"-0.02em"}}>6.1h</span>
                <span style={{fontSize:11,color:"var(--muted)"}}>Work Time<br/>this week</span>
              </div>
            </div>
            <IC n="arrowNE" s={13} c="var(--muted)"/>
          </div>
          <div style={{display:"flex",alignItems:"flex-end",gap:7,height:90}}>
            {ATT_WEEK.map((d,i)=>{
              const active=i===4;
              return (
                <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                  <div style={{height:20,display:"flex",alignItems:"flex-end"}}>
                    {active&&<span style={{background:t.accent,color:"#fff",fontSize:9,fontWeight:700,
                      padding:"2px 5px",borderRadius:5,whiteSpace:"nowrap"}}>5h 23m</span>}
                  </div>
                  <div style={{width:"100%",
                    height:d.h>0?`${(d.h/maxH)*68}px`:"5px",
                    background:active?t.accent:d.h>0?t.barInactive:"var(--border)",
                    borderRadius:"5px 5px 0 0",transition:"height 0.4s"}}/>
                  <div style={{width:5,height:5,borderRadius:"50%",background:active?t.accent:"var(--border)"}}/>
                  <div style={{fontSize:9.5,color:"var(--muted)"}}>{d.d}</div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Time tracker */}
        <Card style={{padding:0}}><TimeTracker t={t}/></Card>

        {/* Onboarding */}
        <Card style={{padding:"18px 18px 16px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <span style={{fontSize:12,color:"var(--muted)",fontWeight:600}}>Onboarding</span>
            <span style={{fontSize:26,fontWeight:300,color:"var(--ink)",letterSpacing:"-0.02em"}}>42%</span>
          </div>
          <div style={{display:"flex",gap:3,marginBottom:12}}>
            {[{w:42,bg:t.accent,label:"42%"},{w:25,bg:t.darkCard,label:"25%"},{w:33,bg:t.barInactive,label:"0%"}].map((s,i)=>(
              <div key={i} style={{flex:s.w,display:"flex",flexDirection:"column",gap:2}}>
                <div style={{fontSize:8.5,fontWeight:600,color:i<2?"var(--ink)":"var(--muted)"}}>{s.label}</div>
                <div style={{height:22,borderRadius:6,background:s.bg,display:"flex",alignItems:"center",paddingLeft:6}}>
                  {i===0&&<span style={{fontSize:9,fontWeight:600,color:"#fff"}}>Task</span>}
                </div>
              </div>
            ))}
          </div>
          <div style={{background:t.darkCard,borderRadius:14,padding:"12px 14px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:9}}>
              <span style={{fontSize:12,fontWeight:600,color:"rgba(255,255,255,0.65)"}}>Onboarding Task</span>
              <span style={{fontSize:20,fontWeight:300,color:"#fff",letterSpacing:"-0.02em"}}>{done}/{tasks.length}</span>
            </div>
            {tasks.slice(0,5).map(task=>(
              <div key={task.id} style={{display:"flex",alignItems:"center",gap:8,
                padding:"5px 0",borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
                <div style={{width:22,height:22,borderRadius:6,background:"rgba(255,255,255,0.08)",
                  display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,flexShrink:0}}>
                  {task.icon}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:11,fontWeight:500,color:"rgba(255,255,255,0.85)",
                    overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{task.title}</div>
                  <div style={{fontSize:9.5,color:"rgba(255,255,255,0.35)"}}>{task.date}</div>
                </div>
                {task.done&&(
                  <div style={{width:17,height:17,borderRadius:"50%",background:t.accent,flexShrink:0,
                    display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <IC n="check" s={8} c="#fff"/>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Row 3 */}
      <div style={{display:"grid",gridTemplateColumns:"200px 1fr 1fr",gap:10}}>
        {/* Accordion */}
        <div style={{display:"flex",flexDirection:"column",gap:1}}>
          {[
            {key:"pension",label:"Pension contributions",content:null},
            {key:"devices",label:"Devices",content:(
              <div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0"}}>
                <div style={{width:36,height:26,borderRadius:5,background:"var(--surface2)",
                  display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>💻</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,fontWeight:600,color:"var(--ink)"}}>MacBook Air</div>
                  <div style={{fontSize:10,color:"var(--muted)"}}>Version M1</div>
                </div>
                <IC n="dots" s={14} c="var(--muted)"/>
              </div>
            )},
            {key:"comp",label:"Compensation Summary",content:null},
            {key:"benefits",label:"Employee Benefits",content:null},
          ].map((item,i,arr)=>(
            <Card key={item.key} style={{
              borderRadius:i===0?"14px 14px 4px 4px":i===arr.length-1?"4px 4px 14px 14px":"4px",
              overflow:"visible",
            }}>
              <button onClick={()=>setOpen(o=>({...o,[item.key]:!o[item.key]}))} style={{
                width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",
                padding:"12px 14px",background:"transparent",border:"none",cursor:"pointer",
                color:"var(--ink)",fontSize:12.5,fontWeight:500,
              }}>
                {item.label}
                <IC n={open[item.key]?"chevU":"chevD"} s={13} c="var(--muted)"/>
              </button>
              {open[item.key]&&(
                <div style={{padding:"0 14px 12px"}}>
                  {item.content || <div style={{fontSize:11,color:"var(--muted)"}}>No data available.</div>}
                </div>
              )}
            </Card>
          ))}
        </div>

        {/* Quick Actions */}
        <Card style={{padding:"16px 18px",display:"flex",flexDirection:"column",gap:12}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <h3 style={{fontSize:12,color:"var(--muted)",fontWeight:600,margin:0}}>Quick Actions</h3>
          </div>

          {/* Tabs */}
          <div style={{display:"flex",gap:4,padding:4,background:"rgba(255,255,255,0.5)",
            border:"1px solid var(--border)",borderRadius:999}}>
            {[{k:"leave",l:"Apply Leave"},{k:"wfh",l:"Work from Home"}].map(tab=>{
              const a=qaTab===tab.k;
              return (
                <button key={tab.k} onClick={()=>{setQaTab(tab.k);setQaForm({type:"Casual",from:"",to:"",reason:""});}}
                  style={{flex:1,padding:"6px 10px",borderRadius:999,border:"none",cursor:"pointer",
                    background:a?t.navPill:"transparent",color:a?"#fff":"var(--muted)",
                    fontSize:11.5,fontWeight:a?600:500,fontFamily:"inherit",transition:"all 0.18s"}}>
                  {tab.l}
                </button>
              );
            })}
          </div>

          {/* Date range */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {[{k:"from",l:"From"},{k:"to",l:"To"}].map(f=>(
              <div key={f.k} style={{display:"flex",flexDirection:"column",gap:4}}>
                <label style={{fontSize:10,color:"var(--muted)",fontWeight:500,textTransform:"uppercase",letterSpacing:"0.04em"}}>{f.l}</label>
                <input type="date" value={qaForm[f.k]} min={f.k==="to"?qaForm.from||undefined:undefined}
                  onChange={e=>setQaForm(s=>({...s,[f.k]:e.target.value}))}
                  style={{padding:"7px 10px",border:"1px solid var(--border)",borderRadius:10,
                    background:"var(--card)",color:"var(--ink)",fontSize:12,fontFamily:"inherit",outline:"none"}}/>
              </div>
            ))}
          </div>

          {/* Leave type (only on leave tab) */}
          {qaTab==="leave"&&(
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              <label style={{fontSize:10,color:"var(--muted)",fontWeight:500,textTransform:"uppercase",letterSpacing:"0.04em"}}>Leave type</label>
              <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                {["Casual","Sick","Earned","Comp-off"].map(lt=>{
                  const a=qaForm.type===lt;
                  return (
                    <button key={lt} onClick={()=>setQaForm(s=>({...s,type:lt}))}
                      style={{padding:"5px 11px",borderRadius:999,
                        border:`1px solid ${a?t.accent:"var(--border)"}`,
                        background:a?t.accentLight:"transparent",
                        color:a?t.accentText:"var(--muted)",
                        fontSize:11,fontWeight:a?600:500,cursor:"pointer",fontFamily:"inherit",transition:"all 0.18s"}}>
                      {lt}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Reason / Note */}
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            <label style={{fontSize:10,color:"var(--muted)",fontWeight:500,textTransform:"uppercase",letterSpacing:"0.04em"}}>
              {qaTab==="wfh"?"Note":"Reason"}
            </label>
            <textarea value={qaForm.reason} onChange={e=>setQaForm(s=>({...s,reason:e.target.value}))}
              placeholder={qaTab==="wfh"?"e.g. Internet repair at home":"e.g. Family function"}
              rows={2}
              style={{padding:"8px 10px",border:"1px solid var(--border)",borderRadius:10,
                background:"var(--card)",color:"var(--ink)",fontSize:12,fontFamily:"inherit",outline:"none",
                resize:"none"}}/>
          </div>

          {/* Submit */}
          <button onClick={submitQA}
            style={{padding:"9px 14px",borderRadius:999,border:"none",background:t.accent,color:"#fff",
              fontSize:12.5,fontWeight:600,cursor:"pointer",fontFamily:"inherit",
              boxShadow:`0 4px 14px ${t.accent}40`,transition:"transform 0.15s"}}
            onMouseDown={e=>e.currentTarget.style.transform="scale(0.98)"}
            onMouseUp={e=>e.currentTarget.style.transform="scale(1)"}
            onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}>
            {qaTab==="wfh"?"Request WFH":"Apply Leave"}
          </button>

          {qaToast&&(
            <div style={{fontSize:11,color:t.success,fontWeight:600,textAlign:"center",
              background:`${t.success}1a`,padding:"6px 8px",borderRadius:8}}>{qaToast}</div>
          )}
        </Card>

        {/* Leave approvals */}
        <Card style={{padding:"16px 18px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{fontSize:12,color:"var(--muted)",fontWeight:600}}>Pending Approvals</div>
            <Pill color={t.warning}>{leaves.filter(l=>l.status==="pending").length} pending</Pill>
          </div>
          {leaves.map(r=>(
            <div key={r.id} style={{display:"flex",alignItems:"center",gap:9,
              padding:"8px 0",borderBottom:"1px solid var(--border)"}}>
              <Av init={r.emp.split(" ").map(w=>w[0]).join("")} color={t.accent} size={28}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:12,fontWeight:600,color:"var(--ink)"}}>{r.emp}</div>
                <div style={{fontSize:10.5,color:"var(--muted)"}}>{r.type} · {r.from}–{r.to}</div>
              </div>
              {r.status==="pending"?(
                <div style={{display:"flex",gap:4}}>
                  <button onClick={()=>approve(r.id)} style={{padding:"4px 9px",borderRadius:20,border:"none",
                    background:t.success+"22",color:t.success,cursor:"pointer",fontSize:11,fontWeight:700}}>Approve</button>
                  <button onClick={()=>reject(r.id)} style={{padding:"4px 9px",borderRadius:20,border:"none",
                    background:t.danger+"22",color:t.danger,cursor:"pointer",fontSize:11,fontWeight:700}}>Reject</button>
                </div>
              ):(
                <Pill color={r.status==="approved"?t.success:t.danger}>{r.status}</Pill>
              )}
            </div>
          ))}
          <button onClick={()=>onNav("leave")} style={{marginTop:12,width:"100%",padding:"8px",
            borderRadius:10,border:"1px solid var(--border)",background:"transparent",
            color:"var(--muted)",fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
            View all leave requests →
          </button>
        </Card>
      </div>
    </div>
  );
};

// ─── PEOPLE ───────────────────────────────────────────────────────────────────
const OrgNode = ({emp,children,t,onView}) => (
  <div style={{display:"flex",flexDirection:"column",alignItems:"center",position:"relative"}}>
    <div onClick={()=>onView(emp)} style={{
      background:"var(--card)",border:"1px solid var(--cardBorder)",borderRadius:14,
      padding:"12px 14px",minWidth:170,cursor:"pointer",
      boxShadow:"var(--cardShadow)",transition:"transform 0.15s, box-shadow 0.15s",
      display:"flex",alignItems:"center",gap:10}}
      onMouseEnter={e=>e.currentTarget.style.transform="translateY(-2px)"}
      onMouseLeave={e=>e.currentTarget.style.transform="translateY(0)"}>
      <Av init={emp.av} color={emp.col} size={36}/>
      <div style={{minWidth:0}}>
        <div style={{fontSize:12.5,fontWeight:600,color:"var(--ink)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:140}}>{emp.name}</div>
        <div style={{fontSize:10.5,color:"var(--muted)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:140}}>{emp.role}</div>
        <div style={{marginTop:4}}>
          <span style={{fontSize:9.5,fontWeight:600,padding:"2px 7px",borderRadius:999,
            background:t.accentLight,color:t.accentText,letterSpacing:"0.02em"}}>{emp.dept}</span>
        </div>
      </div>
    </div>
    {children&&children.length>0&&(
      <>
        {/* vertical line down from parent */}
        <div style={{width:1,height:18,background:"var(--border)"}}/>
        {/* horizontal connector + children */}
        <div style={{display:"flex",alignItems:"flex-start",gap:24,position:"relative",
          paddingTop:18}}>
          {children.length>1&&(
            <div style={{position:"absolute",top:0,left:"calc(50% / "+children.length+")",
              right:"calc(50% / "+children.length+")",height:1,background:"var(--border)"}}/>
          )}
          {children.map(c=>(
            <div key={c.emp.id} style={{position:"relative",display:"flex",flexDirection:"column",alignItems:"center"}}>
              <div style={{position:"absolute",top:-18,width:1,height:18,background:"var(--border)"}}/>
              <OrgNode emp={c.emp} children={c.children} t={t} onView={onView}/>
            </div>
          ))}
        </div>
      </>
    )}
  </div>
);

const buildTree = (emps) => {
  const byName=Object.fromEntries(emps.map(e=>[e.name,{emp:e,children:[]}]));
  const roots=[];
  emps.forEach(e=>{
    const node=byName[e.name];
    const parent=e.manager&&e.manager!=="—"?byName[e.manager]:null;
    if(parent) parent.children.push(node); else roots.push(node);
  });
  return roots;
};

const People = ({t}) => {
  const [employees,setEmployees]=useState(INIT_EMPLOYEES);
  const [q,setQ]=useState("");
  const [dept,setDept]=useState("All");
  const [view,setView]=useState("list");
  const [showAdd,setShowAdd]=useState(false);
  const [viewEmp,setViewEmp]=useState(null);
  const [form,setForm]=useState({name:"",role:"",dept:"Engineering",manager:"",joined:"",status:"active"});

  const depts=["All",...new Set(employees.map(e=>e.dept))];
  const list=employees.filter(e=>(dept==="All"||e.dept===dept)&&e.name.toLowerCase().includes(q.toLowerCase()));
  const orgRoots=buildTree(employees.filter(e=>dept==="All"||e.dept===dept));

  const addEmp=()=>{
    if(!form.name||!form.role) return;
    const newEmp={...form,id:`E00${employees.length+1}`,
      av:form.name.split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2),
      col:["#7c3aed","#2563eb","#0d9488","#e11d48","#d97706"][Math.floor(Math.random()*5)],
      salary:1200000};
    setEmployees(es=>[...es,newEmp]);
    setForm({name:"",role:"",dept:"Engineering",manager:"",joined:"",status:"active"});
    setShowAdd(false);
  };

  const toggleStatus=id=>setEmployees(es=>es.map(e=>e.id===id?{...e,status:e.status==="active"?"inactive":"active"}:e));

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <PH title="People" subtitle={`${employees.filter(e=>e.status==="active").length} active employees`}
        action={
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <div style={{display:"flex",gap:2,padding:3,background:"var(--card)",
              border:"1px solid var(--border)",borderRadius:999}}>
              {[{k:"list",l:"List"},{k:"org",l:"Org"}].map(v=>{
                const a=view===v.k;
                return (
                  <button key={v.k} onClick={()=>setView(v.k)} style={{
                    padding:"6px 14px",borderRadius:999,border:"none",cursor:"pointer",
                    background:a?t.navPill:"transparent",color:a?"#fff":"var(--muted)",
                    fontSize:12,fontWeight:a?600:500,fontFamily:"inherit",transition:"all 0.18s"}}>
                    {v.l}
                  </button>
                );
              })}
            </div>
            <Btn t={t} icon="plus" onClick={()=>setShowAdd(true)}>Add Employee</Btn>
          </div>
        }/>

      <div style={{display:"flex",gap:9,flexWrap:"wrap"}}>
        {view==="list"&&(
          <div style={{flex:1,minWidth:180,position:"relative"}}>
            <div style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)"}}>
              <IC n="search" s={14} c="var(--muted)"/>
            </div>
            <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search employees..."
              style={{width:"100%",padding:"9px 12px 9px 36px",borderRadius:999,
                border:"1px solid var(--border)",background:"var(--card)",color:"var(--ink)",
                fontSize:13,outline:"none",fontFamily:"inherit"}}/>
          </div>
        )}
        {depts.map(d=>(
          <button key={d} onClick={()=>setDept(d)} style={{padding:"8px 16px",borderRadius:999,
            border:`1px solid ${dept===d?t.accent:"var(--border)"}`,
            background:dept===d?t.accent:"var(--card)",color:dept===d?"#fff":"var(--muted)",
            fontSize:12,fontWeight:600,cursor:"pointer",transition:"all 0.15s"}}>{d}</button>
        ))}
      </div>

      {view==="org"?(
        <Card style={{padding:24,overflowX:"auto"}}>
          {orgRoots.length===0?(
            <div style={{textAlign:"center",padding:40,color:"var(--muted)",fontSize:13}}>
              No employees to display in this department.
            </div>
          ):(
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:32,minWidth:"fit-content",padding:"8px 12px"}}>
              {orgRoots.map(root=>(
                <OrgNode key={root.emp.id} emp={root.emp} children={root.children} t={t} onView={setViewEmp}/>
              ))}
            </div>
          )}
        </Card>
      ):(
      <Card>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead><tr style={{background:"var(--surface2)"}}>
            {["Employee","Role","Department","Manager","Joined","Status","Actions"].map((h,i)=>(
              <th key={i} style={{padding:"11px 16px",textAlign:"left",fontSize:10.5,fontWeight:600,
                color:"var(--muted)",letterSpacing:"0.06em",textTransform:"uppercase",
                borderBottom:"1px solid var(--border)"}}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {list.map(e=>(
              <tr key={e.id} style={{borderBottom:"1px solid var(--border)",cursor:"pointer"}}
                onMouseEnter={ev=>ev.currentTarget.style.background="var(--surface2)"}
                onMouseLeave={ev=>ev.currentTarget.style.background="transparent"}>
                <td style={{padding:"11px 16px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <Av init={e.av} color={e.col} size={32}/>
                    <div>
                      <div style={{fontSize:13,fontWeight:600,color:"var(--ink)"}}>{e.name}</div>
                      <div style={{fontSize:10.5,color:"var(--muted)"}}>{e.id}</div>
                    </div>
                  </div>
                </td>
                <td style={{padding:"11px 16px",fontSize:12.5,color:"var(--ink)"}}>{e.role}</td>
                <td style={{padding:"11px 16px"}}><Pill color={t.accent} bg={t.accentLight}>{e.dept}</Pill></td>
                <td style={{padding:"11px 16px",fontSize:12.5,color:"var(--muted)"}}>{e.manager}</td>
                <td style={{padding:"11px 16px",fontSize:11.5,color:"var(--muted)"}}>{e.joined}</td>
                <td style={{padding:"11px 16px"}}>
                  <Pill color={e.status==="active"?t.success:t.muted}>{e.status}</Pill>
                </td>
                <td style={{padding:"11px 16px"}}>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={()=>setViewEmp(e)} style={{padding:"4px 10px",borderRadius:20,
                      border:"1px solid var(--border)",background:"transparent",color:"var(--muted)",fontSize:11.5,cursor:"pointer"}}>View</button>
                    <button onClick={()=>toggleStatus(e.id)} style={{padding:"4px 10px",borderRadius:20,
                      border:`1px solid ${e.status==="active"?t.danger+"44":t.success+"44"}`,
                      background:"transparent",
                      color:e.status==="active"?t.danger:t.success,fontSize:11.5,cursor:"pointer"}}>
                      {e.status==="active"?"Deactivate":"Activate"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      )}

      {showAdd&&(
        <Modal title="Add Employee" onClose={()=>setShowAdd(false)}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 16px"}}>
            <Field label="Full Name" value={form.name} onChange={v=>setForm(f=>({...f,name:v}))} placeholder="e.g. Jane Smith" required/>
            <Field label="Role" value={form.role} onChange={v=>setForm(f=>({...f,role:v}))} placeholder="e.g. Frontend Engineer" required/>
            <Field label="Department" value={form.dept} onChange={v=>setForm(f=>({...f,dept:v}))}
              options={["Engineering","Design","HR","Analytics","Sales","Marketing"]}/>
            <Field label="Manager" value={form.manager} onChange={v=>setForm(f=>({...f,manager:v}))} placeholder="Manager name"/>
            <Field label="Joining Date" value={form.joined} onChange={v=>setForm(f=>({...f,joined:v}))} type="date"/>
            <Field label="Status" value={form.status} onChange={v=>setForm(f=>({...f,status:v}))}
              options={["active","inactive"]}/>
          </div>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:8}}>
            <Btn t={t} variant="outline" onClick={()=>setShowAdd(false)}>Cancel</Btn>
            <Btn t={t} onClick={addEmp} icon="plus">Add Employee</Btn>
          </div>
        </Modal>
      )}

      {viewEmp&&(
        <Modal title="Employee Profile" onClose={()=>setViewEmp(null)} width={520}>
          <div style={{display:"flex",gap:16,alignItems:"center",marginBottom:20,
            padding:16,background:"var(--surface2)",borderRadius:14}}>
            <Av init={viewEmp.av} color={viewEmp.col} size={56}/>
            <div>
              <div style={{fontSize:18,fontWeight:800,color:"var(--ink)"}}>{viewEmp.name}</div>
              <div style={{fontSize:13,color:"var(--muted)",marginTop:2}}>{viewEmp.role}</div>
              <Pill color={viewEmp.status==="active"?t.success:t.muted} size={11} style={{marginTop:6}}>{viewEmp.status}</Pill>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            {[["Employee ID",viewEmp.id],["Department",viewEmp.dept],["Manager",viewEmp.manager],["Joined",viewEmp.joined],["Annual CTC",`₹${(viewEmp.salary/100000).toFixed(1)}L`],["Status",viewEmp.status]].map(([k,v])=>(
              <div key={k} style={{padding:"10px 12px",background:"var(--surface2)",borderRadius:10}}>
                <div style={{fontSize:10.5,color:"var(--muted)",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:3}}>{k}</div>
                <div style={{fontSize:13,fontWeight:600,color:"var(--ink)"}}>{v}</div>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
};

// ─── HIRING ───────────────────────────────────────────────────────────────────
const Hiring = ({t}) => {
  const [jobs,setJobs]=useState([
    {id:1,role:"Senior React Developer",dept:"Engineering",status:"open",   applicants:24,posted:"Apr 10",urgent:true},
    {id:2,role:"Product Designer",       dept:"Design",     status:"open",   applicants:18,posted:"Apr 12",urgent:false},
    {id:3,role:"DevOps Engineer",        dept:"Engineering",status:"closed", applicants:31,posted:"Mar 28",urgent:false},
    {id:4,role:"Data Scientist",         dept:"Analytics",  status:"open",   applicants:9, posted:"Apr 15",urgent:true},
    {id:5,role:"HR Executive",           dept:"HR",         status:"open",   applicants:15,posted:"Apr 18",urgent:false},
  ]);
  const [showAdd,setShowAdd]=useState(false);
  const [form,setForm]=useState({role:"",dept:"Engineering",urgent:false});

  const addJob=()=>{
    if(!form.role) return;
    setJobs(js=>[...js,{id:Date.now(),role:form.role,dept:form.dept,status:"open",applicants:0,posted:"Apr 20",urgent:form.urgent}]);
    setForm({role:"",dept:"Engineering",urgent:false});
    setShowAdd(false);
  };

  const closeJob=id=>setJobs(js=>js.map(j=>j.id===id?{...j,status:"closed"}:j));

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <PH title="Hiring" subtitle={`${jobs.filter(j=>j.status==="open").length} open positions`}
        action={<Btn t={t} icon="plus" onClick={()=>setShowAdd(true)}>Post Job</Btn>}/>

      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
        {[{l:"Open Positions",v:jobs.filter(j=>j.status==="open").length,c:t.accent},
          {l:"Total Applicants",v:jobs.reduce((s,j)=>s+j.applicants,0),c:t.success},
          {l:"Urgent Roles",v:jobs.filter(j=>j.urgent&&j.status==="open").length,c:t.danger}].map(s=>(
          <Card key={s.l} style={{padding:"18px 20px"}}>
            <div style={{fontSize:10.5,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:5}}>{s.l}</div>
            <div style={{fontSize:32,fontWeight:800,color:s.c,letterSpacing:"-0.03em"}}>{s.v}</div>
          </Card>
        ))}
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {jobs.map(job=>(
          <Card key={job.id} style={{padding:"16px 20px"}}>
            <div style={{display:"flex",alignItems:"center",gap:14}}>
              <div style={{width:44,height:44,borderRadius:12,background:t.accentLight,
                display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <IC n="people" s={20} c={t.accent}/>
              </div>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                  <span style={{fontSize:15,fontWeight:700,color:"var(--ink)"}}>{job.role}</span>
                  {job.urgent&&job.status==="open"&&<Pill color={t.danger} size={10}>Urgent</Pill>}
                </div>
                <div style={{display:"flex",gap:12,alignItems:"center"}}>
                  <Pill color={t.accent} bg={t.accentLight}>{job.dept}</Pill>
                  <span style={{fontSize:11.5,color:"var(--muted)"}}>Posted {job.posted}</span>
                  <span style={{fontSize:11.5,color:"var(--muted)"}}>👥 {job.applicants} applicants</span>
                </div>
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <Pill color={job.status==="open"?t.success:t.muted}>{job.status}</Pill>
                {job.status==="open"&&(
                  <button onClick={()=>closeJob(job.id)} style={{padding:"5px 12px",borderRadius:20,
                    border:`1px solid ${t.danger+"44"}`,background:"transparent",
                    color:t.danger,fontSize:11.5,cursor:"pointer",fontFamily:"inherit"}}>Close</button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {showAdd&&(
        <Modal title="Post New Job" onClose={()=>setShowAdd(false)}>
          <Field label="Job Title" value={form.role} onChange={v=>setForm(f=>({...f,role:v}))} placeholder="e.g. Senior React Developer" required/>
          <Field label="Department" value={form.dept} onChange={v=>setForm(f=>({...f,dept:v}))}
            options={["Engineering","Design","HR","Analytics","Sales","Marketing"]}/>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16,padding:"10px 12px",background:"var(--surface2)",borderRadius:10}}>
            <input type="checkbox" id="urgent" checked={form.urgent} onChange={e=>setForm(f=>({...f,urgent:e.target.checked}))}
              style={{width:16,height:16,accentColor:t.danger,cursor:"pointer"}}/>
            <label htmlFor="urgent" style={{fontSize:13,color:"var(--ink)",cursor:"pointer",fontWeight:500}}>Mark as urgent hiring</label>
          </div>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
            <Btn t={t} variant="outline" onClick={()=>setShowAdd(false)}>Cancel</Btn>
            <Btn t={t} onClick={addJob} icon="send">Post Job</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ─── ATTENDANCE ───────────────────────────────────────────────────────────────
const Attendance = ({t}) => {
  const [checked,setCk]=useState(true);
  const [secs,setSecs]=useState(27540);
  const [note,setNote]=useState("");
  useEffect(()=>{
    if(!checked) return;
    const id=setInterval(()=>setSecs(s=>s+1),1000);
    return ()=>clearInterval(id);
  },[checked]);
  const fmt=s=>`${String(Math.floor(s/3600)).padStart(2,"0")}:${String(Math.floor((s%3600)/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
  const maxH=Math.max(...ATT_WEEK.map(d=>d.h));

  const teamData=INIT_EMPLOYEES.slice(0,6).map((e,i)=>({
    ...e,
    ci:["9:02","9:45","8:58","10:12","9:00","9:30"][i],
    co:[null,null,null,null,"6:30 PM","6:45 PM"][i],
    hrs:[7.2,5.8,8.1,3.5,9.5,6.9][i],
  }));

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <PH title="Attendance" subtitle="Daily check-ins, hours worked, and late arrivals."/>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14}}>
        <Card style={{padding:22,background:`linear-gradient(135deg,${t.accentLight},var(--card))`}}>
          <div style={{fontSize:10.5,fontWeight:600,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:7}}>My Time Today</div>
          <div style={{fontSize:36,fontWeight:800,color:"var(--ink)",letterSpacing:"-0.03em",fontVariantNumeric:"tabular-nums"}}>{fmt(secs)}</div>
          <div style={{fontSize:11.5,color:"var(--muted)",marginBottom:14}}>Check-in at 9:05 AM</div>
          <button onClick={()=>{setCk(c=>!c); if(!checked) setSecs(0);}} style={{
            padding:"9px 18px",borderRadius:999,border:"none",
            background:checked?t.danger:t.success,color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer"}}>
            {checked?"Check Out":"Check In"}
          </button>
          {note&&<div style={{marginTop:8,fontSize:11,color:"var(--muted)",padding:"6px 10px",background:"var(--surface2)",borderRadius:8}}>{note}</div>}
        </Card>

        <Card style={{padding:"18px 20px"}}>
          <div style={{fontSize:10.5,fontWeight:600,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:12}}>This Week</div>
          <div style={{display:"flex",alignItems:"flex-end",gap:8,height:100}}>
            {ATT_WEEK.map((d,i)=>(
              <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                <div style={{width:"100%",height:d.h>0?`${(d.h/maxH)*82}px`:"5px",
                  background:d.late?t.warning:d.h>0?t.accent:t.barInactive,borderRadius:"5px 5px 0 0"}}/>
                <div style={{width:4,height:4,borderRadius:"50%",background:d.h>0?t.accent:"var(--border)"}}/>
                <div style={{fontSize:9.5,color:"var(--muted)"}}>{d.d}</div>
              </div>
            ))}
          </div>
        </Card>

        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <Card style={{padding:16}}>
            <div style={{fontSize:10.5,color:"var(--muted)",marginBottom:4}}>Present Today</div>
            <div style={{fontSize:28,fontWeight:800,color:t.success,letterSpacing:"-0.02em"}}>84</div>
            <div style={{fontSize:10.5,color:"var(--muted)"}}>of 92 · 91.3%</div>
          </Card>
          <Card style={{padding:16}}>
            <div style={{fontSize:10.5,color:"var(--muted)",marginBottom:4}}>Late Arrivals</div>
            <div style={{fontSize:28,fontWeight:800,color:t.warning,letterSpacing:"-0.02em"}}>5</div>
            <div style={{fontSize:10.5,color:"var(--muted)"}}>⚠️ 2 recurring this week</div>
          </Card>
        </div>
      </div>

      <Card>
        <div style={{padding:"13px 18px",borderBottom:"1px solid var(--border)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{fontSize:14,fontWeight:700,color:"var(--ink)"}}>Team Attendance — Today</div>
          <button style={{padding:"5px 14px",borderRadius:999,border:"1px solid var(--border)",
            background:"transparent",color:"var(--muted)",fontSize:11.5,cursor:"pointer",fontFamily:"inherit"}}>Export CSV</button>
        </div>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead><tr style={{background:"var(--surface2)"}}>
            {["Employee","Check In","Check Out","Hours","Status"].map((h,i)=>(
              <th key={i} style={{padding:"9px 16px",textAlign:"left",fontSize:10.5,fontWeight:600,
                color:"var(--muted)",letterSpacing:"0.06em",textTransform:"uppercase",borderBottom:"1px solid var(--border)"}}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {teamData.map(e=>{
              const late=["9:45","10:12"].includes(e.ci);
              return (
                <tr key={e.id} style={{borderBottom:"1px solid var(--border)"}}
                  onMouseEnter={ev=>ev.currentTarget.style.background="var(--surface2)"}
                  onMouseLeave={ev=>ev.currentTarget.style.background="transparent"}>
                  <td style={{padding:"10px 16px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <Av init={e.av} color={e.col} size={26}/>
                      <span style={{fontSize:12.5,fontWeight:500,color:"var(--ink)"}}>{e.name}</span>
                    </div>
                  </td>
                  <td style={{padding:"10px 16px",fontSize:12.5,color:late?t.warning:"var(--ink)"}}>{e.ci} AM{late?" ⚠️":""}</td>
                  <td style={{padding:"10px 16px",fontSize:12.5,color:"var(--muted)"}}>{e.co||"—"}</td>
                  <td style={{padding:"10px 16px",fontSize:12.5,color:"var(--ink)"}}>{e.hrs}h</td>
                  <td style={{padding:"10px 16px"}}>
                    <Pill color={late?t.warning:t.success}>{late?"Late":"On Time"}</Pill>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
};

// ─── LEAVE ────────────────────────────────────────────────────────────────────
const Leave = ({t}) => {
  const [leaves,setLeaves]=useState(INIT_LEAVES);
  const [showApply,setShowApply]=useState(false);
  const [form,setForm]=useState({type:"Casual",from:"",to:"",reason:""});

  const approve=id=>setLeaves(ls=>ls.map(l=>l.id===id?{...l,status:"approved"}:l));
  const reject=id=>setLeaves(ls=>ls.map(l=>l.id===id?{...l,status:"rejected"}:l));

  const applyLeave=()=>{
    if(!form.from||!form.to) return;
    const days=Math.max(1,Math.ceil((new Date(form.to)-new Date(form.from))/(1000*60*60*24))+1);
    setLeaves(ls=>[...ls,{id:Date.now(),emp:"Nisha Patel",type:form.type,
      from:form.from,to:form.to,days,reason:form.reason,status:"pending"}]);
    setForm({type:"Casual",from:"",to:"",reason:""});
    setShowApply(false);
  };

  const bals=[
    {type:"Casual",used:3,total:12,c:t.accent},
    {type:"Sick",used:1,total:12,c:t.danger},
    {type:"Earned",used:8,total:21,c:t.success},
    {type:"Comp-off",used:0,total:2,c:t.warning},
    {type:"WFH",used:5,total:24,c:t.accent2||t.accent},
  ];

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <PH title="Leave Management" subtitle="Balances, requests and approvals."
        action={<Btn t={t} icon="plus" onClick={()=>setShowApply(true)}>Apply Leave</Btn>}/>

      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10}}>
        {bals.map(b=>(
          <Card key={b.type} style={{padding:"14px 16px",textAlign:"center"}}>
            <div style={{fontSize:26,fontWeight:800,color:b.c,letterSpacing:"-0.02em"}}>{b.total-b.used}</div>
            <div style={{fontSize:11,fontWeight:600,color:"var(--ink)",marginTop:3}}>{b.type}</div>
            <div style={{fontSize:10,color:"var(--muted)",marginTop:2}}>days remaining</div>
            <div style={{height:4,background:"var(--border)",borderRadius:3,overflow:"hidden",marginTop:8}}>
              <div style={{height:"100%",width:`${(b.used/b.total)*100}%`,background:b.c,borderRadius:3}}/>
            </div>
          </Card>
        ))}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
        <Card style={{padding:"18px 20px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{fontSize:14,fontWeight:700,color:"var(--ink)"}}>All Requests</div>
            <Pill color={t.warning}>{leaves.filter(l=>l.status==="pending").length} pending</Pill>
          </div>
          {leaves.map(r=>(
            <div key={r.id} style={{display:"flex",alignItems:"center",gap:9,
              padding:"9px 0",borderBottom:"1px solid var(--border)"}}>
              <Av init={r.emp.split(" ").map(w=>w[0]).join("")} color={t.accent} size={30}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:12,fontWeight:600,color:"var(--ink)"}}>{r.emp}</div>
                <div style={{fontSize:10.5,color:"var(--muted)"}}>{r.type} · {r.from}–{r.to} · {r.days}d · "{r.reason}"</div>
              </div>
              {r.status==="pending"?(
                <div style={{display:"flex",gap:4}}>
                  <button onClick={()=>approve(r.id)} style={{padding:"4px 9px",borderRadius:20,border:"none",
                    background:t.success+"22",color:t.success,cursor:"pointer",fontSize:11,fontWeight:700}}>Approve</button>
                  <button onClick={()=>reject(r.id)} style={{padding:"4px 9px",borderRadius:20,border:"none",
                    background:t.danger+"22",color:t.danger,cursor:"pointer",fontSize:11,fontWeight:700}}>Reject</button>
                </div>
              ):<Pill color={r.status==="approved"?t.success:t.danger}>{r.status}</Pill>}
            </div>
          ))}
        </Card>

        <Card style={{padding:"18px 20px"}}>
          <div style={{fontSize:14,fontWeight:700,color:"var(--ink)",marginBottom:14}}>Balance Details</div>
          {bals.map(b=>(
            <div key={b.type} style={{marginBottom:13}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                <span style={{fontSize:12.5,fontWeight:500,color:"var(--ink)"}}>{b.type} Leave</span>
                <span style={{fontSize:11.5,color:"var(--muted)"}}>{b.used}/{b.total} used</span>
              </div>
              <div style={{height:6,background:"var(--border)",borderRadius:3,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${(b.used/b.total)*100}%`,background:b.c,borderRadius:3}}/>
              </div>
            </div>
          ))}
        </Card>
      </div>

      {showApply&&(
        <Modal title="Apply for Leave" onClose={()=>setShowApply(false)}>
          <Field label="Leave Type" value={form.type} onChange={v=>setForm(f=>({...f,type:v}))}
            options={["Casual","Sick","Earned","Comp-off","WFH"]}/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 16px"}}>
            <Field label="From Date" value={form.from} onChange={v=>setForm(f=>({...f,from:v}))} type="date" required/>
            <Field label="To Date" value={form.to} onChange={v=>setForm(f=>({...f,to:v}))} type="date" required/>
          </div>
          <Field label="Reason" value={form.reason} onChange={v=>setForm(f=>({...f,reason:v}))} placeholder="Brief reason for leave"/>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:8}}>
            <Btn t={t} variant="outline" onClick={()=>setShowApply(false)}>Cancel</Btn>
            <Btn t={t} onClick={applyLeave} icon="send">Submit Request</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ─── SALARY (PAYROLL) ─────────────────────────────────────────────────────────
const Salary = ({t}) => {
  const breakdown=[
    {l:"Basic Salary",v:"₹8,00,000",d:false},{l:"HRA",v:"₹2,40,000",d:false},
    {l:"Transport Allowance",v:"₹40,000",d:false},{l:"Special Allowance",v:"₹3,20,000",d:false},
    {l:"Provident Fund",v:"−₹96,000",d:true},{l:"TDS",v:"−₹1,28,000",d:true},
    {l:"Professional Tax",v:"−₹2,500",d:true},
  ];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <PH title="Salary" subtitle="Salary structure, deductions and monthly summary."
        action={<Btn t={t} icon="chart" variant="outline">Export</Btn>}/>
      <div style={{display:"grid",gridTemplateColumns:"1.3fr 1fr",gap:14}}>
        <Card style={{background:t.darkCard,padding:24}}>
          <div style={{fontSize:10.5,fontWeight:600,color:"rgba(255,255,255,0.4)",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:7}}>Net Salary · April 2026</div>
          <div style={{fontSize:40,fontWeight:800,color:"#fff",letterSpacing:"-0.03em",marginBottom:3}}>₹11,73,500</div>
          <div style={{fontSize:12,color:"rgba(255,255,255,0.4)",marginBottom:18}}>Gross ₹14,00,000 · Deductions ₹2,26,500</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
            {[{l:"Gross CTC",v:"₹16,00,000"},{l:"Annual Take-home",v:"₹14,08,200"},{l:"TDS (FY)",v:"₹1,28,000"},{l:"PF Contribution",v:"₹96,000"}].map(s=>(
              <div key={s.l} style={{background:"rgba(255,255,255,0.07)",borderRadius:10,padding:"10px 12px"}}>
                <div style={{fontSize:9.5,color:"rgba(255,255,255,0.38)",marginBottom:3}}>{s.l}</div>
                <div style={{fontSize:14,fontWeight:700,color:"#fff"}}>{s.v}</div>
              </div>
            ))}
          </div>
        </Card>
        <Card style={{padding:"18px 20px"}}>
          <div style={{fontSize:14,fontWeight:700,color:"var(--ink)",marginBottom:12}}>Breakdown</div>
          {breakdown.map(b=>(
            <div key={b.l} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid var(--border)"}}>
              <span style={{fontSize:12.5,color:"var(--ink)"}}>{b.l}</span>
              <span style={{fontSize:12.5,fontWeight:600,color:b.d?t.danger:t.success}}>{b.v}</span>
            </div>
          ))}
        </Card>
      </div>
      <Card>
        <div style={{padding:"13px 18px",borderBottom:"1px solid var(--border)"}}>
          <div style={{fontSize:14,fontWeight:700,color:"var(--ink)"}}>Team Payroll — April 2026</div>
        </div>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead><tr style={{background:"var(--surface2)"}}>
            {["Employee","Gross","Deductions","Net Pay","Status"].map((h,i)=>(
              <th key={i} style={{padding:"9px 16px",textAlign:"left",fontSize:10.5,fontWeight:600,
                color:"var(--muted)",letterSpacing:"0.06em",textTransform:"uppercase",borderBottom:"1px solid var(--border)"}}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {INIT_EMPLOYEES.slice(0,6).map(e=>{
              const g=e.salary; const d=Math.round(g*0.16); const n=g-d;
              const f=v=>"₹"+(v/100000).toFixed(1)+"L";
              return (
                <tr key={e.id} style={{borderBottom:"1px solid var(--border)"}}
                  onMouseEnter={ev=>ev.currentTarget.style.background="var(--surface2)"}
                  onMouseLeave={ev=>ev.currentTarget.style.background="transparent"}>
                  <td style={{padding:"10px 16px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <Av init={e.av} color={e.col} size={26}/>
                      <span style={{fontSize:12.5,fontWeight:500,color:"var(--ink)"}}>{e.name}</span>
                    </div>
                  </td>
                  <td style={{padding:"10px 16px",fontSize:12.5,color:"var(--ink)"}}>{f(g/12)}</td>
                  <td style={{padding:"10px 16px",fontSize:12.5,color:t.danger}}>−{f(d/12)}</td>
                  <td style={{padding:"10px 16px",fontSize:12.5,fontWeight:700,color:t.success}}>{f(n/12)}</td>
                  <td style={{padding:"10px 16px"}}><Pill color={t.success}>Processed</Pill></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
};

// ─── REVIEWS (PERFORMANCE) ────────────────────────────────────────────────────
const Reviews = ({t}) => {
  const [goals,setGoals]=useState(INIT_GOALS);
  const [showAdd,setShowAdd]=useState(false);
  const [form,setForm]=useState({emp:"",obj:"",pct:0});

  const addGoal=()=>{
    if(!form.obj||!form.emp) return;
    setGoals(gs=>[...gs,{id:Date.now(),emp:form.emp,obj:form.obj,pct:Number(form.pct),krs:[],status:"on-track"}]);
    setForm({emp:"",obj:"",pct:0});
    setShowAdd(false);
  };

  const updatePct=(id,delta)=>setGoals(gs=>gs.map(g=>g.id===id?{...g,pct:Math.min(100,Math.max(0,g.pct+delta))}:g));

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <PH title="Reviews" subtitle="OKR goals, review cycles and performance feedback."
        action={<Btn t={t} icon="plus" onClick={()=>setShowAdd(true)}>New Goal</Btn>}/>

      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
        {[{l:"Review Cycle",v:"Q2 2026",sub:"Ends Jun 30",c:t.accent},{l:"Pending Reviews",v:"12",sub:"4 overdue",c:t.warning},{l:"Avg Rating",v:"4.1/5",sub:"↑ 0.3 from Q1",c:t.success}].map(s=>(
          <Card key={s.l} style={{padding:"16px 18px"}}>
            <div style={{fontSize:10.5,color:"var(--muted)",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:5}}>{s.l}</div>
            <div style={{fontSize:24,fontWeight:800,color:s.c,letterSpacing:"-0.02em"}}>{s.v}</div>
            <div style={{fontSize:10.5,color:"var(--muted)",marginTop:3}}>{s.sub}</div>
          </Card>
        ))}
      </div>

      {goals.map(g=>(
        <Card key={g.id} style={{padding:"18px 20px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
            <div>
              <div style={{fontSize:15,fontWeight:700,color:"var(--ink)",letterSpacing:"-0.01em"}}>{g.obj}</div>
              <div style={{fontSize:12,color:"var(--muted)",marginTop:2}}>{g.emp}</div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <Pill color={g.status==="on-track"?t.success:t.warning}>{g.status}</Pill>
              <span style={{fontSize:18,fontWeight:800,color:"var(--ink)",letterSpacing:"-0.02em"}}>{g.pct}%</span>
              <div style={{display:"flex",gap:4}}>
                <button onClick={()=>updatePct(g.id,-5)} style={{width:24,height:24,borderRadius:6,border:"1px solid var(--border)",background:"transparent",cursor:"pointer",fontSize:14,color:"var(--muted)"}}>−</button>
                <button onClick={()=>updatePct(g.id,5)} style={{width:24,height:24,borderRadius:6,border:"1px solid var(--border)",background:t.accentLight,cursor:"pointer",fontSize:14,color:t.accent}}>+</button>
              </div>
            </div>
          </div>
          <div style={{height:6,background:"var(--border)",borderRadius:3,marginBottom:12,overflow:"hidden"}}>
            <div style={{height:"100%",width:`${g.pct}%`,background:g.status==="on-track"?t.accent:t.warning,borderRadius:3,transition:"width 0.4s"}}/>
          </div>
          {g.krs.length>0&&(
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {g.krs.map((kr,i)=>(
                <div key={i} style={{padding:"3px 10px",background:"var(--surface2)",border:"1px solid var(--border)",borderRadius:20,fontSize:11,color:"var(--muted)"}}>🎯 {kr}</div>
              ))}
            </div>
          )}
        </Card>
      ))}

      {showAdd&&(
        <Modal title="Add New Goal" onClose={()=>setShowAdd(false)}>
          <Field label="Employee Name" value={form.emp} onChange={v=>setForm(f=>({...f,emp:v}))}
            options={["",  ...INIT_EMPLOYEES.map(e=>e.name)]}/>
          <Field label="Objective" value={form.obj} onChange={v=>setForm(f=>({...f,obj:v}))} placeholder="e.g. Improve API performance by 30%" required/>
          <Field label="Starting Progress %" value={String(form.pct)} onChange={v=>setForm(f=>({...f,pct:v}))} type="number" placeholder="0"/>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:8}}>
            <Btn t={t} variant="outline" onClick={()=>setShowAdd(false)}>Cancel</Btn>
            <Btn t={t} onClick={addGoal} icon="plus">Add Goal</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ─── AI INSIGHTS ──────────────────────────────────────────────────────────────
const AIInsights = ({t}) => {
  const [q,setQ]=useState("");
  const [msgs,setMsgs]=useState([{role:"ai",text:"Hi! I'm your HR AI assistant. Ask me anything about your team — leave schedules, attendance anomalies, performance trends, or headcount."}]);
  const [loading,setL]=useState(false);
  const endRef=useRef(null);

  const CANNED={
    "leave next week":"Next week **3 employees** are on approved leave:\n• Priya Ramesh — Earned Leave (Apr 28–May 2)\n• Rohan Mehta — Casual Leave (Apr 22–23)\n• Nisha Patel — WFH (Apr 24–25)\n\n⚠️ Engineering drops to 4/6 on Apr 28. Consider reviewing sprint commitments.",
    "anomal":"**2 attendance anomalies** detected this week:\n1. Vikram Singh — check-in shifted from avg 9:05 AM to 11:30 AM over 3 weeks. Consider a 1:1.\n2. Aditya Rao — missed check-out 4 times in the last 2 weeks. Auto-logged at midnight.",
    "attrition":"High-risk employees flagged:\n1. Aditya Rao — 🔴 High risk (low engagement, below-average attendance, declining performance)\n2. Rohan Mehta — 🟡 Medium risk (extended leave, slower KR progress this quarter)\n\nRecommendation: Schedule 1:1s with both this week.",
    "headcount":"Current headcount: **92 active employees** across 5 departments.\n• Engineering: 38\n• Design: 14\n• HR: 8\n• Analytics: 12\n• Sales & Marketing: 20\n\nYTD growth: +14 employees (+17.9%)",
    "who is on leave":"Today **7 employees** are on leave:\n• Priya Ramesh — Earned\n• Rohan Mehta — Casual\n• 5 others on WFH\n\nThis is within the acceptable team coverage threshold.",
  };

  const ask=()=>{
    if(!q.trim()) return;
    const qt=q.trim(); setQ("");
    setMsgs(m=>[...m,{role:"user",text:qt}]); setL(true);
    setTimeout(()=>{
      const k=Object.keys(CANNED).find(k=>qt.toLowerCase().includes(k.split(" ")[0]));
      setMsgs(m=>[...m,{role:"ai",text:k?CANNED[k]:`Searching HRMS data for "${qt}"... I found relevant records across 3 departments. Would you like me to generate a detailed report or filter by team?`}]);
      setL(false);
    },1200);
  };

  useEffect(()=>endRef.current?.scrollIntoView({behavior:"smooth"}),[msgs]);

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <PH title="AI Insights" subtitle="Natural language queries, anomaly detection, and smart recommendations."/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 260px",gap:14}}>
        <Card style={{display:"flex",flexDirection:"column",height:520,padding:0}}>
          <div style={{padding:"14px 18px",borderBottom:"1px solid var(--border)",
            display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:30,height:30,borderRadius:9,
              background:`linear-gradient(135deg,${t.accent},${t.accent2||t.accent})`,
              display:"flex",alignItems:"center",justifyContent:"center",fontSize:15}}>✨</div>
            <div>
              <div style={{fontSize:13,fontWeight:700,color:"var(--ink)"}}>HR AI Assistant</div>
              <div style={{fontSize:10.5,color:t.success}}>● Active · Powered by Claude</div>
            </div>
          </div>
          <div style={{flex:1,overflowY:"auto",padding:"14px 18px",display:"flex",flexDirection:"column",gap:10}}>
            {msgs.map((m,i)=>(
              <div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start"}}>
                <div style={{maxWidth:"80%",padding:"10px 14px",
                  borderRadius:m.role==="user"?"16px 16px 4px 16px":"16px 16px 16px 4px",
                  background:m.role==="user"?t.accent:"var(--surface2)",
                  color:m.role==="user"?"#fff":"var(--ink)",
                  fontSize:12.5,lineHeight:1.6,
                  border:m.role!=="user"?"1px solid var(--border)":"none"}}>
                  {m.text.split("\n").map((l,j)=>(
                    <div key={j} style={{marginBottom:j<m.text.split("\n").length-1?2:0}}>{l}</div>
                  ))}
                </div>
              </div>
            ))}
            {loading&&(
              <div style={{display:"flex",gap:5,padding:"10px 14px",background:"var(--surface2)",
                borderRadius:"0 14px 14px 14px",width:"fit-content",border:"1px solid var(--border)"}}>
                {[0,1,2].map(i=>(
                  <div key={i} style={{width:7,height:7,borderRadius:"50%",background:t.accent,
                    animation:"bounce 1s infinite",animationDelay:`${i*0.18}s`,opacity:0.7}}/>
                ))}
              </div>
            )}
            <div ref={endRef}/>
          </div>
          <div style={{padding:"10px 14px",borderTop:"1px solid var(--border)"}}>
            <div style={{display:"flex",gap:6,marginBottom:7,flexWrap:"wrap"}}>
              {["Who's on leave next week?","Attendance anomalies","Attrition risk","Headcount"].map(s=>(
                <button key={s} onClick={()=>setQ(s)} style={{padding:"3px 9px",borderRadius:20,
                  border:"1px solid var(--border)",background:"var(--surface2)",
                  color:"var(--muted)",fontSize:10.5,cursor:"pointer",whiteSpace:"nowrap",fontFamily:"inherit"}}>
                  {s}
                </button>
              ))}
            </div>
            <div style={{display:"flex",gap:7}}>
              <input value={q} onChange={e=>setQ(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&ask()}
                placeholder="Ask anything about your team..."
                style={{flex:1,padding:"9px 14px",borderRadius:999,
                  border:"1px solid var(--border)",background:"var(--surface2)",
                  color:"var(--ink)",fontSize:12.5,outline:"none",fontFamily:"inherit"}}/>
              <button onClick={ask} style={{padding:"9px 18px",borderRadius:999,
                background:t.accent,border:"none",color:"#fff",
                fontSize:12.5,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Ask</button>
            </div>
          </div>
        </Card>

        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div style={{fontSize:13,fontWeight:700,color:"var(--ink)"}}>Live Alerts</div>
          {[
            {i:"⚠️",title:"Late Arrival Pattern",desc:"Vikram Singh: 3-week trend of late check-ins.",c:t.warning},
            {i:"🔴",title:"Attrition Risk",desc:"Aditya Rao flagged as high risk based on engagement signals.",c:t.danger},
            {i:"✅",title:"Leave Coverage OK",desc:"All teams maintain ≥60% coverage next 2 weeks.",c:t.success},
            {i:"📊",title:"Review Reminder",desc:"12 managers have pending Q2 reviews. Deadline: Jun 30.",c:t.accent},
            {i:"🎯",title:"Goal Behind",desc:"Arjun Nair's OKR at 45% — below 60% target for this week.",c:t.warning},
          ].map((ins,i)=>(
            <Card key={i} style={{padding:14,borderLeft:`3px solid ${ins.c}`,borderRadius:"0 14px 14px 0"}}>
              <div style={{display:"flex",gap:8,alignItems:"flex-start"}}>
                <span style={{fontSize:15}}>{ins.i}</span>
                <div>
                  <div style={{fontSize:12,fontWeight:700,color:"var(--ink)",marginBottom:2}}>{ins.title}</div>
                  <div style={{fontSize:11,color:"var(--muted)",lineHeight:1.5}}>{ins.desc}</div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
      <style>{`@keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}`}</style>
    </div>
  );
};

// ─── REPORTS ──────────────────────────────────────────────────────────────────
const Reports = ({t}) => {
  const months=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const hc=[78,80,82,83,85,86,87,88,89,90,91,92];
  const exits=[2,1,3,1,2,1,0,2,1,2,1,2];
  const maxHC=Math.max(...hc);
  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <PH title="Reports & Analytics" subtitle="Headcount, attrition, attendance and leave utilisation."
        action={<Btn t={t} icon="chart">Download Report</Btn>}/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
        <Card style={{padding:"18px 20px"}}>
          <div style={{fontSize:14,fontWeight:700,color:"var(--ink)",marginBottom:12}}>Headcount Trend — 2025</div>
          <div style={{display:"flex",alignItems:"flex-end",gap:4,height:110}}>
            {hc.map((v,i)=>(
              <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                <div style={{width:"100%",height:`${(v/maxHC)*92}px`,
                  background:i===11?t.accent:t.barInactive,borderRadius:"4px 4px 0 0"}}/>
                <div style={{fontSize:8.5,color:"var(--muted)",whiteSpace:"nowrap"}}>{months[i].slice(0,1)}</div>
              </div>
            ))}
          </div>
        </Card>
        <Card style={{padding:"18px 20px"}}>
          <div style={{fontSize:14,fontWeight:700,color:"var(--ink)",marginBottom:4}}>Monthly Exits — 2025</div>
          <div style={{fontSize:11,color:"var(--muted)",marginBottom:12}}>Total: {exits.reduce((a,b)=>a+b,0)} exits</div>
          <div style={{display:"flex",alignItems:"flex-end",gap:4,height:80}}>
            {exits.map((v,i)=>(
              <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                <div style={{width:"100%",height:v>0?`${(v/3)*64}px`:"4px",
                  background:v>=3?t.danger:v>=2?t.warning:t.success,borderRadius:"3px 3px 0 0"}}/>
                <div style={{fontSize:8.5,color:"var(--muted)"}}>{months[i].slice(0,1)}</div>
              </div>
            ))}
          </div>
        </Card>
        <Card style={{padding:"18px 20px"}}>
          <div style={{fontSize:14,fontWeight:700,color:"var(--ink)",marginBottom:12}}>Dept-wise Attendance %</div>
          {[["Engineering",92],["Design",88],["HR",96],["Analytics",78],["Sales",85]].map(([d,p])=>(
            <div key={d} style={{marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                <span style={{fontSize:12.5,color:"var(--ink)"}}>{d}</span>
                <span style={{fontSize:12,fontWeight:700,color:p>=90?t.success:p>=85?t.warning:t.danger}}>{p}%</span>
              </div>
              <div style={{height:5,background:"var(--border)",borderRadius:3,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${p}%`,background:p>=90?t.success:p>=85?t.warning:t.danger,borderRadius:3}}/>
              </div>
            </div>
          ))}
        </Card>
        <Card style={{padding:"18px 20px"}}>
          <div style={{fontSize:14,fontWeight:700,color:"var(--ink)",marginBottom:12}}>Leave Utilisation — YTD</div>
          {[["Casual",68,t.accent],["Sick",42,t.danger],["Earned",55,t.success],["WFH",81,t.accent2||t.accent],["Comp-off",30,t.warning]].map(([type,p,color])=>(
            <div key={type} style={{display:"flex",alignItems:"center",gap:9,marginBottom:9}}>
              <div style={{fontSize:12,color:"var(--ink)",width:82,flexShrink:0}}>{type}</div>
              <div style={{flex:1,height:6,background:"var(--border)",borderRadius:4,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${p}%`,background:color,borderRadius:4}}/>
              </div>
              <div style={{fontSize:12,fontWeight:700,color,width:30,textAlign:"right"}}>{p}%</div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
};

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [themeKey,setTK]=useState("arctic");
  const [module,setM]=useState("dashboard");
  const [picker,setP]=useState(false);
  const t=THEMES[themeKey];

  const render=()=>{
    switch(module){
      case "dashboard":   return <Dashboard   t={t} onNav={setM}/>;
      case "people":      return <People       t={t}/>;
      case "hiring":      return <Hiring       t={t}/>;
      case "attendance":  return <Attendance   t={t}/>;
      case "leave":       return <Leave        t={t}/>;
      case "payroll":     return <Salary       t={t}/>;
      case "performance": return <Reviews      t={t}/>;
      case "ai":          return <AIInsights   t={t}/>;
      case "reports":     return <Reports      t={t}/>;
      default:            return <Dashboard    t={t} onNav={setM}/>;
    }
  };

  // CSS vars update on theme change
  const cssVars=`
    --card:${t.card};
    --cardBorder:${t.cardBorder};
    --cardShadow:${t.cardShadow};
    --cardShadowH:${t.cardShadow.replace("0.08","0.16").replace("0.09","0.16").replace("0.04","0.08")};
    --surface2:${t.surface2};
    --ink:${t.ink};
    --muted:${t.muted};
    --border:${t.border};
    --accent:${t.accent};
    --accentLight:${t.accentLight};
    --danger:${t.danger};
    --success:${t.success};
    --warning:${t.warning};
  `;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@200;300;400;500;600;700;800&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        html{font-size:14px;}
        body{font-family:'Outfit',sans-serif;background:${t.pageBg};min-height:100vh;}
        :root{${cssVars}}
        ::-webkit-scrollbar{width:3px;height:3px;}
        ::-webkit-scrollbar-thumb{background:rgba(0,0,0,0.12);border-radius:3px;}
        button,input,select{font-family:'Outfit',sans-serif;}
        button:focus,input:focus,select:focus{outline:none;}
        input[type=date]::-webkit-calendar-picker-indicator{opacity:0.5;cursor:pointer;}
      `}</style>
      <div style={{minHeight:"100vh",background:t.pageBg}}>
        <TopNav active={module} onNav={setM} t={t} onTheme={()=>setP(true)}/>
        <main style={{maxWidth:1360,margin:"0 auto",padding:"8px 28px 60px"}}>
          {render()}
        </main>
        {picker&&<ThemePicker current={themeKey} onSelect={setTK} onClose={()=>setP(false)} t={t}/>}
      </div>
    </>
  );
}
