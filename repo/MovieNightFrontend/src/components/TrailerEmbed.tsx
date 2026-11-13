/**
 * Inline YouTube trailer, or a notice when the title has none. Fills its
 * parent; the caller sizes the frame (full hero on desktop, 16:9 on phones).
 */
export default function TrailerEmbed({ title, trailerKey }: { title: string; trailerKey?: string | null }) {
  if (!trailerKey) {
    return (
      <div className="flex h-full w-full items-center justify-center px-6 text-center text-sm text-text-muted">
        No video trailer available for this title
      </div>
    );
  }
  return (
    <iframe
      src={`https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1&rel=0&playsinline=1`}
      title={`${title} Trailer`}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
      className="h-full w-full border-0"
    />
  );
}
