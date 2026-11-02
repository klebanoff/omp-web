/**
 * Hutch workspace config (Electrobun 2.x).
 *
 * `packageManager: "bun"` keeps `bun.lock` the only lockfile: without it Hutch
 * would resolve dependencies itself and write a second `hutch.lock`, so the
 * desktop build could ship different package versions than `bun run app`.
 */
export default {
  packageManager: "bun",
  scripts: {
    dev: ["hutch", "electrobun", "dev"],
    build: ["hutch", "electrobun", "build", "--env=stable"],
  },
};
