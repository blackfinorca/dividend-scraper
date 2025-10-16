#!/usr/bin/env node

// Lightweight wrapper so `node dev` behaves like `npm run dev`
const { createServer } = require('vite');
const path = require('node:path');

async function start() {
  const server = await createServer({
    configFile: path.resolve(process.cwd(), 'vite.config.mjs'),
  });

  await server.listen();
  server.printUrls();
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
