import React, { useId, useState } from "react"
import {
  calculateNextRating,
  calculateTrackFillPercentage,
  formatRatingReadout,
  parseRatingInput,
  parseTypedRating,
  ratingToSliderValue,
  MAX_RATING,
  MIN_RATING,
  RATING_STEP,
} from "./ratingSliderLogic"

export interface PersonalRatingInputProps {
  value: number | null
  onChange: (value: number | null) => void
  disabled?: boolean
}

export default function PersonalRatingInput({
  value,
  onChange,
  disabled = false,
}: PersonalRatingInputProps) {
  const sliderVal = ratingToSliderValue(value)
  const fillPercentage = calculateTrackFillPercentage(value)
  const formattedReadout = formatRatingReadout(value)
  const typedId = useId()
  const typedHintId = useId()
  // Text being typed; null shows the current rating. Invalid text is kept (and
  // flagged) without changing the rating, which stays at its last valid value.
  const [draft, setDraft] = useState<string | null>(null)
  // "8." is a value still being typed: neither applied nor flagged.
  const typedPending = draft !== null && /^\d+\.$/.test(draft.trim())
  const typedInvalid = draft !== null && !typedPending && !parseTypedRating(draft).valid
  const typedText = draft ?? (sliderVal > 0 ? sliderVal.toFixed(1) : "")

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDraft(null)
    const next = parseRatingInput(e.target.value)
    onChange(next)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return
    const next = calculateNextRating(value, e.key, { shiftKey: e.shiftKey })
    if (next !== undefined) {
      e.preventDefault()
      setDraft(null)
      onChange(next)
    }
  }

  const handleTypedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value
    setDraft(text)
    const typed = parseTypedRating(text)
    if (typed.valid && typed.rating !== value) onChange(typed.rating)
  }

  const handleTypedBlur = () => {
    if (!typedInvalid) setDraft(null)
  }

  const handleClear = () => {
    setDraft(null)
    onChange(null)
  }

  // Thumb offset math: 22px thumb width
  // Center is at 11px at 0% and calc(100% - 11px) at 100%
  // Edge-clamped so ~60px badge stays snugly within boundaries at 0 and 10
  const thumbOffset = `clamp(30px, calc(${fillPercentage}% + ${(50 - fillPercentage) * 0.22}px), calc(100% - 30px))`

  return (
    <div className="w-full">
      {/* Header with Title and Clear Option */}
      <div className="flex items-center justify-between gap-2 mb-1">
        <label
          htmlFor="personal-rating-slider"
          className="text-sm font-semibold text-text-primary flex items-center gap-1.5 cursor-pointer"
        >
          <span>Personal rating</span>
          <span className="text-xs font-normal text-text-muted">
            (optional)
          </span>
        </label>
        <div className="flex items-center gap-2">
          <label htmlFor={typedId} className="sr-only">
            Personal rating value, 0 to 10
          </label>
          <input
            id={typedId}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="–"
            value={typedText}
            disabled={disabled}
            onChange={handleTypedChange}
            onBlur={handleTypedBlur}
            aria-invalid={typedInvalid}
            aria-describedby={typedInvalid ? typedHintId : undefined}
            data-testid="rating-typed-input"
            className={`nums w-14 rounded-md border bg-black/40 px-2 py-1 text-center text-xs text-white placeholder:text-text-muted focus:outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              typedInvalid
                ? "border-red-400/70 focus:border-red-400"
                : "border-white/10 focus:border-accent"
            }`}
          />
          {(sliderVal > 0 || !!draft) && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              aria-label="Clear personal rating"
              title="Reset to Unrated"
              className="text-xs text-text-muted hover:text-text-primary transition-colors focus-visible:outline-none focus-visible:underline"
            >
              Clear
            </button>
          )}
        </div>
      </div>
      {typedInvalid && (
        <p id={typedHintId} role="alert" className="mb-1 text-xs text-red-300">
          Use 0–10 with at most one decimal, e.g. 8.2
        </p>
      )}

      {/* Floating Readout badge tracking the thumb position without overhang (RS02) */}
      <div className="relative w-full h-6 mb-1 pointer-events-none select-none">
        <div
          className="absolute top-0 transition-[left] duration-75 ease-out"
          style={{
            left: thumbOffset,
            transform: "translateX(-50%)",
          }}
        >
          <span
            data-testid="rating-readout"
            aria-live="polite"
            className={`nums inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap shadow-sm ${
              sliderVal > 0
                ? "border border-accent/40 bg-accent/25 text-white shadow-accent/20"
                : "border border-white/10 bg-white/5 text-text-muted"
            }`}
          >
            {formattedReadout}
          </span>
        </div>
      </div>

      {/* Slider Control Area (RS01, RS03) */}
      <div className="relative flex flex-col justify-center">
        <div className="relative flex items-center h-11 w-full">
          <input
            id="personal-rating-slider"
            type="range"
            min={MIN_RATING}
            max={MAX_RATING}
            step={RATING_STEP}
            value={sliderVal}
            disabled={disabled}
            onChange={handleSliderChange}
            onKeyDown={handleKeyDown}
            aria-label="Personal rating"
            aria-valuemin={MIN_RATING}
            aria-valuemax={MAX_RATING}
            aria-valuenow={sliderVal}
            aria-valuetext={
              sliderVal === 0 ? "Unrated" : `${sliderVal.toFixed(1)} out of 10`
            }
            className="rating-slider w-full cursor-pointer disabled:cursor-not-allowed"
            style={
              {
                "--slider-track-bg": `linear-gradient(to right, var(--color-accent) 0%, var(--color-accent) ${fillPercentage}%, rgba(255, 255, 255, 0.15) ${fillPercentage}%, rgba(255, 255, 255, 0.15) 100%)`,
              } as React.CSSProperties
            }
          />
        </div>

        {/* Subtle Scale Markers */}
        <div
          aria-hidden="true"
          className="flex justify-between px-1 text-[10px] font-medium text-text-muted/60 select-none nums"
        >
          <span>0 (Unrated)</span>
          <span>2.5</span>
          <span>5.0</span>
          <span>7.5</span>
          <span>10.0</span>
        </div>
      </div>
    </div>
  )
}
