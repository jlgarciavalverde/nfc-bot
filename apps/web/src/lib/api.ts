export class ErrorApi extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function pedir<T>(metodo: string, url: string, cuerpo?: unknown): Promise<T> {
  const r = await fetch(url, {
    method: metodo,
    credentials: "same-origin",
    headers: cuerpo !== undefined ? { "content-type": "application/json" } : undefined,
    body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
  });
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErrorApi(r.status, (datos as { error?: string }).error ?? `Error ${r.status}`);
  return datos as T;
}

export const api = {
  get: <T>(url: string) => pedir<T>("GET", url),
  post: <T>(url: string, cuerpo: unknown = {}) => pedir<T>("POST", url, cuerpo),
  put: <T>(url: string, cuerpo: unknown) => pedir<T>("PUT", url, cuerpo),
  del: <T>(url: string) => pedir<T>("DELETE", url),
};
