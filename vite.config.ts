import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "bcdice-js/lib/bcdice": path.resolve(__dirname, "./node_modules/bcdice-js/lib/BCDice.js"),
      "bcdice-js/lib/bcdice.js": path.resolve(__dirname, "./node_modules/bcdice-js/lib/BCDice.js"),
    },
  },
}));
