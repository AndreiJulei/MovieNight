/** Height of the phone bottom bar (Tailwind h-14). */
export const PHONE_BAR_HEIGHT = 56

/**
 * Distance from the layout viewport's bottom to the phone menu panel's bottom
 * edge (#27). Without a keyboard the panel rests on the bar; while the search
 * keyboard covers the bar, the panel rises to the visual viewport's bottom.
 */
export function phoneMenuBottomOffset({
  layoutHeight,
  viewportHeight,
  viewportOffsetTop,
}: {
  layoutHeight: number
  viewportHeight: number
  viewportOffsetTop: number
}): number {
  const keyboardInset = layoutHeight - viewportHeight - viewportOffsetTop
  return Math.max(PHONE_BAR_HEIGHT, Math.round(keyboardInset))
}
