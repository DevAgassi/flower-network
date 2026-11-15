import { defineConfig } from 'vite';
import { devtools } from '@tanstack/devtools-vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { nitro } from 'nitro/vite';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    devtools(),
    // validate-env runs once at server start and exits on invalid configuration.
    nitro({ plugins: ['./src/server-plugins/validate-env.ts'] }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
});
