import { defineConfig } from 'vite';

// version.txt lets the lab workflow wait until this exact commit is live.
export default defineConfig({
  build: { target: 'es2020', sourcemap: false, chunkSizeWarningLimit: 1500 },
  plugins: [{
    name: 'version-file',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.txt', source: process.env.VERCEL_GIT_COMMIT_SHA || 'dev' });
    },
  }],
});
