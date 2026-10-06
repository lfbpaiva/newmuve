export type ErrorStatus = 400 | 401 | 403 | 404 | 409 | 422 | 429 | 502 | 503;

// Erro de regra de negócio ou de validação, com status HTTP e código estável
// para o cliente. Qualquer outro erro vira um 500 genérico na camada HTTP.
export class AppError extends Error {
  readonly status: ErrorStatus;
  readonly code: string;

  constructor(status: ErrorStatus, code: string, message: string) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
  }
}
