// The Berby palette (see MVP.md, "Visual style"). Hex numbers for Three.js colors.
export const PALETTE = {
  hotPink: 0xff4fa3,
  bubblegum: 0xffb3d9,
  lavender: 0xc9a7ff,
  mint: 0x9ff2d8,
  cream: 0xfff4e6,
  sunsetOrange: 0xff9a5c,
} as const;

/** CSS strings of the same colors, for the DOM UI. */
export const PALETTE_CSS = Object.fromEntries(
  Object.entries(PALETTE).map(([k, v]) => [k, `#${v.toString(16).padStart(6, '0')}`]),
) as Record<keyof typeof PALETTE, string>;
