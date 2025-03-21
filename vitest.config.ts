import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";
import { config } from "dotenv";

config();

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" },
      },
    },
  },
});
