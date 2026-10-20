import { lazy, Suspense, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Route, Switch, useLocation } from "wouter";
import { api, ErrorApi } from "./lib/api";
import type { Socio } from "./lib/tipos";
import { Boton } from "./componentes/ui";
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

function SinSesion() {
  return (
    <main className="mx-auto max-w-md px-4 py-20">
      <h1 className="text-xl font-semibold">Panel de socios</h1>
      <p className="mt-3 text-tinta-2">Para entrar, escribe <b className="font-mono">/panel</b> al bot de Telegram y abre el enlace que te manda por privado.</p>
    </main>
  );
}

export function App() {
  const [ruta] = useLocation();
  const yo = useYo();
  const qc = useQueryClient();
  if (ruta === "/entrar") return <Entrar />;
  if (yo.isPending) return <p className="p-8 text-tinta-3" role="status">Cargando…</p>;
  if (yo.isError) return yo.error instanceof ErrorApi && yo.error.status === 401 ? <SinSesion /> : <p className="p-8 text-sale" role="alert">{yo.error.message}</p>;

  const salir = async () => {
    await api.post("/api/salir");
    qc.clear();
    location.href = "/";
  };
  return (
    <div className="min-h-dvh">
      <header className="border-b border-regla bg-papel">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 pt-3">
          <div className="flex items-center gap-2 font-semibold">
            <svg viewBox="0 0 32 32" className="size-6" aria-hidden><rect width="32" height="32" rx="7" className="fill-tinta" /><path d="M16 6l2.9 6.2 6.7.7-5 4.6 1.4 6.6L16 20.8 10 24.1l1.4-6.6-5-4.6 6.7-.7z" className="fill-estrella" /></svg>
            Panel de socios
          </div>
          <div className="ml-auto flex items-center gap-2 text-sm">
            <span className="text-tinta-2">{yo.data.nombre}</span>
            <a href="/api/exportar.xlsx" className="inline-flex min-h-9 items-center rounded-md border border-regla-2 px-3 font-medium hover:bg-fondo" download>
              Descargar Excel
            </a>
            <Boton variante="plano" onClick={salir}>Salir</Boton>
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
          <Route>
            <p>Esta página no existe. <Link href="/" className="underline">Volver al resumen</Link></p>
          </Route>
        </Switch>
      </main>
    </div>
  );
}
