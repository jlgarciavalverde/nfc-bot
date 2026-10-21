import { createContext, useContext } from "react";

/** Dentro de un asistente por pasos: si es el último (los campos ponen la tecla «Siguiente» o «Hecho» del teclado). */
export const ContextoPaso = createContext<{ ultimo: boolean } | null>(null);
export const usePaso = () => useContext(ContextoPaso);
