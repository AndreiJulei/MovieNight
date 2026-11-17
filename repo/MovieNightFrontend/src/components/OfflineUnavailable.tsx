import { Link } from "../router";

/** #34: replaces screens that need the network while offline. */
export default function OfflineUnavailable() {
  return (
    <div className="mx-auto max-w-xl py-12">
      <h1 className="text-2xl font-bold tracking-tight text-text-primary">This screen needs a connection</h1>
      <p className="mt-3 text-text-muted">
        You're offline. Explore, search, title details and friends come back when you reconnect.
        Your library is still here to read.
      </p>
      <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm">
        <li><Link to="/movies" className="prose-link">Watched</Link></li>
        <li><Link to="/movies?status=watchlist" className="prose-link">Watchlist</Link></li>
        <li><Link to="/lists" className="prose-link">Lists</Link></li>
      </ul>
    </div>
  );
}
