import type { ElectrobunConfig } from "electrobun";

/**
 * Electrobun packaging for the desktop build.
 *
 * The main process (`desktop/main.ts`) starts the same Bun server as
 * `bun run app` and points a native webview at it, so the client keeps one
 * origin: HTTP, SSE and the terminal WebSocket all stay where they are.
 *
 * `node-pty` and `sharp` are native and dynamic, so they cannot be bundled:
 * they are marked `external` and copied as packages (staged by
 * `scripts/desktop-stage-native.ts` in the preBuild hook) so the bundled
 * main process resolves them from `Resources/app/node_modules` like a normal
 * install.
 */
export default {
  app: {
    // Keep in sync with package.json.
    name: "omp-web",
    identifier: "com.kahme247.ompweb",
    version: "0.6.0",
    description: "Local console for the omp agent",
  },
  build: {
    mainProcess: "bun",
    bun: {
      entrypoint: "desktop/main.ts",
      external: ["node-pty", "sharp"],
    },
    copy: {
      "web/dist": "web",
      ".tmp/desktop-native/node_modules": "node_modules",
    },
  },
  scripts: {
    preBuild: "./scripts/desktop-prebuild.ts",
  },
} satisfies ElectrobunConfig;
