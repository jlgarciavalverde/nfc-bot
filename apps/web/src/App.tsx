import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, Redirect, Route, Switch, useLocation } from "wouter";
import { api, ErrorApi } from "./lib/api";
import { useYo } from "./lib/consultas";
import type { Socio } from "./lib/tipos";
import { AvisosProvider } from "./lib/acciones";
import { ApuntarProvider } from "./apuntar/Apuntar";
import { BuscadorProvider } from "./marco/Buscador";
import { Marco } from "./marco/Marco";
import { Boton } from "./ui/Boton";
import { Campo } from "./ui/Campos";
import { Esqueleto, EstrellaMarca, Vacio } from "./ui/Superficies";
import { Hoy } from "./paginas/Hoy";

// Hoy va en el paquete inicial; el resto se carga al entrar (y se precarga al pasar por el menú)
const Comercios = lazy(() => import("./paginas/Comercios"));
const FichaComercio = lazy(() => import("./paginas/FichaComercio"));
const Caja = lazy(() => import("./paginas/Caja"));
const Ventas = lazy(() => import("./paginas/Ventas"));
const Stock = lazy(() => import("./paginas/Stock"));
const Placas = lazy(() => import("./paginas/Placas"));
const Precios = lazy(() => import("./paginas/Precios"));
const Ajustes = lazy(() => import("./paginas/Ajustes"));
const Socios = lazy(() => import("./paginas/Socios"));
const Auditoria = lazy(() => import("./paginas/Auditoria"));
const Cuenta = lazy(() => import("./paginas/Cuenta"));
const Mas = lazy(() => import("./paginas/Mas"));
const Galeria = lazy(() => import("./paginas/Galeria"));

export function App() {
  const [ruta] = useLocation();
  const yo = useYo();
  if (ruta === "/entrar") return <Pantalla><Entrar /></Pantalla>;
  if (yo.isPending) return <Pantalla><Esqueleto lineas={2} /></Pantalla>;
  if (yo.isError) return yo.error instanceof ErrorApi && yo.error.status === 401 ? <Pantalla><SinSesion /></Pantalla> : <Pantalla><p className="text-sale" role="alert">{yo.error.message}</p></Pantalla>;
  const esAdmin = yo.data.rol === "admin";
  const soloAdmin = (c: ReactNode) => (esAdmin ? c : <Redirect to="/" />);
  return (
    <AvisosProvider>
      <ApuntarProvider>
        <BuscadorProvider>
          <Marco nombre={yo.data.nombre} esAdmin={esAdmin}>
            <Suspense fallback={<Esqueleto lineas={4} alto="h-20" />}>
              <Switch>
                <Route path="/" component={Hoy} />
                <Route path="/comercios" component={Comercios} />
                <Route path="/comercios/:id">{(p) => <FichaComercio id={Number(p.id)} />}</Route>
                <Route path="/mapa"><Redirect to="/comercios?vista=mapa" /></Route>
                <Route path="/caja" component={Caja} />
                <Route path="/reparto"><Redirect to="/caja?ver=reparto" /></Route>
                <Route path="/ventas" component={Ventas} />
                <Route path="/stock" component={Stock} />
                <Route path="/placas" component={Placas} />
                <Route path="/precios" component={Precios} />
                <Route path="/cuenta" component={Cuenta} />
                <Route path="/mas" component={Mas} />
                <Route path="/galeria" component={Galeria} />
                <Route path="/ajustes">{soloAdmin(<Ajustes />)}</Route>
                <Route path="/socios">{soloAdmin(<Socios />)}</Route>
                <Route path="/auditoria">{soloAdmin(<Auditoria />)}</Route>
                <Route>
                  <Vacio titulo="Esta página no existe">
                    <Link href="/" className="font-semibold underline">Volver a Hoy</Link>
                  </Vacio>
                </Route>
              </Switch>
            </Suspense>
          </Marco>
        </BuscadorProvider>
      </ApuntarProvider>
    </AvisosProvider>
  );
}

/** Pantallas sin sesión: la placa sobre la base negra. */
function Pantalla({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col bg-base px-4 py-10 text-tinta">
      <div className="mx-auto mt-[6vh] w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3 text-sobre-base">
          <EstrellaMarca className="size-10" />
          <div>
            <div className="text-[20px] font-bold leading-tight">Socios NFC</div>
            <div className="text-[13px] text-sobre-base-2">Panel de gestión</div>
          </div>
        </div>
        <div className="tarjeta-placa bg-superficie p-6">{children}</div>
      </div>
    </main>
  );
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
    <>
      <h1 className="text-[22px] font-bold">{error ? "No se ha podido entrar" : "Entrando…"}</h1>
      <p className="mt-2 text-tinta-2" role={error ? "alert" : "status"}>{error ?? "Un momento."}</p>
      {error && <Link href="/" className="mt-4 inline-block font-semibold underline">Entrar con código</Link>}
    </>
  );
}

/** Sin sesión: se entra con el enlace del bot o, en la app instalada, con su código de 8 cifras. */
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
    <>
      <h1 className="text-[22px] font-bold">Entrar</h1>
      <p className="mt-2 text-[14px] text-tinta-2">
        Escribe <b className="font-mono">/panel</b> al bot de Telegram. Te manda un enlace (ábrelo y listo) y un código de 8 cifras para entrar aquí.
      </p>
      <form onSubmit={entrar} className="mt-5 space-y-3" aria-label="Entrar con código">
        <Campo etiqueta="Código" inputMode="numeric" autoComplete="one-time-code" placeholder="1234 5678" value={codigo} onChange={(e) => setCodigo(e.target.value)} error={error} className="!font-mono !text-[22px] tracking-[0.2em]" required />
        <Boton type="submit" variante="primario" tamano="lg" className="w-full" cargando={ocupado}>Entrar</Boton>
      </form>
      <p className="mt-5 text-[13px] text-tinta-3">La sesión se queda abierta en este dispositivo. Para cerrarla en todos: /panel cerrar.</p>
    </>
  );
}
