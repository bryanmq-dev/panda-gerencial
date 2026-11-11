import Link from "next/link";
import "./globals.css";

export const metadata = { title: "Panda · Ventas e inspección" };
// Todo se lee de la base en cada pedido: nada se genera en el build.
export const dynamic = "force-dynamic";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <header className="barra">
          <strong>Helados Panda</strong>
          <small>Sistema transaccional</small>
          <nav>
            <Link href="/">Ventas</Link>
            <Link href="/lotes">Lotes</Link>
            <Link href="/inspeccion">Inspección de cámaras</Link>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
