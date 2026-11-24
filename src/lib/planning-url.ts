export const PLANNING_PATH = "/planejamento-mensal";
export const PLANNING_SCREEN = "planejamento-mensal";

export function planningPublicUrl(url: URL) {
  if (url.pathname !== "/") return;
  const screen = url.searchParams.get("tela");
  if (screen && screen !== PLANNING_SCREEN) return;

  url.pathname = PLANNING_PATH;
  url.searchParams.delete("tela");
  return url;
}

export function planningInternalUrl(url: URL) {
  if (url.pathname !== PLANNING_PATH && url.pathname !== `${PLANNING_PATH}/`) return;

  url.pathname = "/";
  url.searchParams.set("tela", PLANNING_SCREEN);
  return url;
}
