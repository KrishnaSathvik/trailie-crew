const waypoints = [
  { x: 56, y: 296, label: "Someone starts talking" },
  { x: 128, y: 244, label: "The crew asks Trailie" },
  { x: 196, y: 176, label: "Everyone approves" },
] as const;

// Kept clear of the right edge so the summit labels are never clipped.
const summit = { x: 232, y: 100, label: "Published plan" };

/**
 * Brand art for the hero: a route climbing to a summit, echoing the mountain
 * mark. Deliberately not a product screenshot — there is no invented itinerary
 * here to drift out of step with the app.
 *
 * Colours come from the design tokens, so it follows light and dark mode
 * without a second asset.
 */
export function TrailIllustration() {
  return (
    <figure
      role="img"
      aria-label="A route climbing to a summit, marked with four stages: someone starts talking, the crew asks Trailie, everyone approves, and the plan is published."
      className="border-border bg-surface-raised rounded-card shadow-soft overflow-hidden border"
    >
      <svg viewBox="0 0 420 340" className="h-auto w-full" fill="none">
        {/* Sky wash, so the peaks read against the card. */}
        <rect width="420" height="340" fill="var(--subtle)" opacity="0.5" />

        {/* Far ridgeline. */}
        <path
          d="M-10 232 L64 176 L126 214 L196 150 L268 200 L340 138 L430 188 L430 350 L-10 350 Z"
          fill="var(--accent)"
          opacity="0.09"
        />

        {/* The summit the route climbs, shaped after the logo mark. */}
        <path
          d="M232 82 L392 300 L72 300 Z"
          fill="var(--accent)"
          opacity="0.16"
        />
        <path
          d="M318 162 L452 300 L184 300 Z"
          fill="var(--accent)"
          opacity="0.11"
        />

        {/* Valley floor. */}
        <path
          d="M-10 300 C 80 288, 150 306, 230 298 C 310 290, 370 304, 430 296 L430 350 L-10 350 Z"
          fill="var(--accent)"
          opacity="0.07"
        />

        {/* The route itself. */}
        <path
          d="M56 296 C 96 286, 96 258, 128 244 C 164 228, 166 198, 196 176 C 216 160, 214 124, 232 100"
          stroke="var(--accent)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="1 8"
          opacity="0.85"
        />

        {waypoints.map(({ x, y, label }) => (
          <g key={label}>
            <circle cx={x} cy={y} r="9" fill="var(--surface-raised)" />
            <circle
              cx={x}
              cy={y}
              r="4.5"
              fill="var(--accent)"
              stroke="var(--surface-raised)"
              strokeWidth="2"
            />
            <text
              x={x + 16}
              y={y + 4}
              fontSize="12.5"
              fontWeight="500"
              fill="var(--muted-foreground)"
            >
              {label}
            </text>
          </g>
        ))}

        {/* Summit marker, weighted more than the waypoints. */}
        <circle
          cx={summit.x}
          cy={summit.y}
          r="13"
          fill="var(--surface-raised)"
        />
        <circle cx={summit.x} cy={summit.y} r="7.5" fill="var(--accent)" />
        <path
          d={`M${summit.x - 3.2} ${summit.y} l2.4 2.6 l4.4 -5`}
          stroke="var(--surface-raised)"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <text
          x={summit.x + 21}
          y={summit.y + 1}
          fontSize="13.5"
          fontWeight="650"
          fill="var(--foreground)"
        >
          {summit.label}
        </text>
        <text
          x={summit.x + 21}
          y={summit.y + 17}
          fontSize="11.5"
          fill="var(--muted-foreground)"
        >
          versioned · with sources
        </text>
      </svg>
    </figure>
  );
}
