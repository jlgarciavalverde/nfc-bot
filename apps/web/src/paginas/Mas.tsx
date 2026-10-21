import { Link } from "wouter";
import { CaretRight, FileXls, SquaresFour } from "@phosphor-icons/react";
import { useYo } from "../lib/consultas";
import { SECUNDARIAS } from "../marco/Marco";
import { Tarjeta, Titulo } from "../ui/Superficies";

export default function Mas() {
  const yo = useYo();
  const esAdmin = yo.data?.rol === "admin";
  const grupos = [SECUNDARIAS.filter((s) => !s.admin && s.href !== "/cuenta"), SECUNDARIAS.filter((s) => s.admin && esAdmin), SECUNDARIAS.filter((s) => s.href === "/cuenta")].filter((g) => g.length);
  return (
    <>
      <Titulo>Más</Titulo>
      <div className="space-y-5">
        {grupos.map((g, i) => (
          <Tarjeta key={i} className="divide-y divide-borde overflow-hidden">
            {g.map((s) => {
              const I = s.icono;
              return (
                <Link key={s.href} href={s.href} className="flex min-h-14 items-center gap-3 px-4 text-[16px] font-semibold transition-colors hover:bg-hundido">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-hundido"><I size={20} /></span>
                  {s.texto}
                  <CaretRight size={16} className="ml-auto text-tinta-3" aria-hidden />
                </Link>
              );
            })}
          </Tarjeta>
        ))}
        <Tarjeta className="divide-y divide-borde overflow-hidden">
          <a href="/api/exportar.xlsx" download className="flex min-h-14 items-center gap-3 px-4 text-[16px] font-semibold hover:bg-hundido">
            <span className="flex size-9 items-center justify-center rounded-lg bg-hundido"><FileXls size={20} /></span> Descargar todo en Excel
          </a>
          <Link href="/galeria" className="flex min-h-14 items-center gap-3 px-4 text-[16px] font-semibold hover:bg-hundido">
            <span className="flex size-9 items-center justify-center rounded-lg bg-hundido"><SquaresFour size={20} /></span> Galería de diseño
          </Link>
        </Tarjeta>
      </div>
    </>
  );
}
