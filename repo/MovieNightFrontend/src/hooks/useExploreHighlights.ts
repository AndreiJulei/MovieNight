import { useCallback, useEffect, useRef, useState } from "react"
import { moviesApi } from "../api/movies"
import {
  highlightsView,
  type HighlightsRequest,
  type HighlightsView,
} from "../components/exploreHighlightsLogic"
import type { ExploreCategory } from "../components/exploreCategories"

type LastAnswer = Omit<HighlightsRequest, "loading">

/**
 * The last answer per category in this tab. A return visit starts from it, so
 * the section has the layout the user left (restored scroll positions below
 * it stay put) while a fresh answer loads. Highlights are not user-specific.
 */
const lastAnswers = new Map<ExploreCategory, LastAnswer>()

function initialState(type: ExploreCategory) {
  const last = lastAnswers.get(type)
  return {
    type,
    data: last?.data ?? null,
    error: last?.error ?? null,
    loading: true,
  }
}

/**
 * Loads an Explore category's highlights (#26): its spotlight hero slides and
 * its "Top 10 today" row. Independent of the shelves' request, so a failure
 * here never blocks the rows below (EH04). `retry` asks the server again.
 */
export function useExploreHighlights(
  type: ExploreCategory,
): HighlightsView & {
  retrying: boolean
  retry: () => void
} {
  const [state, setState] = useState<
    HighlightsRequest & { type: ExploreCategory }
  >(() => initialState(type))
  const request = useRef(0)

  const load = useCallback(() => {
    const id = ++request.current
    // Keep showing the current answer (or failure notice) while asking again.
    setState((prev) =>
      prev.type === type ? { ...prev, loading: true } : initialState(type),
    )
    moviesApi
      .getExploreHighlights(type)
      .then((data) => {
        lastAnswers.set(type, { data, error: null })
        if (id === request.current)
          setState({ type, data, error: null, loading: false })
      })
      .catch((error: unknown) => {
        const message =
          error instanceof Error
            ? error.message
            : "Could not load trending titles. Retry."
        // A failure after an earlier answer keeps that answer on screen.
        const kept = lastAnswers.get(type)?.data ?? null
        lastAnswers.set(type, { data: kept, error: kept ? null : message })
        if (id === request.current)
          setState((prev) => ({
            type,
            data: prev.type === type ? prev.data : null,
            error: message,
            loading: false,
          }))
      })
  }, [type])

  useEffect(() => {
    load()
    return () => {
      request.current++
    }
  }, [load])

  const current = state.type === type ? state : initialState(type)
  const view = highlightsView(type, current)

  return {
    ...view,
    retrying:
      current.loading && (current.data !== null || current.error !== null),
    retry: load,
  }
}
