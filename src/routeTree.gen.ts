/* eslint-disable */
// @ts-nocheck
import { Route as rootRoute } from "./routes/__root";
import { Route as indexRoute } from "./routes/index";
import { Route as loginRoute } from "./routes/login";

const IndexRoute = indexRoute.update({
  id: "/",
  path: "/",
  getParentRoute: () => rootRoute,
});
const LoginRoute = loginRoute.update({
  id: "/login",
  path: "/login",
  getParentRoute: () => rootRoute,
});

const routeTree = rootRoute._addFileChildren({
  IndexRoute,
  LoginRoute,
})._addFileTypes();

export { routeTree };
