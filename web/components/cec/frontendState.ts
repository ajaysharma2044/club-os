/** A confirmed mutation stays successful even when the follow-up read fails. */
export async function commitAndRefresh<T>(write: () => Promise<T>, refresh: () => Promise<void>, refreshFailed: () => void): Promise<T> {
  const result = await write();
  try { await refresh(); } catch { refreshFailed(); }
  return result;
}
/** datetime-local has no timezone; format local wall time before binding it. */
export function localDateTime(date: Date): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0,16);
}
export function optionalNumber(value: string): number | undefined {
  return value.trim() === "" ? undefined : Number(value);
}
