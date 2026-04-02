import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        external: ['koffi', 'better-sqlite3']
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        // Bundle @electron-toolkit/preload instead of leaving it as external require()
        // Required because sandbox: true prevents require() of npm packages
        external: ['electron']
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()]
  }
})
