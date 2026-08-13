import type { ApiErrorDTO } from '@healthmap/contracts';

/**
 * Formato unico de erro da API. Toda falha responde com esta forma.
 * Reexporta o contrato de @healthmap/contracts (apiErrorSchema) em vez de
 * redefinir a mesma forma aqui - apps/web usa o mesmo tipo para parsear
 * uma resposta de erro.
 */
export type ApiErrorBody = ApiErrorDTO;

/** Erro de aplicacao com status HTTP associado. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}
