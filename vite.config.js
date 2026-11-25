import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// npm run build       → نسخة الإنتاج (Netlify) مع Supabase
// npm run build:demo  → ملف HTML واحد للعرض التجريبي (بيانات في المتصفح)
export default defineConfig(({ mode }) => ({
  plugins: mode === 'demo' ? [react(), viteSingleFile()] : [react()],
  build: mode === 'demo' ? { outDir: 'dist-demo' } : {},
}))
