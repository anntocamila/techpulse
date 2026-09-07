import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Published as a GitHub Pages *project* site, so production assets live under
// /techpulse/. Local dev and preview keep the root base.
// https://vite.dev/config/
export default defineConfig({
  base: process.env.GITHUB_PAGES ? '/techpulse/' : '/',
  plugins: [react()],
})
