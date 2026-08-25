import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

// The app's vite config loads the React Router plugin, which the unit tests
// don't need. This gives them the same "@/" alias and nothing else.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./app", import.meta.url)),
      "@workspace/ui": fileURLToPath(new URL("../../packages/ui/src", import.meta.url)),
    },
  },
  test: { environment: "node", include: ["app/**/*.test.ts"] },
})
