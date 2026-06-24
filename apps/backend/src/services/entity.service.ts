import { notFound } from '../lib/errors'

export function requireEntity<T>(value: T | undefined | null, message: string): T {
  if (!value) throw notFound(message)
  return value
}
