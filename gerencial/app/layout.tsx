import Link from "next/link";
import "./globals.css";

export const metadata = { title: "Panda · Control gerencial" };
// Todo se lee del almacén en cada pedido: nada se genera en el build.
export const dynamic = "force-dynamic";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <header className="barra">
          <strong>Helados Panda</strong>
          <small>Sistema gerencial</small>
          <nav>
            <Link href="/">Control de operaciones</Link>
            <Link href="/kpi/nuevo">Nuevo indicador</Link>
            <Link href="/asistente">Asistente</Link>
            <Link href="/etl">Carga de datos</Link>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
