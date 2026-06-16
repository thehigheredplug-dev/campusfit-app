import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ["cars-locked-chicago-catalogs.trycloudflare.com", "campusfit.thehigheredplug.com"],
  },
});
