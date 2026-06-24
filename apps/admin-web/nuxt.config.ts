import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  ssr: false,
  devtools: { enabled: false },
  components: false,
  css: ['~/assets/css/main.css'],
  vite: {
    plugins: [tailwindcss()]
  },
  runtimeConfig: {
    public: {
      apiBaseUrl: process.env.NUXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001'
    }
  },
  app: {
    head: {
      title: 'VPN Admin',
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }]
    }
  },
  compatibilityDate: '2026-06-16'
})
