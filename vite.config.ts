import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/form-1065-interviewer/',
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
