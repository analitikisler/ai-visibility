// Empty-state and error illustrations.
// 160 × 120 line art, theme-aware through brand tokens: neutral structure
// (`--surface`, `--surface-2`, `--border-strong`) plus one focal color: the brand blue (chart-1, the brand).
import type { ReactNode } from 'react';

export interface IllustrationProps {
  /** Rendered width in px (default 160); height follows the 4:3 viewBox. */
  width?: number;
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

function Art({ width = 160, className, children }: IllustrationProps & { children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 160 120"
      width={width}
      height={(width * 3) / 4}
      className={className}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** The brand "answer bubble": circle with the bottom-left quadrant squared off. */
const bubble = (cx: number, cy: number, r: number) =>
  `M${cx} ${cy - r}A${r} ${r} 0 0 1 ${cx + r} ${cy}A${r} ${r} 0 0 1 ${cx} ${cy + r}H${cx - r}V${cy}A${r} ${r} 0 0 1 ${cx} ${cy - r}Z`;

/** Placeholder text line. */
const Bar = ({ x, y, w, h = 4, fill = HAIR }: { x: number; y: number; w: number; h?: number; fill?: string }) => (
  <rect x={x} y={y} width={w} height={h} rx={h / 2} fill={fill} />
);

/** Small browser window frame with three dots in the title bar. */
const Window = ({ x, y, w, h }: { x: number; y: number; w: number; h: number }) => (
  <>
    <rect x={x} y={y} width={w} height={h} rx="7" fill={CARD} stroke={LINE} strokeWidth={SW} />
    <path d={`M${x} ${y + 13}H${x + w}`} stroke={LINE} strokeWidth={SW} />
    {[0, 6, 12].map((dx) => (
      <circle key={dx} cx={x + 8 + dx} cy={y + 6.5} r="1.6" fill={LINE} />
    ))}
  </>
);

/** No answers yet: an empty chart and an answer bubble that's still "typing". */
export function EmptyNoData(props: IllustrationProps) {
  return (
    <Art {...props}>
      <rect x="18" y="32" width="108" height="70" rx="8" fill={CARD} stroke={LINE} strokeWidth={SW} />
      {[52, 66, 80].map((y) => (
        <path key={y} d={`M30 ${y}H114`} stroke={HAIR} strokeWidth={SW} strokeDasharray="2 4" />
      ))}
      <path d="M30 90H114" stroke={LINE} strokeWidth={SW} />
      <Bar x={30} y={41} w={26} />
      {[38, 56, 74, 92, 110].map((x) => (
        <circle key={x} cx={x} cy="90" r="2.25" fill={CARD} stroke={LINE} strokeWidth={SW} />
      ))}
      <path d={bubble(122, 34, 18)} fill={CARD} stroke={PRI} strokeWidth={SW} />
      {[115, 122, 129].map((x) => (
        <circle key={x} cx={x} cy="34" r="2" fill={PRI} />
      ))}
    </Art>
  );
}

/** No prompts yet: ghost prompt cards above an empty, focused prompt field. */
export function EmptyPrompts(props: IllustrationProps) {
  return (
    <Art {...props}>
      <rect x="34" y="16" width="92" height="20" rx="10" fill={INSET} />
      <Bar x={46} y={24} w={50} fill={LINE} />
      <rect x="26" y="42" width="108" height="20" rx="10" fill={INSET} />
      <Bar x={38} y={50} w={66} fill={LINE} />
      <rect x="18" y="74" width="124" height="30" rx="15" fill={CARD} stroke={PRI} strokeWidth={SW} />
      <path d="M33 82V96" stroke={PRI} strokeWidth={SW} />
      <Bar x={40} y={87} w={46} fill={HAIR} />
      <circle cx="127" cy="89" r="9" fill={PRI} />
      <path d="M127 93.5V84.5M123 88.5 127 84.5 131 88.5" stroke={PRI_FG} strokeWidth={SW} />
    </Art>
  );
}

/** No AI crawlers seen yet: a dotted trail leading to a page, with a tracking point waiting. */
export function EmptyCrawlers(props: IllustrationProps) {
  return (
    <Art {...props}>
      <Window x={64} y={20} w={78} h={80} />
      <Bar x={74} y={44} w={38} h={5} />
      <Bar x={74} y={56} w={56} />
      <Bar x={74} y={64} w={48} />
      <Bar x={74} y={72} w={54} />
      <Bar x={74} y={80} w={34} />
      <path d="M16 94C34 94 36 62 58 62" stroke={LINE} strokeWidth={SW} strokeDasharray="2 4.5" />
      <circle cx="16" cy="94" r="3.5" fill={CARD} stroke={LINE} strokeWidth={SW} />
      <circle cx="35.5" cy="78" r="3.5" fill={CARD} stroke={LINE} strokeWidth={SW} />
      <circle cx="64" cy="62" r="6" fill={CARD} stroke={PRI} strokeWidth={SW} />
      <circle cx="64" cy="62" r="2.25" fill={PRI} />
    </Art>
  );
}

/** No audit yet: a page with an unchecked checklist and a readiness shield. */
export function EmptyAudit(props: IllustrationProps) {
  return (
    <Art {...props}>
      <rect x="34" y="12" width="74" height="94" rx="7" fill={CARD} stroke={LINE} strokeWidth={SW} />
      <Bar x={45} y={24} w={32} h={5} />
      {[42, 58, 74].map((y) => (
        <g key={y}>
          <rect x="45" y={y} width="9" height="9" rx="2.5" fill={CARD} stroke={LINE} strokeWidth={SW} />
          <Bar x={60} y={y + 2.5} w={y === 58 ? 26 : 36} />
        </g>
      ))}
      <path
        d="M110 62 125 67.5V81C125 90.5 119 97.5 110 101 101 97.5 95 90.5 95 81V67.5Z"
        fill={CARD}
        stroke={PRI}
        strokeWidth={SW}
      />
      <path d="M103.5 81.5 108 86 116.5 77" stroke={PRI} strokeWidth={SW} />
    </Art>
  );
}

/** All caught up: every item on the list is checked. */
export function EmptyActions(props: IllustrationProps) {
  return (
    <Art {...props}>
      <rect x="22" y="24" width="100" height="80" rx="8" fill={CARD} stroke={LINE} strokeWidth={SW} />
      {[44, 64, 84].map((y, i) => (
        <g key={y}>
          <circle cx="38" cy={y} r="6" fill={PRI_SOFT} />
          <path d={`M35 ${y}l2 2 4-4.5`} stroke={PRI} strokeWidth={SW} />
          <Bar x={52} y={y - 2} w={[52, 40, 46][i]} />
        </g>
      ))}
      <circle cx="124" cy="28" r="15" fill={PRI} />
      <path d="M117.5 28.5 122 33 131 23.5" stroke={PRI_FG} strokeWidth="2" />
    </Art>
  );
}

/** No AI referrals yet: an answer with a link, and a visit that hasn't arrived. */
export function EmptyTraffic(props: IllustrationProps) {
  return (
    <Art {...props}>
      <path d={bubble(42, 50, 26)} fill={CARD} stroke={LINE} strokeWidth={SW} />
      <Bar x={29} y={39} w={26} />
      <Bar x={29} y={47} w={20} />
      <path d="M29 58H51" stroke={PRI} strokeWidth="2" />
      <path d="M70 62C84 62 86 82 98 82" stroke={LINE} strokeWidth={SW} strokeDasharray="2 4.5" />
      <Window x={96} y={40} w={50} h={60} />
      <Bar x={104} y={62} w={30} />
      <Bar x={104} y={70} w={22} />
      <path
        d="M114 76.5V93l4-3.8 3 6.3 3-1.3-3-6.2h5.6Z"
        fill={PRI}
        stroke={PRI}
        strokeWidth="1"
      />
    </Art>
  );
}

/** Something failed: a connection between a server and a page, broken in the middle. */
export function ErrorState(props: IllustrationProps) {
  return (
    <Art {...props}>
      {[44, 62].map((y) => (
        <g key={y}>
          <rect x="16" y={y} width="40" height="14" rx="4" fill={CARD} stroke={LINE} strokeWidth={SW} />
          <circle cx="24" cy={y + 7} r="1.6" fill={LINE} />
          <Bar x={31} y={y + 5} w={18} />
        </g>
      ))}
      <Window x={100} y={32} w={46} h={56} />
      <Bar x={108} y={54} w={28} />
      <Bar x={108} y={62} w={20} />
      <path d="M56 60H68M90 60H100" stroke={LINE} strokeWidth={SW} />
      <circle cx="79" cy="60" r="8" fill="var(--danger-soft)" />
      <path d="M76 57l6 6M82 57l-6 6" stroke="var(--danger)" strokeWidth={SW} />
    </Art>
  );
}
