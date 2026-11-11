import Chat from "../_c/Chat";

export default function Asistente() {
  return (
    <>
      <h1>Asistente de indicadores</h1>
      <p className="bajada">
        Describa qué quiere ver. El asistente conoce la estructura del almacén —tablas, columnas y categorías, no los
        registros—, arma la consulta, la prueba y se la muestra. Usted la revisa, la ajusta si hace falta y decide si se guarda.
      </p>
      <Chat />
    </>
  );
}
