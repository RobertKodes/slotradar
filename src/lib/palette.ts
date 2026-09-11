/** Named ops-room palette — six dyes, no extras. */
export const PALETTE = {
  pitch: '#070B08',
  phosphor: '#8FE06A',
  amber: '#E0B34A',
  ghost: '#C94A38',
  bezel: '#141E16',
  reticule: '#2E4A30',
} as const

export type PaletteName = keyof typeof PALETTE

/** RAY rust sits between amber and ghost — not a seventh brand color. */
export const RAY_RUST = '#C86A3A'
/** Unknown sits on reticule, dimmed into pitch. */
export const UNKNOWN_ASH = '#5A7A52'
/** Token is phosphor mixed toward glass. */
export const TOKEN_PALE = '#C8E8A8'
/** Stake is amber mixed into bezel. */
export const STAKE_DIM = '#B89440'

export const FAMILY_TINT: Record<string, string> = {
  SYS: PALETTE.phosphor,
  JUP: PALETTE.amber,
  RAY: RAY_RUST,
  TKN: TOKEN_PALE,
  STK: STAKE_DIM,
  '???': UNKNOWN_ASH,
}
