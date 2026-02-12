import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "happy-dom",
    setupFiles: ["src/test/setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["node_modules", ".next"],
    projects: [
      {
        resolve: {
          alias: {
            "@": path.resolve(__dirname, "src"),
          },
        },
        test: {
          name: "unit",
          environment: "happy-dom",
          setupFiles: ["src/test/setup.ts"],
          include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
          exclude: ["node_modules", ".next", "src/test/e2e/**"],
          fileParallelism: false,
        },
      },
      {
        resolve: {
          alias: {
            "@": path.resolve(__dirname, "src"),
          },
        },
        test: {
          name: "e2e",
          setupFiles: ["src/test/setup.ts"],
          include: ["src/test/e2e/**/*.test.ts"],
        },
      },
    ],
  },
});
