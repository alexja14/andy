import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves the site from /<repo>/, not from /.
  // In GitHub Actions, GITHUB_REPOSITORY is like "owner/repo".
  base: process.env.GITHUB_REPOSITORY ? `/${process.env.GITHUB_REPOSITORY.split('/')[1]}/` : '/',
  plugins: [vue()],
})
