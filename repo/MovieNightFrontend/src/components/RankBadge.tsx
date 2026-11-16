import type { ApiRank, RankEmblem } from "../api/profile"

/** Simple line emblems, one per rank (#32). */
function Emblem({ name }: { name: RankEmblem }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  }
  switch (name) {
    case "popcorn":
      return (
        <svg {...common}>
          <path d="M6 9h12l-1.6 11H7.6z" />
          <path d="M10 9l.5 11M14 9l-.5 11" />
          <path d="M6.5 9a2.5 2.5 0 0 1 3-3.5 2.5 2.5 0 0 1 5 0 2.5 2.5 0 0 1 3 3.5" />
        </svg>
      )
    case "ticket":
      return (
        <svg {...common}>
          <path d="M3 8a2 2 0 0 0 0 4v4h18v-4a2 2 0 0 1 0-4V4H3z" transform="translate(0 2)" />
          <path d="M14 6v2M14 11v2M14 16v2" />
        </svg>
      )
    case "owl":
      return (
        <svg {...common}>
          <path d="M5 4l3 3h8l3-3v10a7 7 0 0 1-14 0z" />
          <circle cx="9" cy="11" r="2" />
          <circle cx="15" cy="11" r="2" />
          <path d="M11 15l1 1 1-1" />
        </svg>
      )
    case "film-reel":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="12" cy="7" r="1.6" />
          <circle cx="12" cy="17" r="1.6" />
          <circle cx="7" cy="12" r="1.6" />
          <circle cx="17" cy="12" r="1.6" />
        </svg>
      )
    case "medal":
      return (
        <svg {...common}>
          <path d="M8 3l4 6 4-6" />
          <circle cx="12" cy="15" r="6" />
          <path d="M12 12.5l.9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2-1.45-1.4 2-.3z" />
        </svg>
      )
    case "notepad":
      return (
        <svg {...common}>
          <rect x="5" y="4" width="14" height="17" rx="2" />
          <path d="M9 2v4M15 2v4M8.5 11h7M8.5 15h5" />
        </svg>
      )
    case "directors-chair":
      return (
        <svg {...common}>
          <path d="M6 4v8M18 4v8M6 6h12M5 12h14" />
          <path d="M7 12l10 9M17 12L7 21" />
        </svg>
      )
    case "star":
    default:
      return (
        <svg {...common}>
          <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
        </svg>
      )
  }
}

/** The rank shown as a highlighted chip with its emblem; visible to the owner and friends. */
export default function RankBadge({ rank, className = "" }: { rank: ApiRank; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-amber-300/40 bg-amber-300/15 px-3 py-1 text-sm font-semibold text-amber-200 shadow-[0_0_16px_rgba(252,211,77,0.15)] ${className}`}
    >
      <Emblem name={rank.emblem} />
      <span>{rank.label}</span>
    </span>
  )
}
