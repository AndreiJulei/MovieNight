import { useStore } from "../store/MovieStore";

/** #34 (OF02): says why the list controls are disabled while the library is read-only. */
export default function OfflineListsHint() {
  const { isOffline } = useStore();
  if (!isOffline) return null;
  return <p role="note" className="mb-4 text-sm text-text-muted">Lists are read-only offline. Reconnect to create, rename or delete them.</p>;
}
