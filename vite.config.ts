import { execSync } from 'node:child_process'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/** いま動いているのがどのバージョンかわかるように、ビルドした日時とコミットを埋め込む */
function commitId(): string {
  // GitHub Actions ではここに入っている
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return ''
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages などサブパスに置いても動くように相対パスにする
  base: './',
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __BUILD_COMMIT__: JSON.stringify(commitId()),
  },
})
