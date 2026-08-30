export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

export default function SegmentedRadio<T extends string>({
  name,
  value,
  options,
  onChange,
  className = "",
}: {
  name: string;
  value: T;
  options: SegmentedOption<T>[];
  onChange: (val: T) => void;
  className?: string;
}) {
  return (
    <div className={`inline-flex items-center rounded-lg border border-white/10 bg-black/40 p-1 backdrop-blur-md ${className}`}>
      {options.map((opt, idx) => {
        const isChecked = opt.value === value;
        const isFirst = idx === 0;
        const isLast = idx === options.length - 1;

        return (
          <label key={opt.value} className="relative cursor-pointer select-none">
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={isChecked}
              onChange={() => onChange(opt.value)}
              className="sr-only"
            />
            <span
              className={`block px-3.5 py-1.5 text-xs font-semibold tracking-wide transition-all duration-200 ${
                isFirst ? "rounded-l-md" : ""
              } ${isLast ? "rounded-r-md" : ""} ${
                isChecked
                  ? "bg-accent text-white shadow-sm"
                  : "text-text-muted hover:bg-white/[0.04] hover:text-text-primary"
              }`}
            >
              {opt.label}
              {opt.count != null && (
                <span className={`nums ml-1.5 text-[11px] ${isChecked ? "text-white/80" : "text-text-muted"}`}>
                  ({opt.count})
                </span>
              )}
            </span>
          </label>
        );
      })}
    </div>
  );
}
