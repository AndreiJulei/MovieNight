import { useEffect, useRef, useState } from "react";
import { Link } from "../router";

export type SortBy = "addedAt" | "title" | "year" | "rating";
export type MinRating = 0 | 6 | 8;
export type DateRange = "all" | "month" | "year";
export type ViewMode = "grid" | "compact";

export type Filters = {
  sortBy: SortBy;
  minRating: MinRating;
  dateRange: DateRange;
  viewMode: ViewMode;
};

const SORT_LABELS: Record<SortBy, string> = {
  addedAt: "Date added",
  title: "Title",
  year: "Release year",
  rating: "Your rating",
};
const RATING_LABELS: Record<MinRating, string> = { 0: "All ratings", 6: "6+", 8: "8+" };
const DATE_LABELS: Record<DateRange, string> = {
  all: "All time",
  month: "This month",
  year: "This year",
};
const VIEW_LABELS: Record<ViewMode, string> = {
  grid: "Grid",
  compact: "Compact",
};

export default function TopBar({
  count,
  avg,
  filters,
  onChange,
  showRating,
}: {
  count: number;
  avg: number | null;
  filters: Filters;
  onChange: (f: Filters) => void;
  showRating: boolean;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);

  const summary =
    avg != null
      ? `${count} ${count === 1 ? "movie" : "movies"} · avg ${avg.toFixed(1)}`
      : `${count} ${count === 1 ? "movie" : "movies"}`;

  return (
    <div className="mb-6 flex items-center gap-3">
      <p className="nums shrink-0 text-sm font-medium text-text-muted">{summary}</p>

      {/* Desktop: inline dropdowns */}
      <div className="ml-auto hidden items-center gap-2 lg:flex">
        <Dropdown
          label="View"
          value={VIEW_LABELS[filters.viewMode]}
          options={Object.entries(VIEW_LABELS).map(([v, l]) => ({ value: v, label: l }))}
          onSelect={(v) => {
            localStorage.setItem("app_view_mode", v);
            onChange({ ...filters, viewMode: v as ViewMode });
          }}
        />
        <Dropdown
          label="Sort"
          value={SORT_LABELS[filters.sortBy]}
          options={Object.entries(SORT_LABELS).map(([v, l]) => ({ value: v, label: l }))}
          onSelect={(v) => onChange({ ...filters, sortBy: v as SortBy })}
        />
        {showRating && (
          <Dropdown
            label="Rating"
            value={RATING_LABELS[filters.minRating]}
            options={Object.entries(RATING_LABELS).map(([v, l]) => ({ value: v, label: l }))}
            onSelect={(v) => onChange({ ...filters, minRating: Number(v) as MinRating })}
          />
        )}
        <Dropdown
          label="Date"
          value={DATE_LABELS[filters.dateRange]}
          options={Object.entries(DATE_LABELS).map(([v, l]) => ({ value: v, label: l }))}
          onSelect={(v) => onChange({ ...filters, dateRange: v as DateRange })}
        />
      </div>

      {/* Phone: single Filters trigger */}
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        className="ml-auto rounded-lg border border-white/10 bg-[#111624] px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:border-white/20 lg:hidden"
      >
        Filters
      </button>

      {/* Primary + Add Movie Button */}
      <Link
        to="/movies/add"
        className="shrink-0 rounded-lg bg-accent px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-accent/90 hover:brightness-110 active:scale-95"
      >
        + Add
      </Link>

      {sheetOpen && (
        <FilterSheet
          filters={filters}
          onChange={onChange}
          showRating={showRating}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </div>
  );
}

function Dropdown({
  label,
  value,
  options,
  onSelect,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onSelect: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#111624] px-3 py-1.5 text-xs text-text-primary transition-colors hover:border-white/20"
      >
        <span className="text-text-muted">{label}:</span>
        <span className="font-semibold text-white">{value}</span>
        <Chevron open={open} />
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-1.5 min-w-[150px] overflow-hidden rounded-lg border border-white/15 bg-[#0e1320] py-1 shadow-xl backdrop-blur-xl">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                onSelect(o.value);
                setOpen(false);
              }}
              className={`flex w-full items-center px-3.5 py-1.5 text-left text-xs transition-colors hover:bg-white/[0.06] ${
                o.label === value ? "font-semibold text-accent" : "text-text-primary"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterSheet({
  filters,
  onChange,
  showRating,
  onClose,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  showRating: boolean;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="absolute inset-x-0 bottom-0 rounded-t-[20px] border-t border-white/15 bg-[#0e1320] p-6 pb-9 shadow-2xl">
        <div className="mx-auto mb-5 h-1.5 w-12 rounded-full bg-white/20" />
        <SheetGroup
          label="View"
          value={filters.viewMode}
          options={VIEW_LABELS}
          onSelect={(v) => {
            localStorage.setItem("app_view_mode", v);
            onChange({ ...filters, viewMode: v as ViewMode });
          }}
        />
        <SheetGroup
          label="Sort"
          value={filters.sortBy}
          options={SORT_LABELS}
          onSelect={(v) => onChange({ ...filters, sortBy: v as SortBy })}
        />
        {showRating && (
          <SheetGroup
            label="Rating"
            value={String(filters.minRating)}
            options={RATING_LABELS}
            onSelect={(v) => onChange({ ...filters, minRating: Number(v) as MinRating })}
          />
        )}
        <SheetGroup
          label="Date"
          value={filters.dateRange}
          options={DATE_LABELS}
          onSelect={(v) => onChange({ ...filters, dateRange: v as DateRange })}
        />
        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-lg bg-accent py-2.5 text-xs font-semibold text-white transition-all hover:bg-accent/90"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function SheetGroup({
  label,
  value,
  options,
  onSelect,
}: {
  label: string;
  value: string;
  options: Record<string | number, string>;
  onSelect: (v: string) => void;
}) {
  return (
    <div className="mb-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
        {label}
      </p>
      <div className="flex flex-wrap gap-2">
        {Object.entries(options).map(([v, l]) => (
          <button
            key={v}
            type="button"
            onClick={() => onSelect(v)}
            className={`rounded-lg border px-3 py-1.5 text-xs transition-all ${
              v === value
                ? "border-accent bg-accent font-semibold text-white"
                : "border-white/10 bg-[#141824] text-text-primary hover:border-white/20"
            }`}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`text-text-muted transition-transform ${open ? "rotate-180 text-accent" : ""}`}
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
