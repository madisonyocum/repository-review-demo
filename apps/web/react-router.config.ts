import type { Config } from "@react-router/dev/config"

export default {
  // No backend, no API calls. SPA mode keeps the whole demo in the browser and
  // takes hydration mismatches (random samples, file reads) off the table.
  ssr: false,
  basename: process.env.GH_PAGES ? "/repository-review-demo/" : "/",
} satisfies Config
