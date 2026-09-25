import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // O DP Success é uma aplicação interna autenticada. No preview,
    // evitamos SSR para que a inicialização dependa apenas do navegador
    // e da sessão Supabase já existente.
    spa: {
      enabled: true,
    },
  },
});
