import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import Icons from "unplugin-icons/vite";
import { loadEnv } from "vite";

export default defineConfig(({ mode }) => ({
  plugins: [vue(), tailwindcss(), Icons({ compiler: "vue3" })],
  server: {
    proxy: {
      "/api": {
        target:
          process.env.API_PROXY_TARGET ??
          loadEnv(mode, process.cwd(), "").API_PROXY_TARGET ??
          "http://127.0.0.1:3000",
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    environmentOptions: { jsdom: { url: "http://localhost:5173" } },
    include: ["test/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
    clearMocks: true,
    env: { DEBUG_PRINT_LIMIT: "1800" },
  },
}));
