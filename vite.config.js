import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  // Relative base so the same build works on:
  // - GitHub Pages project path: https://<user>.github.io/<repo>/
  // - Custom domain root: https://example.com/
  base: './',
  plugins: [vue()],
})
