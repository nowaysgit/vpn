import { expect, test } from 'bun:test'
import { dateLabel, rub } from '../app/lib/format'

test('formats rub amounts for tariff cards', () => {
  expect(rub(499)).toContain('499')
})

test('formats empty subscription date clearly', () => {
  expect(dateLabel(null)).toBe('No active subscription')
})
