import { useEffect, useRef, useState } from "react";
import { Link } from "../router";
import SegmentedRadio from "./SegmentedRadio";
import { useEscapeKey, useBodyScrollLock } from "../hooks/useOverlay";
import type { MediaType } from "../store/data";

export type SortBy = "addedAt" | "title" | "year" | "rating";
export type MinRating = 0 | 6;
export type DateRange = "all" | "month" | "year";
export type ViewMode = "grid" | "compact";

export type Filters = {
  sortBy: SortBy;
  minRating: MinRating;
  dateRange: DateRange;
  viewMode: ViewMode;
};

export type MediaTypeFilter = "ALL" | MediaType;

const SORT_LABELS: Record<SortBy, string> = {
  addedAt: "Date added",
  title: "Title",
  year: "Release year",
  rating: "Your rating",
};
const RATING_LABELS: Record<MinRating, string> = { 0: "All ratings", 6: "6+" };
const DATE_LABELS: Record<DateRange, string> = {
  all: "All time",
  month: "This month",
  year: "This year",
};
const VIEW_LABELS: Record<ViewMode, string> = {
  grid: "Grid",
  compact: "Compact",
};

export const MEDIA_TYPE_LABELS: Record<MediaTypeFilter, string> = {
  ALL: "All",
  MOVIE: "Movies",
  TV: "TV Series",
  ANIME: "Anime",
};

export default function TopBar({
  count,
  avg,
  filters,
  onChange,
  showRating,
  mediaTypeFilter,
  onMediaTypeChange,
  showAddButton = true,
}: {
  count: number;
  avg: number | null;
  filters: Filters;
  onChange: (f: Filters) => void;
  showRating: boolean;
  mediaTypeFilter?: MediaTypeFilter;
  onMediaTypeChange?: (mt: MediaTypeFilter) => void;
  showAddButton?: boolean;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);

  const summary =
    avg != null
      ? `${count} ${count === 1 ? "title" : "titles"} · avg ${avg.toFixed(1)}`
      : `${count} ${count === 1 ? "title" : "titles"}`;

  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-3">
        <p className="nums shrink-0 text-sm font-medium text-text-muted">{summary}</p>

        <div className="flex items-center gap-2">
          {/* Desktop: unified quiet filter cluster */}
          <div className="hidden items-center gap-1.5 lg:flex">
            {mediaTypeFilter !== undefined && onMediaTypeChange && (
              <Dropdown
                label="Type"
                value={MEDIA_TYPE_LABELS[mediaTypeFilter]}
                options={Object.entries(MEDIA_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))}
                onSelect={(v) => onMediaTypeChange(v as MediaTypeFilter)}
              />
            )}
            <Dropdown
              label="Sort"
              value={SORT_LABELS[filters.sortBy]}
              options={Object.entries(SORT_LABELS).map(([v, l]) => ({ value: v, label: l }))}
              onSelect={(v) => onChange({ ...filters, sortBy: v as SortBy })}
            />
            <Dropdown
              label="View"
              value={VIEW_LABELS[filters.viewMode]}
              options={Object.entries(VIEW_LABELS).map(([v, l]) => ({ value: v, label: l }))}
              onSelect={(v) => {
                localStorage.setItem("app_view_mode", v);
                onChange({ ...filters, viewMode: v as ViewMode });
              }}
            />
            {showRating && (
              <Dropdown
                label="Rating"
                value={RATING_LABELS[filters.minRating]}
                options={Object.entries(RATING_LABELS).map(([v, l]) => ({ value: v, label: l }))}
                onSelect={(v) => onChange({ ...filters, minRating: Number(v) as MinRating })}
              />
            )}
            {filters.dateRange && (
              <Dropdown
                label="Date"
                value={DATE_LABELS[filters.dateRange]}
                options={Object.entries(DATE_LABELS).map(([v, l]) => ({ value: v, label: l }))}
                onSelect={(v) => onChange({ ...filters, dateRange: v as DateRange })}
              />
            )}
          </div>

          {/* Phone: single Filters trigger */}
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="flex h-8 items-center rounded-lg border border-white/10 bg-[#111624] px-3 text-xs font-medium text-text-primary transition-colors hover:border-white/20 lg:hidden"
          >
            Filters
          </button>

          {/* Primary + Add Button */}
          {showAddButton && (
            <Link
              to="/movies/add"
              className="flex h-8 items-center rounded-lg bg-accent px-3 text-xs font-semibold text-white shadow-sm transition-all hover:bg-accent/90 active:scale-95"
            >
              + Add
            </Link>
          )}
        </div>

        {sheetOpen && (
          <FilterSheet
            filters={filters}
            onChange={onChange}
            showRating={showRating}
            mediaTypeFilter={mediaTypeFilter}
            onMediaTypeChange={onMediaTypeChange}
            onClose={() => setSheetOpen(false)}
          />
        )}
      </div>
    </>
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
  useEscapeKey(open, () => setOpen(false));

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
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#111624] px-3 py-1.5 text-xs text-text-primary transition-colors hover:border-white/20"
      >
        <span className="text-text-muted">{label}:</span>
        <span className="font-semibold text-white">{value}</span>
        <Chevron open={open} />
      </button>
      {open && (
        <div
          role="listbox"
          aria-label={label}
          className="absolute right-0 z-40 mt-1.5 min-w-[150px] overflow-hidden rounded-lg border border-white/15 bg-[#0e1320] py-1 shadow-xl backdrop-blur-xl"
        >
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.label === value}
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
  mediaTypeFilter,
  onMediaTypeChange,
  onClose,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  showRating: boolean;
  mediaTypeFilter?: MediaTypeFilter;
  onMediaTypeChange?: (mt: MediaTypeFilter) => void;
  onClose: () => void;
}) {
  useEscapeKey(true, onClose);
  useBodyScrollLock(true);

  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Filter Options">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="absolute inset-x-0 bottom-0 rounded-t-[20px] border-t border-white/15 bg-[#0e1320] p-6 pb-9 shadow-2xl">
        <div className="mx-auto mb-5 h-1.5 w-12 rounded-full bg-white/20" />
        {mediaTypeFilter !== undefined && onMediaTypeChange && (
          <SheetGroup
            label="Media Type"
            value={mediaTypeFilter}
            options={MEDIA_TYPE_LABELS}
            onSelect={(v) => onMediaTypeChange(v as MediaTypeFilter)}
          />
        )}
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
