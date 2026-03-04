import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Servimos también los archivos estáticos (incluido game7.html) desde la carpeta padre
  publicDir: "../",
  server: {
    port: 5173
  }
});
