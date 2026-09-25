// Custom TanStack Start server entry for the Lovable preview.
// The dynamic import avoids SSR/HMR re-export issues in the Start server facade.

type StartHandler = (
  request: Request,
  env?: unknown,
  ctx?: unknown,
) => Promise<Response> | Response;

let cachedFetch: StartHandler | null = null;

async function getFetch(): Promise<StartHandler> {
  if (cachedFetch) return cachedFetch;

  const mod = await import("@tanstack/react-start/server");
  cachedFetch = mod.createStartHandler(mod.defaultStreamHandler) as StartHandler;
  return cachedFetch;
}

if (import.meta.hot) {
  import.meta.hot.accept(() => {
    cachedFetch = null;
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const handler = await getFetch();
    return handler(request, env, ctx);
  },
};
