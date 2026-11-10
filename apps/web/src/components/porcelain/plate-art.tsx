import { useId } from 'react';

interface PlateArtProps {
  /** Number of reserve panels (开光) painted into the rim, one per level. */
  panels: number;
  /** Index of the panel washed in cinnabar, or -1 for none. */
  activeIndex: number;
  /** +1 lays panels clockwise, -1 counter-clockwise (RTL reading order). */
  sign: 1 | -1;
}

/** Radius of the panel centres in viewBox units (of 1000). Labels sit here. */
export const PANEL_RADIUS = 378;
/** Radius of the central well in viewBox units (of 1000). */
export const WELL_RADIUS = 262;

const C = 500;

const PANEL_PATH =
  'M -74 -62 Q 0 -86 74 -62 Q 112 -58 102 0 Q 112 58 74 62 Q 0 86 -74 62 Q -112 58 -102 0 Q -112 -58 -74 -62 Z';

const LEAF_PATH = 'M 0 0 C 12 -16 30 -18 40 -13 C 30 -2 14 7 0 0 Z';

function polar(radius: number, degrees: number): [number, number] {
  const radians = ((degrees - 90) * Math.PI) / 180;
  return [C + radius * Math.cos(radians), C + radius * Math.sin(radians)];
}

/**
 * One continuous scrolling stem (缠枝) that weaves around the rim, drawn as a
 * filled shape whose width swells and tapers like a loaded brush.
 */
function scrollStem(waves: number): string {
  const samples = 720;
  const centre: [number, number][] = [];
  for (let index = 0; index <= samples; index += 1) {
    const angle = (index / samples) * 360;
    const radius = PANEL_RADIUS + 46 * Math.sin((angle * waves * Math.PI) / 180);
    centre.push(polar(radius, angle));
  }
  const left: string[] = [];
  const right: string[] = [];
  centre.forEach(([x, y], index) => {
    const [px, py] = centre[Math.max(index - 1, 0)]!;
    const [nx, ny] = centre[Math.min(index + 1, samples)]!;
    const length = Math.hypot(nx - px, ny - py) || 1;
    const normalX = -(ny - py) / length;
    const normalY = (nx - px) / length;
    const angle = (index / samples) * 360;
    // swell at the crossings, taper towards the crests
    const half = 2.5 + 5 * Math.abs(Math.cos((angle * waves * Math.PI) / 180));
    left.push(`${(x + normalX * half).toFixed(1)} ${(y + normalY * half).toFixed(1)}`);
    right.push(`${(x - normalX * half).toFixed(1)} ${(y - normalY * half).toFixed(1)}`);
  });
  return `M${left.join(' L')} L${right.reverse().join(' L')} Z`;
}

/** A lotus blossom (莲) seen from the side, opening outward from the stem. */
function LotusBlossom({ transform }: { transform: string }): React.JSX.Element {
  return (
    <g transform={transform}>
      <g fill="var(--color-glaze)">
        <path d="M0 -44 C17 -28 19 -8 0 6 C-19 -8 -17 -28 0 -44 Z" />
        <path d="M0 6 C-6 -14 -18 -30 -36 -34 C-38 -14 -26 0 0 6 Z" />
        <path d="M0 6 C6 -14 18 -30 36 -34 C38 -14 26 0 0 6 Z" />
        <path d="M-40 2 C-24 26 24 26 40 2 C20 12 -20 12 -40 2 Z" />
      </g>
      <g fill="none" stroke="var(--color-cobalt)" strokeLinecap="round">
        <path d="M0 -32 C4 -20 4 -8 0 0" strokeWidth="3" />
        <path d="M-24 -22 C-16 -14 -10 -6 -6 0" strokeWidth="2.5" />
        <path d="M24 -22 C16 -14 10 -6 6 0" strokeWidth="2.5" />
        <path d="M-26 12 C-10 18 10 18 26 12" strokeWidth="2" />
      </g>
    </g>
  );
}

/** Blossoms sit on the stem midway between each pair of panels. */
function blossoms(panels: number): string[] {
  const step = 360 / Math.max(panels, 1);
  return Array.from({ length: panels }, (_, index) => {
    const angle = index * step + step / 2;
    const [x, y] = polar(PANEL_RADIUS, angle);
    return `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${angle.toFixed(1)}) scale(1.15)`;
  });
}

interface Tendril {
  key: string;
  d: string;
  leaf: string;
}

/** Curling tendrils and leaves sprouting from each crest of the stem. */
function tendrils(waves: number): Tendril[] {
  const result: Tendril[] = [];
  for (let crest = 0; crest < waves * 2; crest += 1) {
    const angle = ((crest + 0.5) * 180) / waves;
    const outward = crest % 2 === 0;
    const base = PANEL_RADIUS + (outward ? 46 : -46);
    const [x0, y0] = polar(base, angle);
    const tip = outward ? base - 40 : base + 40;
    const [x1, y1] = polar(tip, angle + 9);
    const [x2, y2] = polar((base + tip) / 2, angle + 15);
    const [lx, ly] = polar(base, angle - 7);
    result.push({
      key: `t-${crest}`,
      d: `M${x0.toFixed(1)} ${y0.toFixed(1)} Q${x2.toFixed(1)} ${y2.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)} q -10 -2 -8 -12`,
      leaf: `translate(${lx.toFixed(1)} ${ly.toFixed(1)}) rotate(${(angle + (outward ? 200 : 20)).toFixed(1)})`,
    });
  }
  return result;
}

/**
 * The painted plate: cobalt rim heaped with pigment, one continuous
 * white-reserve scroll, and lobed reserve panels that hold the levels.
 * Authored vector artwork.
 */
export function PlateArt({
  panels,
  activeIndex,
  sign,
}: PlateArtProps): React.JSX.Element {
  const id = useId().replace(/:/g, '');
  const step = 360 / Math.max(panels, 1);
  const waves = Math.max(panels, 1) * 2;

  return (
    <svg
      viewBox="0 0 1000 1000"
      aria-hidden="true"
      focusable="false"
      className="block size-full"
    >
      <defs>
        <radialGradient id={`glaze-${id}`} cx="46%" cy="40%" r="62%">
          <stop offset="0%" stopColor="#FBFCFE" />
          <stop offset="70%" stopColor="#F2F6FA" />
          <stop offset="100%" stopColor="#E3EAF3" />
        </radialGradient>
        {/* pigment heaping: darker cobalt pooling where the brush loaded */}
        <filter id={`pigment-${id}`} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.011 0.019" numOctaves="3" seed="11" result="noise" />
          <feColorMatrix
            in="noise"
            type="matrix"
            values="0 0 0 0 0.03  0 0 0 0 0.08  0 0 0 0 0.30  0 0 0 -2.2 1.35"
            result="pool"
          />
          <feComposite in="pool" in2="SourceGraphic" operator="in" result="pooled" />
          <feMerge>
            <feMergeNode in="SourceGraphic" />
            <feMergeNode in="pooled" />
          </feMerge>
        </filter>
        <mask id={`rim-${id}`}>
          <circle cx={C} cy={C} r="456" fill="white" />
          <circle cx={C} cy={C} r="300" fill="black" />
        </mask>
      </defs>

      {/* glaze body */}
      <circle cx={C} cy={C} r="498" fill={`url(#glaze-${id})`} />

      {/* rim band, cobalt with pooled pigment */}
      <g mask={`url(#rim-${id})`}>
        <rect
          width="1000"
          height="1000"
          fill="var(--color-cobalt)"
          filter={`url(#pigment-${id})`}
        />
        {/* one continuous reserve-white scroll with tendrils and leaves */}
        <path d={scrollStem(waves)} fill="var(--color-glaze)" />
        <g fill="none" stroke="var(--color-glaze)" strokeLinecap="round">
          {tendrils(waves).map((tendril) => (
            <path key={tendril.key} d={tendril.d} strokeWidth="5.5" />
          ))}
        </g>
        <g fill="var(--color-glaze)">
          {tendrils(waves).map((tendril) => (
            <path
              key={`leaf-${tendril.key}`}
              d={LEAF_PATH}
              transform={`${tendril.leaf} scale(1.35)`}
            />
          ))}
        </g>
        {blossoms(panels).map((transform) => (
          <LotusBlossom key={transform} transform={transform} />
        ))}
      </g>

      {/* painted double rings: heavy outer, fine inner */}
      <g fill="none" stroke="var(--color-cobalt)">
        <circle cx={C} cy={C} r="485" strokeWidth="11" />
        <circle cx={C} cy={C} r="467" strokeWidth="2.5" />
        <circle cx={C} cy={C} r="296" strokeWidth="9" />
        <circle cx={C} cy={C} r="280" strokeWidth="2" />
        <circle cx={C} cy={C} r={WELL_RADIUS + 6} strokeWidth="4" />
      </g>

      {/* lobed reserve panels, one per level */}
      <g transform={`translate(${C} ${C})`}>
        {Array.from({ length: panels }, (_, index) => {
          const angle = index * step * sign;
          const active = index === activeIndex;
          return (
            <g key={`panel-${index}`} transform={`rotate(${angle}) translate(0 ${-PANEL_RADIUS})`}>
              <path
                d={PANEL_PATH}
                fill={active ? 'var(--color-seal)' : 'var(--color-glaze)'}
                style={{ transition: 'fill 600ms var(--ease-glaze)' }}
              />
              <path
                d={PANEL_PATH}
                transform="scale(0.87)"
                fill="none"
                stroke={active ? 'var(--color-glaze)' : 'var(--color-cobalt)'}
                strokeWidth="3"
              />
              <path
                d={PANEL_PATH}
                transform="scale(0.8)"
                fill="none"
                stroke={active ? 'var(--color-glaze)' : 'var(--color-cobalt)'}
                strokeWidth="1"
              />
            </g>
          );
        })}
      </g>
    </svg>
  );
}
