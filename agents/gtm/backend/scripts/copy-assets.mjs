// Copies every non-.ts file from src/ into dist/, preserving directory
// structure. tsc only emits JS, so assets like db/schema.sql never reach
// dist/ — and migrate.ts reads schema.sql relative to its own compiled
// location (dist/db/), which crashed with ENOENT in production.
import { cpSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function copyAssets(srcDir, distDir) {
  for (const entry of readdirSync(srcDir)) {
    const srcPath = join(srcDir, entry);
    const distPath = join(distDir, entry);
    if (statSync(srcPath).isDirectory()) {
      copyAssets(srcPath, distPath);
    } else if (!entry.endsWith(".ts")) {
      mkdirSync(dirname(distPath), { recursive: true });
      cpSync(srcPath, distPath);
      console.log("copied", srcPath, "->", distPath);
    }
  }
}

copyAssets(join(packageRoot, "src"), join(packageRoot, "dist"));
