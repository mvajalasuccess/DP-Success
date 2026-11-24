import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { planningInternalUrl, planningPublicUrl } from "./lib/planning-url";

export function getRouter() {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    rewrite: {
      input: ({ url }) => planningInternalUrl(url),
      output: ({ url }) => planningPublicUrl(url),
    },
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
