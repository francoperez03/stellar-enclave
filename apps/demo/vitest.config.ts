import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    environment: "node",
    projects: [
      { extends: true, test: { name: "unit", include: ["test/unit/**/*.spec.ts"] } },
      { extends: true, test: { name: "e2e", include: ["test/e2e/**/*.spec.ts"] } },
    ],
  },
});
