import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    tailwindcss(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      injectRegister: false,
      registerType: "autoUpdate",
      manifest: false,
      injectManifest: {
        globPatterns: ["**/*.{html,js,css,ico,png,svg,webmanifest,xml,txt}"],
      },
    }),
  ],
});
