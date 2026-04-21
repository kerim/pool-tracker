export function taiwanIsoNow(d: Date = new Date()): string {
  // Manual +8h shift then read UTC fields. Equivalent to Intl with
  // Asia/Taipei, smaller, and correct because Taiwan has observed no DST
  // since 1979.
  const tw = new Date(d.getTime() + 8 * 3600 * 1000);
  const yyyy = tw.getUTCFullYear();
  const mm = String(tw.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(tw.getUTCDate()).padStart(2, "0");
  const hh = String(tw.getUTCHours()).padStart(2, "0");
  const mi = String(tw.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}+08:00`;
}
