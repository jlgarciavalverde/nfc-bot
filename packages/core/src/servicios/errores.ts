/** Error de negocio: el mensaje (en español, tuteando) se enseña tal cual a quien escribió el comando. */
export class ErrorNegocio extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErrorNegocio";
  }
}
