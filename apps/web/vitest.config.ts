import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vitest/config'

/**
 * Makes `import mark from './mark.png'` mean under Vitest what it means under Next.
 *
 * Next resolves a static image import to an object carrying the file's own dimensions, and
 * `next/image` reads them. Vite resolves it to a bare URL string, so a component that asks
 * an import how tall it is gets `undefined` in tests and a real number in the browser —
 * which is a difference the tests would report as a bug in the component.
 *
 * The dimensions come out of the PNG header: an IHDR chunk always begins at byte 8, with the
 * width and height as big-endian 32-bit integers at 16 and 20.
 */
function nextStaticImages(): Plugin {
  return {
    name: 'next-static-images',
    // Before Vite's own asset handling, which would otherwise resolve the import to a URL.
    enforce: 'pre',
    load(id) {
      const [path] = id.split('?')
      if (!path?.endsWith('.png')) return null
      const header = readFileSync(path).subarray(16, 24)
      const width = header.readUInt32BE(0)
      const height = header.readUInt32BE(4)
      return `export default ${JSON.stringify({ src: path, width, height })}`
    },
  }
}

export default defineConfig({
  plugins: [react(), nextStaticImages()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    // Playwright owns e2e; vitest must not try to run those specs.
    exclude: ['node_modules/**', 'e2e/**', '.next/**'],
  },
})
