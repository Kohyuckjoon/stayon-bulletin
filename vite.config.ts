import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  // 개발 서버(npm run dev)에는 메인 페이지 교회 링크 목록 주소가 없어서 실제 사이트 것을 받아온다
  server: {
    proxy: {
      '/searchable-churches.json': {
        target: 'https://asia-northeast3-stayonsbplatform.cloudfunctions.net',
        changeOrigin: true,
        rewrite: (p) => '/bulletinSitemap' + p,
      },
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],
})
