import Editor from "../../_c/Editor";

export default function Nuevo() {
  return (
    <>
      <h1>Nuevo indicador</h1>
      <p className="bajada">
        Un indicador es una consulta guardada sobre el almacén. Escríbala, revise la vista previa y las tablas que
        enlaza, y guárdela: queda versionada y disponible para ponerle objetivos.
      </p>
      <section className="tarjeta"><Editor /></section>
    </>
  );
}
