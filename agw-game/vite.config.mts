import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command }) => ({
  plugins: [react()],
  publicDir: command === 'serve' ? "../" : false,
  server: {
    port: 5173
  }
}));
