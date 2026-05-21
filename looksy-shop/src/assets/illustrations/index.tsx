/**
 * Category-specific SVG illustrations.
 *
 * Each component takes a primary `fill` colour (the product's selected
 * colour) and an `accent` colour for highlights/shadow detail. The shapes
 * are stylised representations of the garment category — not photoreal
 * but recognisable, and they ship in the bundle so there's no network
 * dependency to flake on tests.
 */

interface IllustrationProps {
  fill: string;
  accent: string;
  variant?: number; // 0..n — lets each product look slightly different
}

export function OuterwearIllustration({ fill, accent, variant = 0 }: IllustrationProps) {
  // Variant 0: long overcoat. Variant 1: trench (slightly shorter, belted).
  const isLong = variant % 2 === 0;
  return (
    <svg
      viewBox="0 0 200 280"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet"
      className="illustration-svg"
    >
      {/* Body */}
      <path
        d={
          isLong
            ? "M60 60 L40 90 L40 230 L60 245 L100 240 L140 245 L160 230 L160 90 L140 60 L130 80 L100 90 L70 80 Z"
            : "M58 60 L36 92 L40 200 L62 215 L100 212 L138 215 L160 200 L164 92 L142 60 L130 78 L100 86 L70 78 Z"
        }
        fill={fill}
        stroke={accent}
        strokeWidth="1.2"
      />
      {/* Lapel left */}
      <path
        d="M70 78 L82 88 L100 90 L100 165 L82 170 L70 130 Z"
        fill={accent}
        opacity="0.18"
      />
      {/* Lapel right */}
      <path
        d="M130 78 L118 88 L100 90 L100 165 L118 170 L130 130 Z"
        fill={accent}
        opacity="0.18"
      />
      {/* Centre seam */}
      <line x1="100" y1="90" x2="100" y2={isLong ? "240" : "212"} stroke={accent} strokeWidth="0.8" opacity="0.4" />
      {/* Buttons */}
      <circle cx="100" cy="120" r="2" fill={accent} opacity="0.7" />
      <circle cx="100" cy="148" r="2" fill={accent} opacity="0.7" />
      <circle cx="100" cy="176" r="2" fill={accent} opacity="0.7" />
      {!isLong && <circle cx="100" cy="200" r="2" fill={accent} opacity="0.7" />}
      {/* Belt for trench */}
      {!isLong && (
        <rect x="42" y="148" width="120" height="6" fill={accent} opacity="0.3" />
      )}
      {/* Pockets */}
      <line x1="62" y1="180" x2="80" y2="180" stroke={accent} strokeWidth="1" opacity="0.5" />
      <line x1="120" y1="180" x2="138" y2="180" stroke={accent} strokeWidth="1" opacity="0.5" />
      {/* Collar */}
      <path d="M82 60 L70 78 L100 90 L130 78 L118 60 Z" fill={accent} opacity="0.25" />
    </svg>
  );
}

export function KnitwearIllustration({ fill, accent, variant = 0 }: IllustrationProps) {
  // Cable-knit fisherman style with a textured pattern.
  const cableLines = [];
  for (let i = 0; i < 6; i++) {
    cableLines.push(
      <path
        key={`cable-${i}`}
        d={`M${65 + i * 14} 90 Q${72 + i * 14} 130, ${65 + i * 14} 170 T${65 + i * 14} 230`}
        fill="none"
        stroke={accent}
        strokeWidth="0.8"
        opacity="0.35"
      />
    );
  }
  return (
    <svg
      viewBox="0 0 200 280"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet"
      className="illustration-svg"
    >
      {/* Sweater body */}
      <path
        d="M55 80 Q40 95 38 130 L42 220 Q44 235 60 240 L100 245 L140 240 Q156 235 158 220 L162 130 Q160 95 145 80 L120 70 Q100 75 80 70 Z"
        fill={fill}
        stroke={accent}
        strokeWidth="1.2"
      />
      {/* Rolled neck */}
      <ellipse cx="100" cy="72" rx="22" ry="8" fill={accent} opacity="0.3" />
      <ellipse cx="100" cy="68" rx="22" ry="8" fill={fill} stroke={accent} strokeWidth="1" />
      {/* Cable pattern */}
      {cableLines}
      {/* Ribbed cuff hint */}
      <rect x="42" y="225" width="118" height="10" fill={accent} opacity="0.15" />
      {/* Variant detail — collar accent */}
      {variant === 1 && (
        <path d="M85 72 Q100 78 115 72" fill="none" stroke={accent} strokeWidth="1.5" opacity="0.5" />
      )}
    </svg>
  );
}

export function TopsIllustration({ fill, accent, variant = 0 }: IllustrationProps) {
  // Variant 0: tee. Variant 1: button-up shirt.
  const isShirt = variant % 2 === 1;
  return (
    <svg
      viewBox="0 0 200 280"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet"
      className="illustration-svg"
    >
      {/* Body */}
      <path
        d="M60 75 L42 100 L46 200 L60 215 L100 218 L140 215 L154 200 L158 100 L140 75 L120 82 Q100 86 80 82 Z"
        fill={fill}
        stroke={accent}
        strokeWidth="1.2"
      />
      {/* Sleeve creases */}
      <path d="M48 105 L60 130 L60 200" fill="none" stroke={accent} strokeWidth="0.8" opacity="0.4" />
      <path d="M152 105 L140 130 L140 200" fill="none" stroke={accent} strokeWidth="0.8" opacity="0.4" />
      {/* Neckline */}
      {isShirt ? (
        <>
          {/* Shirt collar */}
          <path d="M82 75 L100 92 L118 75 L114 88 L100 100 L86 88 Z" fill={accent} opacity="0.25" />
          {/* Placket */}
          <line x1="100" y1="92" x2="100" y2="200" stroke={accent} strokeWidth="0.8" opacity="0.5" />
          <circle cx="100" cy="115" r="1.5" fill={accent} opacity="0.6" />
          <circle cx="100" cy="138" r="1.5" fill={accent} opacity="0.6" />
          <circle cx="100" cy="161" r="1.5" fill={accent} opacity="0.6" />
          <circle cx="100" cy="184" r="1.5" fill={accent} opacity="0.6" />
        </>
      ) : (
        <>
          {/* Crew neckline */}
          <path d="M82 78 Q100 88 118 78" fill="none" stroke={accent} strokeWidth="1.5" />
          <path d="M84 78 Q100 70 116 78 Q100 86 84 78" fill={accent} opacity="0.3" />
        </>
      )}
      {/* Hem */}
      <line x1="46" y1="200" x2="154" y2="200" stroke={accent} strokeWidth="0.5" opacity="0.3" />
    </svg>
  );
}

export function BottomsIllustration({ fill, accent, variant = 0 }: IllustrationProps) {
  // Variant 0: trouser. Variant 1: jean (slightly different waistband).
  return (
    <svg
      viewBox="0 0 200 280"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet"
      className="illustration-svg"
    >
      {/* Waistband */}
      <rect x="68" y="50" width="64" height="14" fill={accent} opacity="0.4" />
      {/* Left leg */}
      <path
        d="M68 64 L62 130 L58 240 L70 248 L84 240 L92 130 L98 64 Z"
        fill={fill}
        stroke={accent}
        strokeWidth="1.2"
      />
      {/* Right leg */}
      <path
        d="M132 64 L138 130 L142 240 L130 248 L116 240 L108 130 L102 64 Z"
        fill={fill}
        stroke={accent}
        strokeWidth="1.2"
      />
      {/* Centre seam / fly */}
      <line x1="100" y1="64" x2="100" y2="140" stroke={accent} strokeWidth="0.8" opacity="0.5" />
      {/* Pleat for trouser variant */}
      {variant === 0 && (
        <>
          <line x1="84" y1="64" x2="80" y2="180" stroke={accent} strokeWidth="0.6" opacity="0.4" />
          <line x1="116" y1="64" x2="120" y2="180" stroke={accent} strokeWidth="0.6" opacity="0.4" />
        </>
      )}
      {/* Pocket */}
      <path d="M70 70 L72 90 L82 90" fill="none" stroke={accent} strokeWidth="0.8" opacity="0.5" />
      <path d="M130 70 L128 90 L118 90" fill="none" stroke={accent} strokeWidth="0.8" opacity="0.5" />
      {/* Belt loop */}
      <rect x="78" y="48" width="2" height="6" fill={accent} opacity="0.6" />
      <rect x="98" y="48" width="2" height="6" fill={accent} opacity="0.6" />
      <rect x="118" y="48" width="2" height="6" fill={accent} opacity="0.6" />
    </svg>
  );
}

export function FootwearIllustration({ fill, accent, variant = 0 }: IllustrationProps) {
  // Variant 0: derby shoe. Variant 1: boot (taller upper).
  const isBoot = variant % 2 === 1;
  return (
    <svg
      viewBox="0 0 200 280"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet"
      className="illustration-svg"
    >
      {/* Sole */}
      <path
        d="M30 200 L24 215 L30 225 L170 222 L176 210 L168 198 Z"
        fill={accent}
        opacity="0.5"
      />
      {/* Upper */}
      {isBoot ? (
        <path
          d="M50 100 Q50 80 60 75 L100 70 Q120 72 130 80 L150 110 L170 200 L30 200 L40 150 Z"
          fill={fill}
          stroke={accent}
          strokeWidth="1.2"
        />
      ) : (
        <path
          d="M40 160 Q40 140 50 135 L80 120 Q110 116 140 130 L168 175 L170 200 L30 200 L38 180 Z"
          fill={fill}
          stroke={accent}
          strokeWidth="1.2"
        />
      )}
      {/* Laces / stitching */}
      <line x1="80" y1={isBoot ? "100" : "150"} x2="120" y2={isBoot ? "100" : "150"} stroke={accent} strokeWidth="1" opacity="0.4" />
      <line x1="80" y1={isBoot ? "120" : "165"} x2="120" y2={isBoot ? "120" : "165"} stroke={accent} strokeWidth="1" opacity="0.4" />
      <line x1="80" y1={isBoot ? "140" : "180"} x2="120" y2={isBoot ? "140" : "180"} stroke={accent} strokeWidth="1" opacity="0.4" />
      {/* Heel detail */}
      <path d="M30 200 L34 220 L40 220 L42 200 Z" fill={accent} opacity="0.3" />
      {/* Toe cap */}
      <path d="M150 195 Q165 190 170 200 L168 210 L150 210 Z" fill={accent} opacity="0.2" />
    </svg>
  );
}

export function AccessoriesIllustration({ fill, accent, variant = 0 }: IllustrationProps) {
  // Variant 0: scarf. Variant 1: belt. Variant 2: cap.
  const kind = variant % 3;
  if (kind === 0) {
    // Folded scarf
    return (
      <svg
        viewBox="0 0 200 280"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid meet"
        className="illustration-svg"
      >
        <path
          d="M30 80 L170 80 L160 200 L40 200 Z"
          fill={fill}
          stroke={accent}
          strokeWidth="1.2"
        />
        {/* Folds */}
        <line x1="35" y1="120" x2="165" y2="120" stroke={accent} strokeWidth="0.8" opacity="0.3" />
        <line x1="38" y1="160" x2="162" y2="160" stroke={accent} strokeWidth="0.8" opacity="0.3" />
        {/* Fringe top */}
        {Array.from({ length: 14 }).map((_, i) => (
          <line
            key={i}
            x1={35 + i * 10}
            y1="80"
            x2={35 + i * 10}
            y2="60"
            stroke={accent}
            strokeWidth="1"
            opacity="0.5"
          />
        ))}
        {/* Fringe bottom */}
        {Array.from({ length: 14 }).map((_, i) => (
          <line
            key={i}
            x1={40 + i * 9}
            y1="200"
            x2={40 + i * 9}
            y2="220"
            stroke={accent}
            strokeWidth="1"
            opacity="0.5"
          />
        ))}
      </svg>
    );
  }
  if (kind === 1) {
    // Coiled belt
    return (
      <svg
        viewBox="0 0 200 280"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid meet"
        className="illustration-svg"
      >
        <ellipse cx="100" cy="140" rx="65" ry="55" fill="none" stroke={fill} strokeWidth="14" />
        <ellipse cx="100" cy="140" rx="50" ry="42" fill="none" stroke={fill} strokeWidth="12" opacity="0.85" />
        <ellipse cx="100" cy="140" rx="36" ry="30" fill="none" stroke={fill} strokeWidth="10" opacity="0.7" />
        {/* Buckle */}
        <rect x="78" y="84" width="44" height="20" fill={accent} opacity="0.6" rx="2" />
        <rect x="84" y="90" width="32" height="8" fill="none" stroke={fill} strokeWidth="1.5" />
      </svg>
    );
  }
  // Watch cap
  return (
    <svg
      viewBox="0 0 200 280"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet"
      className="illustration-svg"
    >
      <path
        d="M50 180 Q50 90 100 88 Q150 90 150 180 Z"
        fill={fill}
        stroke={accent}
        strokeWidth="1.2"
      />
      {/* Cuff */}
      <rect x="46" y="165" width="108" height="22" fill={accent} opacity="0.3" />
      <rect x="46" y="165" width="108" height="22" fill="none" stroke={accent} strokeWidth="1" />
      {/* Rib texture */}
      {Array.from({ length: 12 }).map((_, i) => (
        <line
          key={i}
          x1={50 + i * 9}
          y1="167"
          x2={50 + i * 9}
          y2="186"
          stroke={accent}
          strokeWidth="0.6"
          opacity="0.4"
        />
      ))}
    </svg>
  );
}

export const ILLUSTRATIONS = {
  outerwear: OuterwearIllustration,
  knitwear: KnitwearIllustration,
  tops: TopsIllustration,
  bottoms: BottomsIllustration,
  footwear: FootwearIllustration,
  accessories: AccessoriesIllustration,
} as const;
