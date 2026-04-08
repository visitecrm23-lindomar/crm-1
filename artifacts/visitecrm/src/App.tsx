import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useUser } from "@clerk/react";
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from "wouter";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useSyncMe, useGetMe } from "@workspace/api-client-react";

import Layout from "@/components/layout";
import AdminLayout from "@/components/admin-layout";
import Landing from "@/pages/landing";
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
import Settings from "@/pages/settings";

// Task 6 pages
import Fornecedores from "@/pages/cadastros/fornecedores";
import Veiculos from "@/pages/cadastros/veiculos";
import Hospedagens from "@/pages/cadastros/hospedagens";
import Destinos from "@/pages/cadastros/destinos";
import Produtos from "@/pages/cadastros/produtos";
import Vendedores from "@/pages/vendedores";
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
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
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
        <SyncUser />
        <Redirect to="/dashboard" />
      </Show>
      <Show when="signed-out">
        <Landing />
      </Show>
    </>
  );
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  return (
    <>
      <Show when="signed-in">
        <Layout>
          <Component />
        </Layout>
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
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

function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomeRedirect} />
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
      <Route path="/dashboard" component={() => <ProtectedRoute component={Dashboard} />} />
      <Route path="/pipeline" component={() => <ProtectedRoute component={Pipeline} />} />
      <Route path="/clients" component={() => <ProtectedRoute component={Clients} />} />
      <Route path="/clients/:id" component={() => <ProtectedRoute component={Clients} />} />
      <Route path="/trips" component={() => <ProtectedRoute component={Trips} />} />
      <Route path="/trips/new" component={() => <ProtectedRoute component={Trips} />} />
      <Route path="/trips/calendar" component={() => <ProtectedRoute component={Trips} />} />
      <Route path="/trips/:id/edit" component={() => <ProtectedRoute component={Trips} />} />
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
      <Route path="/financeiro" component={() => <ProtectedRoute component={Financial} />} />
      <Route
        path="/financeiro/commissions"
        component={() => <ProtectedRoute component={Commissions} />}
      />
      <Route
        path="/financeiro/expenses"
        component={() => <ProtectedRoute component={Expenses} />}
      />
      <Route path="/comunicacao" component={() => <ProtectedRoute component={Communication} />} />
      <Route path="/communication" component={() => <Redirect to="/comunicacao" />} />
      <Route
        path="/comunicacao/campanhas"
        component={() => <ProtectedRoute component={Campaigns} />}
      />
      <Route path="/automacoes" component={() => <ProtectedRoute component={Automations} />} />
      <Route path="/automations" component={() => <Redirect to="/automacoes" />} />
      <Route path="/marketing" component={() => <ProtectedRoute component={Marketing} />} />
      <Route path="/fidelidade" component={() => <ProtectedRoute component={Loyalty} />} />
      <Route path="/nps" component={() => <ProtectedRoute component={Nps} />} />

      {/* Registrations hub + sub-pages */}
      <Route path="/registrations" component={() => <Redirect to="/cadastros" />} />
      <Route path="/cadastros" component={() => <ProtectedRoute component={Registrations} />} />
      <Route
        path="/cadastros/fornecedores"
        component={() => <ProtectedRoute component={Fornecedores} />}
      />
      <Route
        path="/cadastros/veiculos"
        component={() => <ProtectedRoute component={Veiculos} />}
      />
      <Route
        path="/cadastros/hospedagens"
        component={() => <ProtectedRoute component={Hospedagens} />}
      />
      <Route
        path="/cadastros/destinos"
        component={() => <ProtectedRoute component={Destinos} />}
      />
      <Route
        path="/cadastros/produtos"
        component={() => <ProtectedRoute component={Produtos} />}
      />

      {/* Analytics */}
      <Route path="/analytics" component={() => <ProtectedRoute component={Analytics} />} />
      <Route path="/analytics/revenue" component={() => <ProtectedRoute component={Revenue} />} />
      <Route
        path="/analytics/vendedores"
        component={() => <ProtectedRoute component={Vendedores} />}
      />

      {/* New Task 6 pages */}
      <Route path="/vouchers" component={() => <ProtectedRoute component={Vouchers} />} />
      <Route path="/indicacoes" component={() => <ProtectedRoute component={Indicacoes} />} />
      <Route
        path="/configuracoes"
        component={() => <ProtectedRoute component={Configuracoes} />}
      />
      <Route
        path="/downloads"
        component={() => <ProtectedRoute component={Downloads} />}
      />

      {/* Legacy redirect */}
      <Route path="/settings" component={() => <Redirect to="/configuracoes" />} />

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

      {/* Store admin pages */}
      <Route path="/loja" component={() => <Redirect to="/loja/configuracoes" />} />
      <Route
        path="/loja/configuracoes"
        component={() => <ProtectedRoute component={LojaConfiguracoes} />}
      />
      <Route
        path="/loja/produtos"
        component={() => <ProtectedRoute component={LojaProdutos} />}
      />
      <Route
        path="/loja/categorias"
        component={() => <ProtectedRoute component={LojaCategorias} />}
      />
      <Route
        path="/loja/pedidos"
        component={() => <ProtectedRoute component={LojaPedidos} />}
      />
      <Route
        path="/loja/cupons"
        component={() => <ProtectedRoute component={LojaCupons} />}
      />
      <Route
        path="/loja/avaliacoes"
        component={() => <ProtectedRoute component={LojaAvaliacoes} />}
      />

      {/* Public vitrine — must be after admin routes */}
      <Route path="/loja/:slug" component={Vitrine} />
      <Route path="/loja/:slug/:rest*" component={Vitrine} />

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
