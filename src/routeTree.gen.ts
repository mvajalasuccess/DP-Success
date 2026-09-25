/* eslint-disable */

// @ts-nocheck

// Generated route tree kept in sync with the file routes in src/routes.

import { Route as rootRouteImport } from './routes/__root'
import { Route as IndexRouteImport } from './routes/index'
import { Route as LoginRouteImport } from './routes/login'
import { Route as FuncionariosRouteImport } from './routes/funcionarios'
import { Route as CargosRouteImport } from './routes/cargos'
import { Route as DepartamentosRouteImport } from './routes/departamentos'
import { Route as JornadasEscalasRouteImport } from './routes/jornadas-escalas'
import { Route as FechamentoPontoRouteImport } from './routes/fechamento-ponto'
import { Route as LancamentosRouteImport } from './routes/lancamentos'
import { Route as BancoHorasRouteImport } from './routes/banco-horas'
import { Route as AtestadosRouteImport } from './routes/atestados'
import { Route as OcorrenciasRouteImport } from './routes/ocorrencias'
import { Route as ComparativosRouteImport } from './routes/comparativos'
import { Route as KpisRouteImport } from './routes/kpis'
import { Route as RelatoriosRouteImport } from './routes/relatorios'
import { Route as ParametrosRouteImport } from './routes/parametros'

const IndexRoute = IndexRouteImport.update({ id: '/', path: '/', getParentRoute: () => rootRouteImport } as any)
const LoginRoute = LoginRouteImport.update({ id: '/login', path: '/login', getParentRoute: () => rootRouteImport } as any)
const FuncionariosRoute = FuncionariosRouteImport.update({ id: '/funcionarios', path: '/funcionarios', getParentRoute: () => rootRouteImport } as any)
const CargosRoute = CargosRouteImport.update({ id: '/cargos', path: '/cargos', getParentRoute: () => rootRouteImport } as any)
const DepartamentosRoute = DepartamentosRouteImport.update({ id: '/departamentos', path: '/departamentos', getParentRoute: () => rootRouteImport } as any)
const JornadasEscalasRoute = JornadasEscalasRouteImport.update({ id: '/jornadas-escalas', path: '/jornadas-escalas', getParentRoute: () => rootRouteImport } as any)
const FechamentoPontoRoute = FechamentoPontoRouteImport.update({ id: '/fechamento-ponto', path: '/fechamento-ponto', getParentRoute: () => rootRouteImport } as any)
const LancamentosRoute = LancamentosRouteImport.update({ id: '/lancamentos', path: '/lancamentos', getParentRoute: () => rootRouteImport } as any)
const BancoHorasRoute = BancoHorasRouteImport.update({ id: '/banco-horas', path: '/banco-horas', getParentRoute: () => rootRouteImport } as any)
const AtestadosRoute = AtestadosRouteImport.update({ id: '/atestados', path: '/atestados', getParentRoute: () => rootRouteImport } as any)
const OcorrenciasRoute = OcorrenciasRouteImport.update({ id: '/ocorrencias', path: '/ocorrencias', getParentRoute: () => rootRouteImport } as any)
const ComparativosRoute = ComparativosRouteImport.update({ id: '/comparativos', path: '/comparativos', getParentRoute: () => rootRouteImport } as any)
const KpisRoute = KpisRouteImport.update({ id: '/kpis', path: '/kpis', getParentRoute: () => rootRouteImport } as any)
const RelatoriosRoute = RelatoriosRouteImport.update({ id: '/relatorios', path: '/relatorios', getParentRoute: () => rootRouteImport } as any)
const ParametrosRoute = ParametrosRouteImport.update({ id: '/parametros', path: '/parametros', getParentRoute: () => rootRouteImport } as any)

export interface FileRoutesByFullPath {
  '/': typeof IndexRoute
  '/login': typeof LoginRoute
  '/funcionarios': typeof FuncionariosRoute
  '/cargos': typeof CargosRoute
  '/departamentos': typeof DepartamentosRoute
  '/jornadas-escalas': typeof JornadasEscalasRoute
  '/fechamento-ponto': typeof FechamentoPontoRoute
  '/lancamentos': typeof LancamentosRoute
  '/banco-horas': typeof BancoHorasRoute
  '/atestados': typeof AtestadosRoute
  '/ocorrencias': typeof OcorrenciasRoute
  '/comparativos': typeof ComparativosRoute
  '/kpis': typeof KpisRoute
  '/relatorios': typeof RelatoriosRoute
  '/parametros': typeof ParametrosRoute
}

export interface FileRoutesByTo extends FileRoutesByFullPath {}
export interface FileRoutesById {
  __root__: typeof rootRouteImport
  '/': typeof IndexRoute
  '/login': typeof LoginRoute
  '/funcionarios': typeof FuncionariosRoute
  '/cargos': typeof CargosRoute
  '/departamentos': typeof DepartamentosRoute
  '/jornadas-escalas': typeof JornadasEscalasRoute
  '/fechamento-ponto': typeof FechamentoPontoRoute
  '/lancamentos': typeof LancamentosRoute
  '/banco-horas': typeof BancoHorasRoute
  '/atestados': typeof AtestadosRoute
  '/ocorrencias': typeof OcorrenciasRoute
  '/comparativos': typeof ComparativosRoute
  '/kpis': typeof KpisRoute
  '/relatorios': typeof RelatoriosRoute
  '/parametros': typeof ParametrosRoute
}

export interface FileRouteTypes {
  fileRoutesByFullPath: FileRoutesByFullPath
  fullPaths: keyof FileRoutesByFullPath
  fileRoutesByTo: FileRoutesByTo
  to: keyof FileRoutesByFullPath
  id: keyof FileRoutesById
  fileRoutesById: FileRoutesById
}

declare module '@tanstack/react-router' {
  interface FileRoutesByPath {
    '/': { id: '/'; path: '/'; fullPath: '/'; preLoaderRoute: typeof IndexRouteImport; parentRoute: typeof rootRouteImport }
    '/login': { id: '/login'; path: '/login'; fullPath: '/login'; preLoaderRoute: typeof LoginRouteImport; parentRoute: typeof rootRouteImport }
    '/funcionarios': { id: '/funcionarios'; path: '/funcionarios'; fullPath: '/funcionarios'; preLoaderRoute: typeof FuncionariosRouteImport; parentRoute: typeof rootRouteImport }
    '/cargos': { id: '/cargos'; path: '/cargos'; fullPath: '/cargos'; preLoaderRoute: typeof CargosRouteImport; parentRoute: typeof rootRouteImport }
    '/departamentos': { id: '/departamentos'; path: '/departamentos'; fullPath: '/departamentos'; preLoaderRoute: typeof DepartamentosRouteImport; parentRoute: typeof rootRouteImport }
    '/jornadas-escalas': { id: '/jornadas-escalas'; path: '/jornadas-escalas'; fullPath: '/jornadas-escalas'; preLoaderRoute: typeof JornadasEscalasRouteImport; parentRoute: typeof rootRouteImport }
    '/fechamento-ponto': { id: '/fechamento-ponto'; path: '/fechamento-ponto'; fullPath: '/fechamento-ponto'; preLoaderRoute: typeof FechamentoPontoRouteImport; parentRoute: typeof rootRouteImport }
    '/lancamentos': { id: '/lancamentos'; path: '/lancamentos'; fullPath: '/lancamentos'; preLoaderRoute: typeof LancamentosRouteImport; parentRoute: typeof rootRouteImport }
    '/banco-horas': { id: '/banco-horas'; path: '/banco-horas'; fullPath: '/banco-horas'; preLoaderRoute: typeof BancoHorasRouteImport; parentRoute: typeof rootRouteImport }
    '/atestados': { id: '/atestados'; path: '/atestados'; fullPath: '/atestados'; preLoaderRoute: typeof AtestadosRouteImport; parentRoute: typeof rootRouteImport }
    '/ocorrencias': { id: '/ocorrencias'; path: '/ocorrencias'; fullPath: '/ocorrencias'; preLoaderRoute: typeof OcorrenciasRouteImport; parentRoute: typeof rootRouteImport }
    '/comparativos': { id: '/comparativos'; path: '/comparativos'; fullPath: '/comparativos'; preLoaderRoute: typeof ComparativosRouteImport; parentRoute: typeof rootRouteImport }
    '/kpis': { id: '/kpis'; path: '/kpis'; fullPath: '/kpis'; preLoaderRoute: typeof KpisRouteImport; parentRoute: typeof rootRouteImport }
    '/relatorios': { id: '/relatorios'; path: '/relatorios'; fullPath: '/relatorios'; preLoaderRoute: typeof RelatoriosRouteImport; parentRoute: typeof rootRouteImport }
    '/parametros': { id: '/parametros'; path: '/parametros'; fullPath: '/parametros'; preLoaderRoute: typeof ParametrosRouteImport; parentRoute: typeof rootRouteImport }
  }
}

const rootRouteChildren = {
  IndexRoute,
  LoginRoute,
  FuncionariosRoute,
  CargosRoute,
  DepartamentosRoute,
  JornadasEscalasRoute,
  FechamentoPontoRoute,
  LancamentosRoute,
  BancoHorasRoute,
  AtestadosRoute,
  OcorrenciasRoute,
  ComparativosRoute,
  KpisRoute,
  RelatoriosRoute,
  ParametrosRoute,
}

export const routeTree = rootRouteImport
  ._addFileChildren(rootRouteChildren)
  ._addFileTypes<FileRouteTypes>()

import type { getRouter } from './router.tsx'
import type { startInstance } from './start.ts'
declare module '@tanstack/react-start' {
  interface Register {
    ssr: true
    router: Awaited<ReturnType<typeof getRouter>>
    config: Awaited<ReturnType<typeof startInstance.getOptions>>
  }
}
