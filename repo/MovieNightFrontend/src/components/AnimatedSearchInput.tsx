import { type ChangeEvent, type InputHTMLAttributes } from "react";

interface AnimatedSearchInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export default function AnimatedSearchInput({
  label,
  value,
  onChange,
  className = "",
  autoFocus,
  ...props
}: AnimatedSearchInputProps) {
  const isFilled = value.trim().length > 0;

  return (
    <div className={`relative my-4 w-full ${className}`}>
      <input
        type="text"
        value={value}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        autoFocus={autoFocus}
        className="peer w-full border-0 border-b-2 border-white/20 bg-transparent py-2.5 text-base font-medium text-white placeholder-transparent focus:border-transparent focus:outline-none"
        placeholder={label}
        {...props}
      />

      {/* Floating Label */}
      <label
        className={`pointer-events-none absolute left-0 transition-all duration-200 ease-out ${
          isFilled
            ? "-top-5 text-xs font-semibold text-accent"
            : "top-2.5 text-sm text-text-muted peer-focus:-top-5 peer-focus:text-xs peer-focus:font-semibold peer-focus:text-accent"
        }`}
      >
        {label}
      </label>

      {/* Expanding Accent Underline */}
      <div
        className={`pointer-events-none absolute bottom-0 left-0 h-[2px] w-full bg-accent transition-transform duration-200 ease-out origin-center ${
          isFilled ? "scale-x-100" : "scale-x-0 peer-focus:scale-x-100"
        }`}
      />
    </div>
  );
}
