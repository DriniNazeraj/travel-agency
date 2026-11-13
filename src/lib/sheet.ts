/** Phone bottom-sheet snap points (fractions of the viewport). Full is capped at 88% so a strip of map and the attribution stay visible. */
export const SHEET_PEEK = 0.4
export const SHEET_FULL = 0.88
export const SHEET_SNAPS = [SHEET_PEEK, SHEET_FULL] as const
