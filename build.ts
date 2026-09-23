import { rm } from "node:fs/promises";
import path from "node:path";

const outdir = path.join(process.cwd(), "dist");
await rm(outdir, { recursive: true, force: true });

const entrypoints = [...new Bun.Glob("src/**/*.html").scanSync()];

const result = await Bun.build({
  entrypoints,
  outdir,
  minify: true,
  target: "browser",
  sourcemap: "linked",
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
});

for (const output of result.outputs) {
  console.log(` ${path.relative(process.cwd(), output.path)}  ${(output.size / 1024).toFixed(1)} KB`);
}

for (const filename of new Bun.Glob("*.json").scanSync({ cwd: path.join(process.cwd(), "catalog") })) {
  await Bun.write(path.join(outdir, "catalog", filename), Bun.file(path.join(process.cwd(), "catalog", filename)));
}

await Bun.write(path.join(outdir, "_headers"), Bun.file(path.join(process.cwd(), "static", "_headers")));
