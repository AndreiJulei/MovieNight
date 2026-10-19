import { useState } from "react";
import { useToast } from "../components/Toast";
import { useStore } from "../store/MovieStore";
import type { Movie } from "../store/data";

export default function useWatchlistSave() {
  const store = useStore();
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);

  const saveWatchlist = async (movieId: string, movie?: Movie, notes?: string) => {
    if (store.isWatchlistSaving(movieId)) return false;
    setError(null);
    const result = await store.addToWatchlist(movieId, movie, notes);
    const title = movie?.title ?? store.movieById(movieId)?.title ?? "Title";
    if (!result.ok) {
      const message = result.error ?? "Could not confirm the save. Please try again.";
      setError(message);
      toast({ message, type: "error", duration: 6000 });
      return false;
    }
    toast({
      message: result.status === "watched"
        ? `"${title}" is already in your watched history`
        : `"${title}" saved to Watchlist`,
      type: "success",
    });
    return true;
  };

  return { saveWatchlist, error };
}
