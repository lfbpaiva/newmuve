export type ErrorStatus = 400 | 401 | 403 | 404 | 409 | 422 | 429 | 502 | 503;

export class AppError extends Error {
  readonly status: ErrorStatus;
  readonly code: string;
  readonly retryAfter?: string;

  constructor(status: ErrorStatus, code: string, message: string, retryAfter?: string) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}
