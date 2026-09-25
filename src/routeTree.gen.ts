/* eslint-disable */
// @ts-nocheck
import { Route as rootRouteImport } from "./routes/__root";
import { Route as IndexRouteImport } from "./routes/index";
import { Route as LoginRouteImport } from "./routes/login";

const IndexRoute = IndexRouteImport.update({ id: "/", path: "/", getParentRoute: () => rootRouteImport } as any);
const LoginRoute = LoginRouteImport.update({ id: "/login", path: "/login", getParentRoute: () => rootRouteImport } as any);

export interface FileRoutesByFullPath {
  "/": typeof IndexRoute;
  "/login": typeof LoginRoute;
}
export interface FileRoutesByTo extends FileRoutesByFullPath {}
export interface FileRoutesById {
  __root__: typeof rootRouteImport;
  "/": typeof IndexRoute;
  "/login": typeof LoginRoute;
}
export interface FileRouteTypes {
  fileRoutesByFullPath: FileRoutesByFullPath;
  fullPaths: keyof FileRoutesByFullPath;
  fileRoutesByTo: FileRoutesByTo;
  to: keyof FileRoutesByFullPath;
  id: keyof FileRoutesById;
  fileRoutesById: FileRoutesById;
}

declare module "@tanstack/react-router" {
  interface FileRoutesByPath {
    "/": { id: "/"; path: "/"; fullPath: "/"; preLoaderRoute: typeof IndexRouteImport; parentRoute: typeof rootRouteImport };
    "/login": { id: "/login"; path: "/login"; fullPath: "/login"; preLoaderRoute: typeof LoginRouteImport; parentRoute: typeof rootRouteImport };
  }
}

const rootRouteChildren = { IndexRoute, LoginRoute };
export const routeTree = rootRouteImport._addFileChildren(rootRouteChildren)._addFileTypes<FileRouteTypes>();

import type { getRouter } from "./router.tsx";
import type { startInstance } from "./start.ts";

declare module "@tanstack/react-start" {
  interface Register {
    ssr: true;
    router: Awaited<ReturnType<typeof getRouter>>;
    config: Awaited<ReturnType<typeof startInstance.getOptions>>;
  }
}
