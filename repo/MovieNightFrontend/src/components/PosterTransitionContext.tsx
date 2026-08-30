import { createContext, useContext, useState, type ReactNode } from "react";

export interface PosterTransitionData {
  movieId: string;
  startRect: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
  posterUrl?: string | null;
  posterSeed?: number | null;
  title: string;
  /** The full path the user navigated from, used for back-navigation */
  referrer?: string;
}

interface PosterTransitionContextValue {
  transitionData: PosterTransitionData | null;
  startTransition: (data: PosterTransitionData) => void;
  clearTransition: () => void;
}

const PosterTransitionContext = createContext<PosterTransitionContextValue>({
  transitionData: null,
  startTransition: () => {},
  clearTransition: () => {},
});

export function PosterTransitionProvider({ children }: { children: ReactNode }) {
  const [transitionData, setTransitionData] = useState<PosterTransitionData | null>(null);

  const startTransition = (data: PosterTransitionData) => {
    setTransitionData(data);
  };

  const clearTransition = () => {
    setTransitionData(null);
  };

  return (
    <PosterTransitionContext.Provider
      value={{ transitionData, startTransition, clearTransition }}
    >
      {children}
    </PosterTransitionContext.Provider>
  );
}

export function usePosterTransition() {
  return useContext(PosterTransitionContext);
}
