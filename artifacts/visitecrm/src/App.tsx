import { useEffect, useRef, useState, lazy, Suspense } from "react";
import { ClerkProvider, Show, useClerk, useUser } from "@clerk/react";
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from "wouter";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useSyncMe, useGetMe } from "@workspace/api-client-react";

import Layout from "@/components/layout";
import AdminLayout from "@/components/admin-layout";
import Landing from "@/pages/landing";
import SignInPage from "@/pages/sign-in";
import SignUpPage from "@/pages/sign-up";
import OnboardingPage from "@/pages/onboarding";
import Dashboard from "@/pages/dashboard";
import Pipeline from "@/pages/pipeline";
import Clients from "@/pages/clients";
import Trips from "@/pages/trips";
import Reservations from "@/pages/reservations";
import Financial from "@/pages/financial";
import Communication from "@/pages/communication";
import Campaigns from "@/pages/campaigns";
import Automations from "@/pages/automations";
import Marketing from "@/pages/marketing";
import Loyalty from "@/pages/loyalty";
import Nps from "@/pages/nps";
import Registrations from "@/pages/registrations";
import Analytics from "@/pages/analytics";
import Commissions from "@/pages/commissions";
import Expenses from "@/pages/expenses";
import Revenue from "@/pages/revenue";
const HistoricoComparativo = lazy(() => import("@/pages/historico-comparativo"));
import Settings from "@/pages/settings";

// Task 6 pages
import Fornecedores from "@/pages/cadastros/fornecedores";
import Veiculos from "@/pages/cadastros/veiculos";
import Layouts from "@/pages/cadastros/layouts";
import Hospedagens from "@/pages/cadastros/hospedagens";
import Destinos from "@/pages/cadastros/destinos";
import Produtos from "@/pages/cadastros/produtos";
import Vendedores from "@/pages/vendedores";
import MeuPainel from "@/pages/meu-painel";
import Vouchers from "@/pages/vouchers";
import Indicacoes from "@/pages/indicacoes";
import Configuracoes from "@/pages/configuracoes";
import Downloads from "@/pages/downloads";
import AdminDashboard from "@/pages/admin/index";
import AdminTenants from "@/pages/admin/tenants";
import AdminTenantDetail from "@/pages/admin/tenant-detail";
import AdminPlans from "@/pages/admin/plans";
import AdminBilling from "@/pages/admin/billing";
import AdminMetrics from "@/pages/admin/metrics";
import AdminUsers from "@/pages/admin/users";
import AdminLogs from "@/pages/admin/logs";
import AdminSettings from "@/pages/admin/admin-settings";
import AdminMaintenance from "@/pages/admin/maintenance";

// Store admin pages
import LojaConfiguracoes from "@/pages/loja/configuracoes";
import LojaProdutos from "@/pages/loja/produtos";
import LojaCategorias from "@/pages/loja/categorias";
import LojaPedidos from "@/pages/loja/pedidos";
import LojaCupons from "@/pages/loja/cupons";
import LojaAvaliacoes from "@/pages/loja/avaliacoes";

// Public vitrine
import Vitrine from "@/pages/vitrine";

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const clerkProxyUrl: string =
  import.meta.env.VITE_CLERK_PROXY_URL ||
  `${typeof window !== "undefined" ? window.location.origin : ""}/api/__clerk`;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || "/" : path;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);
  return null;
}

function RoleRedirect() {
  const syncMe = useSyncMe();
  const { data: me, isLoading, refetch } = useGetMe();
  const { user } = useUser();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const [synced, setSynced] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setTimedOut(true), 10000);
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!user) return;
    syncMe.mutate(
      {
        data: {
          clerkId: user.id,
          name: user.fullName ?? user.firstName ?? "Usuário",
          email: user.primaryEmailAddress?.emailAddress ?? "",
          avatarUrl: user.imageUrl ?? undefined,
        },
      },
      {
        onSettled: () => {
          qc.invalidateQueries({ queryKey: ["/api/users/me"] });
          refetch().then(() => setSynced(true));
        },
        onError: () => setSynced(true),
      }
    );
  }, [user?.id]);

  useEffect(() => {
    if (timedOut && !synced) {
      setLocation("/sign-in");
      return;
    }
    if (!synced || isLoading) return;
    if (!me) {
      setLocation("/sign-in");
      return;
    }

    if (me.role === "superadmin") {
      setLocation("/admin");
    } else if (!me.tenantId) {
      setLocation("/onboarding");
    } else if (me.role === "vendedor") {
      setLocation("/meu-painel");
    } else if (me.role === "agencia") {
      setLocation("/dashboard");
    } else if (me.role === "cliente") {
      if (me.tenant?.slug) {
        setLocation(`/loja/${me.tenant.slug}`);
      } else {
        setLocation("/dashboard");
      }
    } else {
      setLocation("/dashboard");
    }
  }, [synced, me, isLoading, timedOut]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="animate-pulse text-muted-foreground text-sm">Carregando...</div>
    </div>
  );
}

function SyncUser() {
  const syncMe = useSyncMe();
  const { user } = useUser();
  useEffect(() => {
    if (!user) return;
    syncMe.mutate({
      data: {
        clerkId: user.id,
        name: user.fullName ?? user.firstName ?? "Usuário",
        email: user.primaryEmailAddress?.emailAddress ?? "",
        avatarUrl: user.imageUrl ?? undefined,
      },
    });
  }, [user?.id]);
  return null;
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <RoleRedirect />
      </Show>
      <Show when="signed-out">
        <Landing />
      </Show>
    </>
  );
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { data: me, isLoading } = useGetMe();

  return (
    <>
      <Show when="signed-in">
        {isLoading ? null : !me?.tenantId && me?.role !== "superadmin" ? (
          <Redirect to="/onboarding" />
        ) : (
          <Layout>
            <Component />
          </Layout>
        )}
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function AgenciaRoute({ component: Component }: { component: React.ComponentType }) {
  const { data: me, isLoading } = useGetMe();

  return (
    <>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
      <Show when="signed-in">
        {isLoading ? null : !me?.tenantId && me?.role !== "superadmin" ? (
          <Redirect to="/onboarding" />
        ) : me?.role === "vendedor" ? (
          <Redirect to="/trips" />
        ) : (
          <Layout>
            <Component />
          </Layout>
        )}
      </Show>
    </>
  );
}

function AgenciaOnlyRoute({ component: Component }: { component: React.ComponentType }) {
  const { data: me, isLoading } = useGetMe();

  return (
    <>
      <Show when="signed-in">
        {isLoading ? null : !me?.tenantId && me?.role !== "superadmin" ? (
          <Redirect to="/onboarding" />
        ) : me?.role === "vendedor" ? (
          <Redirect to="/meu-painel" />
        ) : (
          <Layout>
            <Component />
          </Layout>
        )}
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function VendedorRoute({ component: Component }: { component: React.ComponentType }) {
  const { data: me, isLoading } = useGetMe();

  return (
    <>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
      <Show when="signed-in">
        {isLoading ? null : me?.role === "vendedor" ? (
          <Layout>
            <Component />
          </Layout>
        ) : (
          <Redirect to="/dashboard" />
        )}
      </Show>
    </>
  );
}

function AdminRoute({ component: Component }: { component: React.ComponentType }) {
  const { data: me, isLoading } = useGetMe();

  return (
    <>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
      <Show when="signed-in">
        {isLoading ? null : me?.role === "superadmin" ? (
          <AdminLayout>
            <Component />
          </AdminLayout>
        ) : (
          <Redirect to="/dashboard" />
        )}
      </Show>
    </>
  );
}

function OnboardingRoute() {
  const { data: me, isLoading } = useGetMe();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isLoading || !me) return;
    if (me.tenantId) {
      if (me.role === "superadmin") {
        setLocation("/admin");
      } else if (me.role === "vendedor") {
        setLocation("/meu-painel");
      } else {
        setLocation("/dashboard");
      }
    }
  }, [me, isLoading]);

  return (
    <>
      <Show when="signed-in">
        <SyncUser />
        {!isLoading && <OnboardingPage />}
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomeRedirect} />
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
      <Route path="/onboarding" component={OnboardingRoute} />
      <Route path="/dashboard" component={() => <ProtectedRoute component={Dashboard} />} />
      <Route path="/pipeline" component={() => <ProtectedRoute component={Pipeline} />} />
      <Route path="/clients" component={() => <ProtectedRoute component={Clients} />} />
      <Route path="/clients/:id" component={() => <ProtectedRoute component={Clients} />} />
      <Route path="/trips" component={() => <ProtectedRoute component={Trips} />} />
      <Route path="/trips/new" component={() => <AgenciaRoute component={Trips} />} />
      <Route path="/trips/calendar" component={() => <ProtectedRoute component={Trips} />} />
      <Route path="/trips/:id/edit" component={() => <AgenciaRoute component={Trips} />} />
      <Route path="/trips/:id/seat-map" component={() => <ProtectedRoute component={Trips} />} />
      <Route
        path="/trips/:id/passengers-overview"
        component={() => <ProtectedRoute component={Trips} />}
      />
      <Route path="/trips/:id/passengers" component={() => <ProtectedRoute component={Trips} />} />
      <Route path="/trips/:id" component={() => <ProtectedRoute component={Trips} />} />
      <Route path="/reservations" component={() => <ProtectedRoute component={Reservations} />} />
      <Route
        path="/reservations/:id"
        component={() => <ProtectedRoute component={Reservations} />}
      />
      <Route path="/financial" component={() => <Redirect to="/financeiro" />} />
      <Route path="/financeiro" component={() => <AgenciaOnlyRoute component={Financial} />} />
      <Route
        path="/financeiro/commissions"
        component={() => <AgenciaOnlyRoute component={Commissions} />}
      />
      <Route
        path="/financeiro/expenses"
        component={() => <AgenciaOnlyRoute component={Expenses} />}
      />
      <Route path="/comunicacao" component={() => <ProtectedRoute component={Communication} />} />
      <Route path="/communication" component={() => <Redirect to="/comunicacao" />} />
      <Route
        path="/comunicacao/campanhas"
        component={() => <AgenciaOnlyRoute component={Campaigns} />}
      />
      <Route path="/automacoes" component={() => <AgenciaOnlyRoute component={Automations} />} />
      <Route path="/automations" component={() => <Redirect to="/automacoes" />} />
      <Route path="/marketing" component={() => <AgenciaOnlyRoute component={Marketing} />} />
      <Route path="/fidelidade" component={() => <AgenciaOnlyRoute component={Loyalty} />} />
      <Route path="/nps" component={() => <AgenciaOnlyRoute component={Nps} />} />

      {/* Registrations hub + sub-pages */}
      <Route path="/registrations" component={() => <Redirect to="/cadastros" />} />
      <Route path="/cadastros" component={() => <AgenciaOnlyRoute component={Registrations} />} />
      <Route
        path="/cadastros/fornecedores"
        component={() => <AgenciaOnlyRoute component={Fornecedores} />}
      />
      <Route
        path="/cadastros/veiculos"
        component={() => <AgenciaOnlyRoute component={Veiculos} />}
      />
      <Route
        path="/cadastros/hospedagens"
        component={() => <AgenciaOnlyRoute component={Hospedagens} />}
      />
      <Route
        path="/cadastros/destinos"
        component={() => <AgenciaOnlyRoute component={Destinos} />}
      />
      <Route
        path="/cadastros/produtos"
        component={() => <AgenciaOnlyRoute component={Produtos} />}
      />
      <Route
        path="/cadastros/layouts"
        component={() => <AgenciaOnlyRoute component={Layouts} />}
      />

      {/* Analytics */}
      <Route path="/analytics" component={() => <AgenciaOnlyRoute component={Analytics} />} />
      <Route path="/analytics/revenue" component={() => <AgenciaOnlyRoute component={Revenue} />} />
      <Route path="/analytics/historico-comparativo" component={() => <Suspense fallback={null}><AgenciaOnlyRoute component={HistoricoComparativo} /></Suspense>} />
      <Route
        path="/analytics/vendedores"
        component={() => <AgenciaOnlyRoute component={Vendedores} />}
      />

      {/* New Task 6 pages */}
      <Route path="/vouchers" component={() => <ProtectedRoute component={Vouchers} />} />
      <Route path="/indicacoes" component={() => <AgenciaOnlyRoute component={Indicacoes} />} />
      <Route
        path="/configuracoes"
        component={() => <AgenciaOnlyRoute component={Configuracoes} />}
      />
      <Route
        path="/downloads"
        component={() => <AgenciaOnlyRoute component={Downloads} />}
      />

      {/* Seller dashboard */}
      <Route path="/meu-painel" component={() => <VendedorRoute component={MeuPainel} />} />

      {/* Legacy redirects */}
      <Route path="/settings" component={() => <Redirect to="/configuracoes" />} />
      <Route path="/billing" component={() => <Redirect to="/configuracoes?tab=plan" />} />
      <Route path="/settings/billing" component={() => <Redirect to="/configuracoes?tab=plan" />} />

      {/* Super Admin */}
      <Route path="/admin" component={() => <AdminRoute component={AdminDashboard} />} />
      <Route path="/admin/tenants" component={() => <AdminRoute component={AdminTenants} />} />
      <Route path="/admin/tenants/:id" component={() => <AdminRoute component={AdminTenantDetail} />} />
      <Route path="/admin/plans" component={() => <AdminRoute component={AdminPlans} />} />
      <Route path="/admin/billing" component={() => <AdminRoute component={AdminBilling} />} />
      <Route path="/admin/metrics" component={() => <AdminRoute component={AdminMetrics} />} />
      <Route path="/admin/users" component={() => <AdminRoute component={AdminUsers} />} />
      <Route path="/admin/logs" component={() => <AdminRoute component={AdminLogs} />} />
      <Route path="/admin/settings" component={() => <AdminRoute component={AdminSettings} />} />
      <Route path="/admin/maintenance" component={() => <AdminRoute component={AdminMaintenance} />} />

      {/* Store admin pages */}
      <Route path="/loja" component={() => <Redirect to="/loja/configuracoes" />} />
      <Route
        path="/loja/configuracoes"
        component={() => <AgenciaOnlyRoute component={LojaConfiguracoes} />}
      />
      <Route
        path="/loja/produtos"
        component={() => <AgenciaOnlyRoute component={LojaProdutos} />}
      />
      <Route
        path="/loja/categorias"
        component={() => <AgenciaOnlyRoute component={LojaCategorias} />}
      />
      <Route
        path="/loja/pedidos"
        component={() => <AgenciaOnlyRoute component={LojaPedidos} />}
      />
      <Route
        path="/loja/cupons"
        component={() => <AgenciaOnlyRoute component={LojaCupons} />}
      />
      <Route
        path="/loja/avaliacoes"
        component={() => <AgenciaOnlyRoute component={LojaAvaliacoes} />}
      />

      {/* Public vitrine — must be after admin routes */}
      <Route path="/loja/:slug" component={Vitrine} />
      <Route path="/loja/:slug/*" component={Vitrine} />

      <Route
        component={() => <ProtectedRoute component={() => <Redirect to="/dashboard" />} />}
      />
    </Switch>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  if (!clerkPubKey) {
    return <div className="p-8 text-red-500">Missing VITE_CLERK_PUBLISHABLE_KEY</div>;
  }

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      signInFallbackRedirectUrl="/"
      signUpFallbackRedirectUrl="/"
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <Router />
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <TooltipProvider>
        <ClerkProviderWithRoutes />
        <Toaster />
      </TooltipProvider>
    </WouterRouter>
  );
}

export default App;
