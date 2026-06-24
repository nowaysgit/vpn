export const apiBaseUrl = process.env.API_E2E_URL ?? 'http://127.0.0.1:3001'
export const customerBaseUrl = process.env.CUSTOMER_E2E_URL ?? 'http://127.0.0.1:3000'
export const adminBaseUrl = process.env.ADMIN_E2E_URL ?? 'http://127.0.0.1:3002'

export function apiUrl(path) {
  return new URL(path, normalizedBaseUrl(apiBaseUrl)).toString()
}

export function customerUrl(path) {
  return new URL(path, normalizedBaseUrl(customerBaseUrl)).toString()
}

export function adminUrl(path) {
  return new URL(path, normalizedBaseUrl(adminBaseUrl)).toString()
}

function normalizedBaseUrl(value) {
  return value.endsWith('/') ? value : `${value}/`
}
