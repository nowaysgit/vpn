import { expect, test } from 'bun:test'
import { compactDate } from '../app/lib/format'

test('shows missing date as none', () => {
  expect(compactDate(null)).toBe('none')
})
