import { lazy, Suspense, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Route, Switch, useLocation } from "wouter";
import { api, ErrorApi } from "./lib/api";
import type { Socio } from "./lib/tipos";
import { Boton, Campo } from "./componentes/ui";
import { ApuntarProvider, useApuntar } from "./componentes/Apuntar";
import { AvisosProvider } from "./lib/acciones";
import { Cuenta } from "./paginas/Cuenta";
import { Inicio } from "./paginas/Inicio";
import { Comercios } from "./paginas/Comercios";
import { Ventas } from "./paginas/Ventas";
import { Caja } from "./paginas/Caja";
import { Stock } from "./paginas/Stock";
import { Reparto } from "./paginas/Reparto";
import { Precios } from "./paginas/Precios";

const Mapa = lazy(() => import("./paginas/Mapa"));

const NAV = [
  ["/", "Resumen"],
  ["/comercios", "Comercios"],
  ["/mapa", "Mapa"],
  ["/ventas", "Ventas"],
  ["/caja", "Caja"],
  ["/stock", "Stock"],
  ["/reparto", "Reparto"],
  ["/precios", "Precios"],
  ["/cuenta", "Cuenta"],
] as const;

export function useYo() {
  const [ruta] = useLocation();
  return useQuery({ queryKey: ["yo"], queryFn: () => api.get<{ socio: Socio }>("/api/yo").then((r) => r.socio), staleTime: 300_000, enabled: ruta !== "/entrar" });
}

/** Canjea el enlace del bot (va en el fragmento #, que no llega a ningún servidor ni a los logs). */
function Entrar() {
  const [, ir] = useLocation();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const token = location.hash.slice(1);
    history.replaceState(null, "", "/entrar");
    if (!token) return setError("Falta el enlace. Pídeselo al bot con /panel.");
    api
      .post<{ socio: Socio }>("/api/entrar", { token })
      .then((r) => {
        qc.setQueryData(["yo"], r.socio);
        ir("/", { replace: true });
      })
      .catch((e: Error) => setError(e.message));
  }, [ir, qc]);
  return (
    <main className="mx-auto max-w-md px-4 py-20">
      <h1 className="text-xl font-semibold">Panel de socios</h1>
      <p className="mt-3 text-tinta-2" role={error ? "alert" : "status"}>{error ?? "Entrando…"}</p>
    </main>
  );
}

/** Sin sesión: se entra con el enlace del bot o, en la app instalada (donde el enlace se abriría en el navegador), con su código. */
function SinSesion() {
  const qc = useQueryClient();
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setOcupado(true);
    try {
      const r = await api.post<{ socio: Socio }>("/api/entrar", { codigo });
      qc.setQueryData(["yo"], r.socio);
    } catch (x) {
      setError((x as Error).message);
    } finally {
      setOcupado(false);
    }
  };
  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-xl font-semibold">Panel de socios</h1>
      <p className="mt-3 text-tinta-2">
        Escribe <b className="font-mono">/panel</b> al bot de Telegram. Te manda un enlace (ábrelo y listo) y un código de 8 cifras para entrar aquí.
      </p>
      <form onSubmit={entrar} className="mt-6 space-y-3" aria-label="Entrar con código">
        <Campo etiqueta="Código" inputMode="numeric" autoComplete="one-time-code" placeholder="1234 5678" value={codigo} onChange={(e) => setCodigo(e.target.value)} required />
        {error && <p role="alert" className="text-sm text-sale">{error}</p>}
        <Boton type="submit" variante="primario" className="w-full" disabled={ocupado}>Entrar</Boton>
      </form>
      <p className="mt-6 text-[13px] text-tinta-3">La sesión se queda abierta en este dispositivo. Para cerrarla en todos: /panel cerrar.</p>
    </main>
  );
}

function BotonApuntar() {
  const abrir = useApuntar();
  return (
    <Boton variante="primario" onClick={() => abrir({ tipo: "venta" })}>
      Apuntar
    </Boton>
  );
}

export function App() {
  const [ruta] = useLocation();
  const yo = useYo();
  if (ruta === "/entrar") return <AvisosProvider><Entrar /></AvisosProvider>;
  if (yo.isPending) return <p className="p-8 text-tinta-3" role="status">Cargando…</p>;
  if (yo.isError) return yo.error instanceof ErrorApi && yo.error.status === 401 ? <SinSesion /> : <p className="p-8 text-sale" role="alert">{yo.error.message}</p>;

  return (
    <AvisosProvider>
      <ApuntarProvider>
        <Marco nombre={yo.data.nombre} ruta={ruta} />
      </ApuntarProvider>
    </AvisosProvider>
  );
}

function Marco({ nombre, ruta }: { nombre: string; ruta: string }) {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-regla bg-papel">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 pt-3">
          <div className="flex items-center gap-2 font-semibold">
            <svg viewBox="0 0 32 32" className="size-6" aria-hidden><rect width="32" height="32" rx="7" className="fill-tinta" /><path d="M16 6l2.9 6.2 6.7.7-5 4.6 1.4 6.6L16 20.8 10 24.1l1.4-6.6-5-4.6 6.7-.7z" className="fill-estrella" /></svg>
            Panel de socios
          </div>
          <div className="ml-auto flex items-center gap-2 text-sm">
            <Link href="/cuenta" className="hidden text-tinta-2 underline-offset-2 hover:underline sm:inline">{nombre}</Link>
            <a href="/api/exportar.xlsx" className="inline-flex min-h-9 items-center rounded-md border border-regla-2 px-3 font-medium hover:bg-fondo" download>
              Excel
            </a>
            <BotonApuntar />
          </div>
        </div>
        <nav aria-label="Secciones" className="mx-auto max-w-6xl overflow-x-auto px-4">
          <ul className="flex gap-1 pt-2">
            {NAV.map(([href, texto]) => {
              const activa = href === "/" ? ruta === "/" : ruta.startsWith(href);
              return (
                <li key={href}>
                  <Link href={href} aria-current={activa ? "page" : undefined} className={`block whitespace-nowrap border-b-2 px-2.5 pb-2.5 pt-1 text-sm ${activa ? "border-estrella font-semibold text-tinta" : "border-transparent text-tinta-2 hover:text-tinta"}`}>
                    {texto}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Switch>
          <Route path="/" component={Inicio} />
          <Route path="/comercios" component={Comercios} />
          <Route path="/mapa">
            <Suspense fallback={<p className="text-tinta-3">Cargando mapa…</p>}>
              <Mapa />
            </Suspense>
          </Route>
          <Route path="/ventas" component={Ventas} />
          <Route path="/caja" component={Caja} />
          <Route path="/stock" component={Stock} />
          <Route path="/reparto" component={Reparto} />
          <Route path="/precios" component={Precios} />
          <Route path="/cuenta" component={Cuenta} />
          <Route>
            <p>Esta página no existe. <Link href="/" className="underline">Volver al resumen</Link></p>
          </Route>
        </Switch>
      </main>
    </div>
  );
}
