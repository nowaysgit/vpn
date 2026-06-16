export function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

export function now(): Date {
  return new Date()
}

export function toIso(date: Date | null): string | null {
  return date ? date.toISOString() : null
}

export function gbToBytes(value: number): bigint {
  return BigInt(value) * 1024n * 1024n * 1024n
}

export function bytesToGb(value: bigint): number {
  return Number(value / (1024n * 1024n * 1024n))
}
