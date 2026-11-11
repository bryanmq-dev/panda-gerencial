import type { NextConfig } from "next";

// standalone: la imagen de Docker lleva solo lo que el servidor necesita
const config: NextConfig = { output: "standalone" };
export default config;
