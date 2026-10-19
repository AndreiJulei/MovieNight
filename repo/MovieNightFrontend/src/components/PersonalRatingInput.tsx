export default function PersonalRatingInput({ value, onChange, disabled = false }: {
  value: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block text-sm font-semibold text-text-primary">
      Personal rating (optional)
      <select value={value ?? ""} disabled={disabled}
        onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}
        className="nums mt-2 block w-full rounded-lg border border-white/15 bg-surface px-3 py-2.5 text-base text-text-primary focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60">
        <option value="">Unrated</option>
        {Array.from({ length: 21 }, (_, index) => index / 2).map((rating) => (
          <option key={rating} value={rating}>{rating.toFixed(1)} / 10</option>
        ))}
      </select>
    </label>
  );
}
