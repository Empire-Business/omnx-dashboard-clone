import React, { Suspense, lazy } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthGuard, GuestGuard } from '@/components/auth/AuthGuard'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { WorkspaceLayout } from '@/components/layout/WorkspaceLayout'
import { AgencyLayout } from '@/components/layout/AgencyLayout'
import { AgencyRoute } from '@/pages/agency/AgencyRoute'
import { PermissionsProvider, usePermissions } from '@/contexts/PermissionsContext'
import { ChatProvider } from '@/contexts/ChatContext'
import { AdminRoute } from '@/pages/admin/AdminRoute'
import { AdminRedirect } from '@/pages/admin/AdminRedirect'

// ─── Páginas de autenticação: carregadas de imediato ──────────────
// São o primeiro paint de quem não tem sessão — adiar aqui só atrasaria o login.
import { LoginPage } from '@/pages/LoginPage'
import { OtpVerifyPage } from '@/pages/OtpVerifyPage'
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage'
import { ResetPasswordPage } from '@/pages/ResetPasswordPage'
import { AppHubPage } from '@/pages/AppHubPage'

// ─── Páginas pesadas: code-splitting por rota ─────────────────────
// Antes, o bundle era um único arquivo de ~2 MB: abrir o login já baixava Tráfego,
// Criativos, Relatórios e Administração inteiros. Cada lazy() vira um pedaço próprio,
// buscado só quando a rota é visitada.
const WorkspaceHomePage = lazy(() => import('@/pages/workspace/WorkspaceHomePage').then((m) => ({ default: m.WorkspaceHomePage })))
const WorkspaceUsersPage = lazy(() => import('@/pages/workspace/WorkspaceUsersPage').then((m) => ({ default: m.WorkspaceUsersPage })))
const WorkspaceUserDetailPage = lazy(() => import('@/pages/workspace/WorkspaceUserDetailPage').then((m) => ({ default: m.WorkspaceUserDetailPage })))
const WorkspaceAppsPage = lazy(() => import('@/pages/workspace/WorkspaceAppsPage').then((m) => ({ default: m.WorkspaceAppsPage })))
const WorkspaceGhlConfigPage = lazy(() => import('@/pages/workspace/WorkspaceGhlConfigPage').then((m) => ({ default: m.WorkspaceGhlConfigPage })))
const WorkspaceIntegrationsPage = lazy(() => import('@/pages/workspace/WorkspaceIntegrationsPage').then((m) => ({ default: m.WorkspaceIntegrationsPage })))
const WorkspaceClaraPage = lazy(() => import('@/pages/workspace/WorkspaceClaraPage').then((m) => ({ default: m.WorkspaceClaraPage })))
const AgencyWorkspacesPage = lazy(() => import('@/pages/agency/AgencyWorkspacesPage').then((m) => ({ default: m.AgencyWorkspacesPage })))
const AdminUsersPage = lazy(() => import('@/pages/admin/AdminUsersPage').then((m) => ({ default: m.AdminUsersPage })))
const AdminPermissionsPage = lazy(() => import('@/pages/admin/AdminPermissionsPage').then((m) => ({ default: m.AdminPermissionsPage })))
const TraqueamentoPage = lazy(() => import('@/pages/traqueamento/TraqueamentoPage').then((m) => ({ default: m.TraqueamentoPage })))
const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const LeadsPage = lazy(() => import('@/pages/leads/LeadsPage').then((m) => ({ default: m.LeadsPage })))
const PreVendasPage = lazy(() => import('@/pages/prevendas/PreVendasPage').then((m) => ({ default: m.PreVendasPage })))
const SdrIaPage = lazy(() => import('@/pages/sdr-ia/SdrIaPage').then((m) => ({ default: m.SdrIaPage })))
const GoalsPage = lazy(() => import('@/pages/goals/GoalsPage').then((m) => ({ default: m.GoalsPage })))
const RecuperacaoPage = lazy(() => import('@/pages/recuperacao/RecuperacaoPage').then((m) => ({ default: m.RecuperacaoPage })))
const AquisicaoPage = lazy(() => import('@/pages/aquisicao/AquisicaoPage').then((m) => ({ default: m.AquisicaoPage })))
const OrganicoPage = lazy(() => import('@/pages/organico/OrganicoPage').then((m) => ({ default: m.OrganicoPage })))
const VendasPage = lazy(() => import('@/pages/vendas/VendasPage').then((m) => ({ default: m.VendasPage })))
const RelatoriosPage = lazy(() => import('@/pages/relatorios/RelatoriosPage').then((m) => ({ default: m.RelatoriosPage })))
const CriativosPage = lazy(() => import('@/pages/criativos/CriativosPage').then((m) => ({ default: m.CriativosPage })))
const DisparosPage = lazy(() => import('@/pages/disparos/DisparosPage').then((m) => ({ default: m.DisparosPage })))

// Enquanto o pedaço da rota chega. Discreto de propósito: o carregamento é de
// milissegundos e um spinner grande piscando incomoda mais do que ajuda.
function RouteFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-empire-border border-t-empire-primary" />
    </div>
  )
}


function resolveAppSlug(moduleKey: string): string | null {
  const segments = moduleKey.split('.')
  const root = segments[0]

  switch (root) {
    case 'vendas':
    case 'aquisicao':
    case 'organico':
      return 'aquisicao-vendas'
    case 'trafego':
      return 'trafego'
    case 'traqueamento':
      return 'traqueamento'
    case 'pre_vendas':
    case 'recuperacao':
      return 'pre-vendas'
    case 'relatorios':
      return 'relatorios'
    case 'metas':
      return 'metas'
    case 'leads':
      return 'leads'
    case 'sdr-ia':
      return 'sdr-ia'
    case 'criativos':
      return 'criativos'
    case 'disparos':
      return 'disparos'
    default:
      return null
  }
}

function PermissionRoute({
  moduleKey,
  featureKey,
  children,
}: {
  moduleKey: string
  featureKey?: string
  children: React.ReactNode
}) {
  const { hasPermission, hasFeaturePermission, apps, loading, loadingApps } = usePermissions()
  const location = useLocation()

  // Nunca desmontar children durante loading — isso destroya o estado local
  // (ex: formulário de bot aberto). As permissões recarregam em background.
  if (loading || loadingApps) return <>{children}</>

  const appSlug = resolveAppSlug(moduleKey)
  if (appSlug) {
    const app = apps.find((a) => a.slug === appSlug)
    // Se o app está ativo e permitido (via app_user_overrides OU app_role_permissions),
    // conceder acesso sem exigir app_role_permissions separado — os overrides são suficientes
    if (app && app.is_active && app.allowed) {
      // Se featureKey foi passado, verifica permissão de view da feature específica.
      // As páginas também possuem guardas por tab (abordagem menos invasiva).
      if (featureKey && !hasFeaturePermission(appSlug, featureKey)) {
        return <Navigate to="/" replace state={{ from: location }} />
      }
      return <>{children}</>
    }
    return <Navigate to="/" replace state={{ from: location }} />
  }

  // Módulo sem app slug (granular): verificar permissão por papel
  if (!hasPermission(moduleKey)) return <Navigate to="/" replace />

  return <>{children}</>
}

function App() {
  return (
    <Routes>
      {/* Public auth routes */}
      <Route
        path="/login"
        element={
          <GuestGuard>
            <LoginPage />
          </GuestGuard>
        }
      />
      <Route
        path="/verify-otp"
        element={
          <GuestGuard>
            <OtpVerifyPage />
          </GuestGuard>
        }
      />
      <Route
        path="/forgot-password"
        element={
          <GuestGuard>
            <ForgotPasswordPage />
          </GuestGuard>
        }
      />
      {/* Reset password — never guarded, Supabase sets session via hash token */}
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {/* Protected dashboard routes */}
      <Route
        path="/*"
        element={
          <AuthGuard>
            <PermissionsProvider>
              <ChatProvider>
                <Suspense fallback={<RouteFallback />}>
                <Routes>
                  <Route index element={<AppHubPage />} />

                  {/* Portal de administração unificado — user-first, sem sidebar de app */}
                  <Route path="workspace" element={<AdminRoute><WorkspaceLayout><WorkspaceHomePage /></WorkspaceLayout></AdminRoute>} />
                  <Route path="workspace/users" element={<AdminRoute><WorkspaceLayout><WorkspaceUsersPage /></WorkspaceLayout></AdminRoute>} />
                  <Route path="workspace/users/:userId" element={<AdminRoute><WorkspaceLayout><WorkspaceUserDetailPage /></WorkspaceLayout></AdminRoute>} />
                  <Route path="workspace/access" element={<AdminRoute><WorkspaceLayout><AdminUsersPage /></WorkspaceLayout></AdminRoute>} />
                  <Route path="workspace/apps" element={<AdminRoute><WorkspaceLayout><WorkspaceAppsPage /></WorkspaceLayout></AdminRoute>} />
                  <Route path="workspace/permissions" element={<AdminRoute><WorkspaceLayout><AdminPermissionsPage /></WorkspaceLayout></AdminRoute>} />
                  <Route path="workspace/ghl-config" element={<AdminRoute><WorkspaceLayout><WorkspaceGhlConfigPage /></WorkspaceLayout></AdminRoute>} />
                  <Route path="workspace/integracoes" element={<AdminRoute><WorkspaceLayout><WorkspaceIntegrationsPage /></WorkspaceLayout></AdminRoute>} />
                  <Route path="workspace/clara" element={<AdminRoute><WorkspaceLayout><WorkspaceClaraPage /></WorkspaceLayout></AdminRoute>} />

                  {/* Fase 5 — area de agencia, so acessivel a quem tem linha ativa em agency_members */}
                  <Route path="agency" element={<AgencyRoute><AgencyLayout><Navigate to="/agency/workspaces" replace /></AgencyLayout></AgencyRoute>} />
                  <Route path="agency/workspaces" element={<AgencyRoute><AgencyLayout><AgencyWorkspacesPage /></AgencyLayout></AgencyRoute>} />

                  {/* Redirects legados — portal /admin antigo unificado em /workspace */}
                  <Route path="admin" element={<AdminRedirect to="/workspace" />} />
                  <Route path="admin/users" element={<AdminRedirect to="/workspace/access" />} />
                  <Route path="admin/apps" element={<AdminRedirect to="/workspace/apps" />} />
                  <Route path="admin/permissions" element={<AdminRedirect to="/workspace/permissions" />} />

                  {/* Legacy settings redirects */}
                  <Route path="settings" element={<AdminRedirect to="/workspace" />} />
                  <Route path="settings/users" element={<AdminRedirect to="/workspace/users" />} />
                  <Route path="settings/apps" element={<AdminRedirect to="/workspace/apps" />} />
                  <Route path="settings/apps/permissions" element={<AdminRedirect to="/workspace/permissions" />} />

                  {/* Inscrições vivem como aba de Leads */}
                  <Route path="inscricoes" element={<Navigate to="/leads?tab=inscricoes" replace />} />

                  <Route
                    path="*"
                    element={
                      <DashboardLayout>
                        {/* Suspense interno: mantém sidebar/header montados enquanto o
                            pedaço da página chega — sem piscar o layout inteiro. */}
                        <Suspense fallback={<RouteFallback />}>
                        <Routes>
                          <Route path="vendas" element={<PermissionRoute moduleKey="vendas" featureKey="vendas"><VendasPage /></PermissionRoute>} />
                          <Route path="aquisicao" element={<PermissionRoute moduleKey="aquisicao" featureKey="aquisicao"><AquisicaoPage /></PermissionRoute>} />
                          <Route path="organico" element={<PermissionRoute moduleKey="organico" featureKey="organico"><OrganicoPage /></PermissionRoute>} />
                          <Route path="trafego" element={<PermissionRoute moduleKey="trafego" featureKey="visao-geral"><DashboardPage /></PermissionRoute>} />
                          <Route path="metas" element={<PermissionRoute moduleKey="metas" featureKey="overview"><GoalsPage /></PermissionRoute>} />
                          <Route path="traqueamento" element={<PermissionRoute moduleKey="traqueamento" featureKey="cods-utm"><TraqueamentoPage /></PermissionRoute>} />
                          <Route path="leads" element={<PermissionRoute moduleKey="leads" featureKey="lista"><LeadsPage /></PermissionRoute>} />
                          <Route path="pre-vendas" element={<PermissionRoute moduleKey="pre_vendas" featureKey="discagem"><PreVendasPage /></PermissionRoute>} />
                          <Route path="recuperacao" element={<PermissionRoute moduleKey="recuperacao" featureKey="recuperacao"><RecuperacaoPage /></PermissionRoute>} />
                          <Route path="relatorios" element={<PermissionRoute moduleKey="relatorios" featureKey="cohort"><RelatoriosPage /></PermissionRoute>} />
                          <Route path="sdr-ia" element={<PermissionRoute moduleKey="sdr-ia" featureKey="auditoria-ia"><SdrIaPage /></PermissionRoute>} />
                          <Route path="criativos" element={<PermissionRoute moduleKey="criativos" featureKey="dashboard"><CriativosPage /></PermissionRoute>} />
                          <Route path="disparos" element={<PermissionRoute moduleKey="disparos" featureKey="dashboard"><DisparosPage /></PermissionRoute>} />

                          <Route path="*" element={<Navigate to="/" replace />} />
                        </Routes>
                        </Suspense>
                      </DashboardLayout>
                    }
                  />
                </Routes>
                </Suspense>
              </ChatProvider>
            </PermissionsProvider>
          </AuthGuard>
        }
      />
    </Routes>
  )
}

export default App
