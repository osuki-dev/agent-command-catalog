import { serve } from "bun";
import { agents } from "../scripts/catalog";
import index from "./index.html";

const catalogFiles = new Set(["index.json", ...agents.map((agent) => `${agent}.json`)]);

const server = serve({
  routes: {
    "/catalog/:file": async req => {
      if (!catalogFiles.has(req.params.file)) return new Response("Not found", { status: 404 });
      return new Response(Bun.file(`catalog/${req.params.file}`), { headers: { "content-type": "application/json; charset=utf-8" } });
    },
    "/*": index,
  },

  development: process.env.NODE_ENV !== "production" && {
    // Enable browser hot reloading in development
    hmr: true,

    // Echo console logs from the browser to the server
    console: true,
  },
});

console.log(`Server running at ${server.url}`);
