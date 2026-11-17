import { useStore } from "../store/MovieStore";
import { offlineBannerText } from "../offline/librarySnapshot";

/** #34: shown at the top of every screen while the library is read-only. */
export default function OfflineBanner() {
  const { isOffline, offlineSnapshotAt } = useStore();
  if (!isOffline) return null;
  return (
    <div role="status" className="mb-4 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-text-primary">
      <strong className="font-semibold">{offlineBannerText(offlineSnapshotAt)}.</strong>{" "}
      <span className="text-text-muted">Changes, Explore and search need a connection.</span>
    </div>
  );
}
