// @lovable.dev/vite-tanstack-config já fornece os plugins do TanStack Start,
// React, Tailwind, alias @, HMR e a integração de preview.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Usa o wrapper de SSR existente para manter os erros do servidor
    // visíveis no preview sem substituir o pipeline padrão da Lovable.
    server: { entry: "server" },
  },
});
