// Spot illustrations for landing-page module sections.
// 64 × 64 line art on brand tokens; one focal element each, in the brand blue (chart-1, the brand).

export type ModuleIconName = 'monitor' | 'diagnose' | 'act' | 'crawlers' | 'readiness';

export interface ModuleIconProps {
  module: ModuleIconName;
  /** Square size in px (default 64). */
  size?: number;
  className?: string;
}

const CARD = 'var(--surface)';
const INSET = 'var(--surface-2)';
const LINE = 'var(--border-strong)';
const HAIR = 'var(--border)';
const PRI = 'var(--chart-1)'; // the brand, as in charts
const PRI_SOFT = 'var(--primary-soft)';
const PRI_FG = 'var(--primary-fg)';
const SW = 1.5;

const Bar = ({ x, y, w, h = 3, fill = HAIR }: { x: number; y: number; w: number; h?: number; fill?: string }) => (
  <rect x={x} y={y} width={w} height={h} rx={h / 2} fill={fill} />
);

function Monitor() {
  return (
    <>
      <rect x="6" y="12" width="52" height="40" rx="6" fill={CARD} stroke={LINE} strokeWidth={SW} />
      <path d="M13 24H51M13 33H51" stroke={HAIR} strokeWidth={SW} strokeDasharray="1.5 3" />
      <path d="M13 43H51" stroke={LINE} strokeWidth={SW} />
      <path d="M14 37 22 39 30 33 38 34 50 22" stroke={PRI} strokeWidth="2" />
      <circle cx="50" cy="22" r="3" fill={PRI} />
    </>
  );
}

function Diagnose() {
  const rows = [
    { y: 16, w: 30, brand: true },
    { y: 28, w: 38, brand: false },
    { y: 40, w: 22, brand: false },
  ];
  return (
    <>
      <rect x="6" y="8" width="52" height="48" rx="6" fill={CARD} stroke={LINE} strokeWidth={SW} />
      {rows.map((r) => (
        <g key={r.y}>
          <rect x="13" y={r.y} width="38" height="6" rx="3" fill={INSET} />
          <rect x="13" y={r.y} width={r.w} height="6" rx="3" fill={r.brand ? PRI : LINE} />
        </g>
      ))}
      {/* the gap to the leader */}
      <path d="M43 13V25" stroke={PRI} strokeWidth={SW} strokeDasharray="1.5 2.5" />
      <path d="M51 13V35" stroke={LINE} strokeWidth={SW} strokeDasharray="1.5 2.5" />
    </>
  );
}

function Act() {
  return (
    <>
      <rect x="12" y="6" width="40" height="52" rx="5" fill={CARD} stroke={LINE} strokeWidth={SW} />
      <rect x="19" y="13" width="17" height="7" rx="2" fill={INSET} />
      <Bar x={19} y={26} w={26} />
      <Bar x={19} y={32} w={22} />
      <Bar x={19} y={38} w={24} />
      <rect x="19" y="45" width="26" height="8" rx="4" fill={PRI} />
      <path d="M28.5 49 30.5 51 35.5 46.5" stroke={PRI_FG} strokeWidth={SW} />
    </>
  );
}

function Crawlers() {
  return (
    <>
      <rect x="22" y="10" width="36" height="44" rx="5" fill={CARD} stroke={LINE} strokeWidth={SW} />
      <path d="M22 18H58" stroke={LINE} strokeWidth={SW} />
      <Bar x={28} y={24} w={20} />
      <Bar x={28} y={30} w={24} />
      <Bar x={28} y={36} w={16} />
      <Bar x={28} y={42} w={22} />
      <path d="M5 50C13 50 13 32 20 32" stroke={LINE} strokeWidth={SW} strokeDasharray="1.5 3" />
      <circle cx="5.5" cy="50" r="2.5" fill={CARD} stroke={LINE} strokeWidth={SW} />
      <circle cx="22" cy="32" r="4" fill={PRI} />
      <circle cx="22" cy="32" r="1.5" fill={PRI_FG} />
    </>
  );
}

function Readiness() {
  return (
    <>
      <rect x="8" y="8" width="34" height="44" rx="5" fill={CARD} stroke={LINE} strokeWidth={SW} />
      <Bar x={14} y={15} w={16} />
      <Bar x={14} y={21} w={22} />
      <Bar x={14} y={27} w={18} />
      <Bar x={14} y={33} w={12} />
      <path d="M44 26 56 30.5V41C56 48.5 51 53.5 44 56.5 37 53.5 32 48.5 32 41V30.5Z" fill={PRI_SOFT} stroke={PRI} strokeWidth={SW} />
      <path d="M39 41.5 42.5 45 49.5 37.5" stroke={PRI} strokeWidth={SW} />
    </>
  );
}

const MODULES = { monitor: Monitor, diagnose: Diagnose, act: Act, crawlers: Crawlers, readiness: Readiness };

/** Landing spot illustration for a product module. Decorative. */
export function ModuleIcon({ module, size = 64, className }: ModuleIconProps) {
  const Body = MODULES[module];
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <Body />
    </svg>
  );
}
