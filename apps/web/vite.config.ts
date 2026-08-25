import { reactRouter } from "@react-router/dev/vite"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"

// GitHub Pages serves a project site from a /<repo>/ subpath, so asset URLs
// need that prefix baked in. Local dev and any other host stay at "/".
const base = process.env.GH_PAGES ? "/repository-review-demo/" : "/"

export default defineConfig({
  base,
  resolve: { tsconfigPaths: true },
  plugins: [tailwindcss(), reactRouter()],
})
