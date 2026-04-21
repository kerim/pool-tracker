export function lastRowTimestamp(csv: string): string | null {
  const normalized = csv.replace(/\r\n?/g, "\n");
  const trimmed = normalized.replace(/\n+$/, "");
  const lines = trimmed.split("\n");
  if (lines.length < 2) return null;
  const last = lines[lines.length - 1];
  const comma = last.indexOf(",");
  return comma > 0 ? last.slice(0, comma) : null;
}
