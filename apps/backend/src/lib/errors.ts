import type { ApiErrorBody, ApiErrorCode } from '@vpn/api-contract'

export class AppError extends Error {
  readonly code: ApiErrorCode
  readonly status: number

  constructor(code: ApiErrorCode, message: string, status = 400) {
    super(message)
    this.code = code
    this.status = status
  }

  toBody(): ApiErrorBody {
    return {
      code: this.code,
      message: this.message
    }
  }
}

export function notFound(message = 'Not found'): AppError {
  return new AppError('NOT_FOUND', message, 404)
}
