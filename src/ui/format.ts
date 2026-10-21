/** Race timer format, m:ss.t (tenths, floored so the display never runs ahead of the clock). */
export function formatRaceTime(seconds: number): string {
  const s = Math.max(0, seconds);
  const tenths = Math.floor(s * 10 + 1e-6);
  const minutes = Math.floor(tenths / 600);
  const secs = Math.floor((tenths % 600) / 10);
  const t = tenths % 10;
  return `${minutes}:${secs.toString().padStart(2, '0')}.${t}`;
}

/** Results-screen format, m:ss.hh (hundredths). */
export function formatLapTime(seconds: number): string {
  const s = Math.max(0, seconds);
  const hundredths = Math.floor(s * 100 + 1e-6);
  const minutes = Math.floor(hundredths / 6000);
  const secs = Math.floor((hundredths % 6000) / 100);
  const h = hundredths % 100;
  return `${minutes}:${secs.toString().padStart(2, '0')}.${h.toString().padStart(2, '0')}`;
}

export function ordinal(position: number): string {
  if (position === 1) return '1st';
  if (position === 2) return '2nd';
  if (position === 3) return '3rd';
  return `${position}th`;
}
