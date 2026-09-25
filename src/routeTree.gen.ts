/* eslint-disable */
// @ts-nocheck
import { Route as rootRoute } from "./routes/__root";
import { Route as IndexRoute } from "./routes/index";
import { Route as LoginRoute } from "./routes/login";

export interface FileRoutesByFullPath {
  "/": typeof IndexRoute;
  "/login": typeof LoginRoute;
}

export interface FileRoutesByTo {
  "/": typeof IndexRoute;
  "/login": typeof LoginRoute;
}

export interface FileRoutesById {
  __root__: typeof rootRoute;
  "/": typeof IndexRoute;
  "/login": typeof LoginRoute;
}

export interface FileRouteTypes {
  fileRoutesByFullPath: FileRoutesByFullPath;
  fullPaths: "/" | "/login";
  fileRoutesByTo: FileRoutesByTo;
  to: "/" | "/login";
  id: "__root__" | "/" | "/login";
  fileRoutesById: FileRoutesById;
}

export interface RootRouteChildren {
  IndexRoute: typeof IndexRoute;
  LoginRoute: typeof LoginRoute;
}

const rootRouteChildren: RootRouteChildren = {
  IndexRoute,
  LoginRoute,
};

export const routeTree = rootRoute
  ._addFileChildren(rootRouteChildren)
  ._addFileTypes<FileRouteTypes>();

/* ROUTE_MANIFEST_START
{
  "routes": {
    "__root__": {
      "filePath": "__root.tsx",
      "children": [
        "/",
        "/login"
      ]
    },
    "/": {
      "filePath": "index.tsx"
    },
    "/login": {
      "filePath": "login.tsx"
    }
  }
}
ROUTE_MANIFEST_END */
