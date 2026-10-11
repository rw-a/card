import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import { fileURLToPath, URL } from 'node:url';

// On GitHub Pages a project site is served from https://<user>.github.io/<repo>/ ,
// so assets must be referenced relative to that sub-path. The deploy workflow
// sets VITE_BASE to "/<repo>/" automatically; locally it falls back to "/".
// If you publish to a user/organisation site (<user>.github.io) or a custom
// domain, set VITE_BASE to "/" in the workflow instead.
const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base,
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'styled-system': fileURLToPath(new URL('./styled-system', import.meta.url)),
    },
  },
  plugins: [solid()],
  build: {
    target: 'es2020',
    // The styles rely on :has(), so older browsers are out of reach anyway; targeting the
    // first versions with :has() stops the CSS minifier adding fallbacks they don't need.
    cssTarget: ['chrome105', 'edge105', 'firefox121', 'safari15.4'],
    outDir: 'dist',
    sourcemap: false,
    rolldownOptions: {
      checks: {
        // Panda's generated styled-system/ places /* @__PURE__ */ where the bundler cannot use it;
        // the warning is about generated code we do not edit, and it floods the build log.
        invalidAnnotation: false,
        // The timing report is informational and printed on every build.
        pluginTimings: false,
      },
    },
  },
});
