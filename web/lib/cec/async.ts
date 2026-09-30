/** Sequential collection operations preserve transaction ordering and short circuiting. */
export async function asyncMap<T, R>(rows: readonly T[], fn: (row: T, index: number) => Promise<R>): Promise<R[]> {
  const result: R[] = []; for (let i = 0; i < rows.length; i++) result.push(await fn(rows[i], i)); return result;
}
export async function asyncFilter<T>(rows: readonly T[], fn: (row: T, index: number) => Promise<unknown>): Promise<T[]> {
  const result: T[] = []; for (let i = 0; i < rows.length; i++) if (await fn(rows[i], i)) result.push(rows[i]); return result;
}

export async function asyncSome<T>(rows: readonly T[], fn: (row: T) => Promise<unknown>): Promise<boolean> {
  for (const row of rows) if (await fn(row)) return true; return false;
}
