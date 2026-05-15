export function formatCount(value: unknown): string {
  const count = Number(value);

  if (!Number.isFinite(count) || count <= 0) {
    return '0';
  }

  if (count >= 1_000_000) {
    const formatted = count / 1_000_000;
    return `${formatted.toFixed(formatted >= 10 ? 0 : 1).replace(/\.0$/, '')}M`;
  }

  if (count >= 1_000) {
    const formatted = count / 1_000;
    return `${formatted.toFixed(formatted >= 100 ? 0 : 1).replace(/\.0$/, '')}K`;
  }

  return String(Math.round(count));
}
