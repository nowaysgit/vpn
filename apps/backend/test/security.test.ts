import { expect, test } from 'bun:test'
import { decryptJson, encryptJson } from '../src/lib/security'

test('VPN credentials are encrypted and reject the wrong key', () => {
  const key = '1'.repeat(64)
  const wrongKey = '2'.repeat(64)
  const encrypted = encryptJson({ uri: 'vless://secret' }, key)

  expect(encrypted).not.toContain('vless://secret')
  expect(decryptJson<{ uri: string }>(encrypted, key).uri).toBe('vless://secret')
  expect(() => decryptJson(encrypted, wrongKey)).toThrow()
})
