import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Read SHARED_SECRET from server/.env at dev-server startup (not bundled to the browser). */
function readServerSharedSecret(): string {
  const envPath = path.resolve(__dirname, "../server/.env");
  try {
    const content = fs.readFileSync(envPath, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const m = /^SHARED_SECRET\s*=\s*(.*)$/.exec(trimmed);
      if (m) {
        let v = m[1].trim();
        if (
          (v.startsWith('"') && v.endsWith('"')) ||
          (v.startsWith("'") && v.endsWith("'"))
        ) {
          v = v.slice(1, -1);
        }
        return v;
      }
    }
  } catch {
    /* no server/.env */
  }
  return "";
}

const sharedSecret = readServerSharedSecret();

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Only the scrutiny endpoint still hits the Express server.
      // CRUD → Supabase Postgres, LLM endpoints → Supabase Edge Functions.
      "/api/scrutiny": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
        configure: (proxy) => {
          if (sharedSecret) {
            proxy.on("proxyReq", (proxyReq) => {
              proxyReq.setHeader("X-Shared-Secret", sharedSecret);
            });
          }
        },
      },
    },
  },
});
