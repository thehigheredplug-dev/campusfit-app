import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    allowedHosts: [
      "unexpected-viewing-customized-discusses.trycloudflare.com",
      "campusfit.thehigheredplug.com",
    ],
  },
});
