import { defineConfig } from "vite";

export default defineConfig({
  // dev server proxies to docs/ for data files
  publicDir: "../docs",
  
  build: {
    // output directly to docs/ for github pages
    outDir: "../docs",
    emptyOutDir: false, // don't nuke our data files!
    rollupOptions: {
      output: {
        // keep assets in assets/ subfolder
        assetFileNames: "assets/[name]-[hash][extname]",
        chunkFileNames: "assets/[name]-[hash].js",
        entryFileNames: "assets/[name]-[hash].js",
      },
    },
  },
  
  // base path for github pages (adjust if using custom domain)
  base: "./",
});

