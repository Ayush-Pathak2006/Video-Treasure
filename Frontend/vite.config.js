import { defineConfig, loadEnv } from 'vite'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // The backend URL comes from .env.development / .env.production. Stop here if it's missing,
  // instead of building an app that can't reach the API.
  if (!loadEnv(mode, import.meta.dirname).VITE_API_BASE_URL) {
    throw new Error(`VITE_API_BASE_URL is not set. Add it to Frontend/.env.${mode}`)
  }

  return {
    plugins: [
      tailwindcss(),
    ],
  }
})
