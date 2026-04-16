import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useUser, useClerk } from "@clerk/react";
import { useGetMe, useGetNotifications } from "@workspace/api-client-react";
import {
  LayoutDashboard,
  Users,
  Map,
  CalendarCheck,
  DollarSign,
  MessageSquare,
  LogOut,
  Settings,
  Target,
  Trello,
  Zap,
  BookOpen,
  BarChart2,
  ChevronDown,
  Bell,
  Building2,
  Star,
  TrendingUp,
  Megaphone,
  QrCode,
  Share2,
  Download,
  UserCheck,
  ChevronRight,
  ShoppingBag,
  Package,
  FolderOpen,
  ShoppingCart,
  Tag,
  MessageCircle,
  AlertTriangle,
  Info,
  XCircle,
  Gauge,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface NavItem {
  name: string;
  href: string;
  roles?: string[];
  hiddenFor?: string[];
  icon: React.ComponentType<{ className?: string }>;
  children?: NavItem[];
}

const NAVIGATION: NavItem[] = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Pipeline", href: "/pipeline", icon: Trello },
  { name: "Clientes", href: "/clients", icon: Users },
  { name: "Viagens", href: "/trips", icon: Map },
  { name: "Reservas", href: "/reservations", icon: CalendarCheck },
  { name: "Vouchers", href: "/vouchers", icon: QrCode },
  { name: "Financeiro", href: "/financeiro", icon: DollarSign, hiddenFor: ["vendedor"] },
  { name: "Comunicação", href: "/comunicacao", icon: MessageSquare },
  { name: "Campanhas", href: "/comunicacao/campanhas", icon: Megaphone },
  { name: "Automações", href: "/automacoes", icon: Zap, hiddenFor: ["vendedor"] },
  { name: "Marketing", href: "/marketing", icon: Target, hiddenFor: ["vendedor"] },
  { name: "Fidelidade", href: "/fidelidade", icon: Star, hiddenFor: ["vendedor"] },
  { name: "NPS", href: "/nps", icon: TrendingUp, hiddenFor: ["vendedor"] },
  { name: "Cadastros", href: "/cadastros", icon: BookOpen, hiddenFor: ["vendedor"] },
  {
    name: "Analíticos",
    href: "/analytics",
    icon: BarChart2,
    hiddenFor: ["vendedor"],
    children: [
      { name: "Vendedores", href: "/analytics/vendedores", icon: UserCheck, hiddenFor: ["vendedor"] },
    ],
  },
  {
    name: "Minha Loja",
    href: "/loja",
    icon: ShoppingBag,
    hiddenFor: ["vendedor"],
    children: [
      { name: "Configurações", href: "/loja/configuracoes", icon: Settings, hiddenFor: ["vendedor"] },
      { name: "Produtos", href: "/loja/produtos", icon: Package, hiddenFor: ["vendedor"] },
      { name: "Categorias", href: "/loja/categorias", icon: FolderOpen, hiddenFor: ["vendedor"] },
      { name: "Pedidos", href: "/loja/pedidos", icon: ShoppingCart, hiddenFor: ["vendedor"] },
      { name: "Cupons", href: "/loja/cupons", icon: Tag, hiddenFor: ["vendedor"] },
      { name: "Avaliações", href: "/loja/avaliacoes", icon: MessageCircle, hiddenFor: ["vendedor"] },
    ],
  },
  { name: "Meu Painel", href: "/meu-painel", icon: Gauge, roles: ["vendedor"] },
  { name: "Indicações", href: "/indicacoes", icon: Share2, hiddenFor: ["vendedor"] },
  { name: "Downloads", href: "/downloads", icon: Download, hiddenFor: ["vendedor"] },
  { name: "Configurações", href: "/configuracoes", icon: Settings, hiddenFor: ["vendedor"] },
];

const ROLE_LABELS: Record<string, string> = {
  superadmin: "Super Admin",
  agencia: "Agência",
  vendedor: "Vendedor",
  cliente: "Cliente",
};

function NavLink({
  item,
  location,
  userRole,
  depth = 0,
}: {
  item: NavItem;
  location: string;
  userRole?: string;
  depth?: number;
}) {
  const visibleChildren = item.children?.filter(
    (c) => (!c.hiddenFor || (userRole && !c.hiddenFor.includes(userRole)))
  );
  const isActive =
    location === item.href ||
    (item.href !== "/" && location.startsWith(item.href));
  const hasChildren = visibleChildren && visibleChildren.length > 0;
  const childActive = visibleChildren?.some(
    (c) => location === c.href || (c.href !== "/" && location.startsWith(c.href))
  );

  return (
    <div>
      <Link
        href={item.href}
        className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
          depth > 0 ? "pl-7" : ""
        } ${
          isActive || childActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
        }`}
      >
        <item.icon className="w-4 h-4 shrink-0" />
        {item.name}
        {hasChildren && (
          <ChevronRight
            className={`w-3 h-3 ml-auto transition-transform ${childActive ? "rotate-90" : ""}`}
          />
        )}
      </Link>
      {hasChildren && (isActive || childActive) && (
        <div className="mt-0.5 space-y-0.5">
          {visibleChildren!.map((child) => (
            <NavLink key={child.href} item={child} location={location} userRole={userRole} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { user } = useUser();
  const { signOut } = useClerk();
  const { data: me } = useGetMe();

  const { data: notifData } = useGetNotifications({ query: { queryKey: ["notifications"], refetchInterval: 60_000 } });
  const alertCount = notifData?.total ?? 0;

  const tenantName: string = me?.tenant?.name ?? "VisiteCRM";
  const tenantLogoUrl: string | undefined = me?.tenant?.logoUrl ?? undefined;
  const tenantPrimaryColor: string = me?.tenant?.primaryColor ?? "#3B82F6";
  const userRole: string | undefined = me?.role;
  const tenantInitial = tenantName.charAt(0).toUpperCase();

  // Find current nav item (including children)
  let currentSection: NavItem | undefined;
  for (const item of NAVIGATION) {
    if (location === item.href || (item.href !== "/" && location.startsWith(item.href))) {
      currentSection = item;
      break;
    }
    if (item.children) {
      const child = item.children.find(
        (c) => location === c.href || (c.href !== "/" && location.startsWith(c.href))
      );
      if (child) {
        currentSection = child;
        break;
      }
    }
  }

  return (
    <div className="flex h-screen bg-muted/30">
      {/* Sidebar */}
      <div className="w-60 bg-sidebar border-r flex flex-col shrink-0">
        {/* Tenant branding */}
        <div className="px-4 py-3 flex items-center gap-3 border-b border-sidebar-border">
          <div
            className="w-8 h-8 rounded-md flex items-center justify-center text-white font-bold text-sm shrink-0 overflow-hidden"
            style={{ background: tenantPrimaryColor }}
          >
            {tenantLogoUrl ? (
              <img src={tenantLogoUrl} alt="" className="w-full h-full object-contain" />
            ) : (
              <span>{tenantInitial}</span>
            )}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-sm text-sidebar-foreground truncate">{tenantName}</span>
            <span className="text-xs text-sidebar-foreground/50">CRM Turismo</span>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto py-3 px-2 flex flex-col gap-0.5">
          {NAVIGATION
            .filter(item => !item.roles || (userRole && item.roles.includes(userRole)))
            .filter(item => !item.hiddenFor || (userRole && !item.hiddenFor.includes(userRole)))
            .map((item) => (
              <NavLink key={item.name} item={item} location={location} userRole={userRole} />
            ))}
        </div>

        {/* User block */}
        <div className="p-3 border-t border-sidebar-border">
          <div className="flex items-center gap-2 px-2">
            <Avatar className="w-7 h-7 shrink-0">
              <AvatarImage src={user?.imageUrl} alt="" />
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                {user?.firstName?.[0] ?? "U"}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-xs font-medium text-sidebar-foreground truncate">
                {user?.fullName || "Usuário"}
              </span>
              {userRole && (
                <span className="text-xs text-sidebar-foreground/50">
                  {ROLE_LABELS[userRole] ?? userRole}
                </span>
              )}
            </div>
            <button
              onClick={() => signOut()}
              title="Sair"
              className="p-1 rounded-md text-sidebar-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header
          className="h-13 bg-background border-b px-6 flex items-center justify-between shrink-0"
          style={{ minHeight: "52px" }}
        >
          {/* Current section / breadcrumb */}
          <div className="flex items-center gap-2 text-sm">
            {currentSection ? (
              <>
                <currentSection.icon className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium text-foreground">{currentSection.name}</span>
              </>
            ) : (
              <>
                <Building2 className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium text-foreground">{tenantName}</span>
              </>
            )}
          </div>

          {/* Right side: notifications + user dropdown */}
          <div className="flex items-center gap-1">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 relative" title="Notificações">
                  <Bell className="w-4 h-4" />
                  {alertCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-4 h-4 text-[10px] font-bold bg-destructive text-destructive-foreground rounded-full flex items-center justify-center leading-none">
                      {alertCount > 9 ? "9+" : alertCount}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-0">
                <div className="px-4 py-3 border-b flex items-center justify-between">
                  <h4 className="text-sm font-semibold">Notificações</h4>
                  {alertCount > 0 && (
                    <Badge variant="destructive" className="text-[10px] h-4 px-1.5">{alertCount}</Badge>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto divide-y">
                  {!notifData || notifData.alerts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
                      <Bell className="w-8 h-8 opacity-30" />
                      <p className="text-sm">Nenhuma notificação ativa.</p>
                    </div>
                  ) : (
                    notifData.alerts.map((alert, i) => {
                      const Icon = alert.severity === "error" ? XCircle : alert.severity === "warning" ? AlertTriangle : Info;
                      const iconClass = alert.severity === "error" ? "text-destructive" : alert.severity === "warning" ? "text-amber-500" : "text-blue-500";
                      return (
                        <Link key={i} href={alert.link}>
                          <div className="flex items-start gap-3 px-4 py-3 hover:bg-muted/50 cursor-pointer transition-colors">
                            <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${iconClass}`} />
                            <div className="min-w-0">
                              <p className="text-sm font-medium leading-snug">{alert.title}</p>
                              <p className="text-xs text-muted-foreground leading-snug mt-0.5">{alert.message}</p>
                            </div>
                          </div>
                        </Link>
                      );
                    })
                  )}
                </div>
              </PopoverContent>
            </Popover>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 px-2 h-8">
                  <Avatar className="w-6 h-6">
                    <AvatarImage src={user?.imageUrl} alt="" />
                    <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                      {user?.firstName?.[0] ?? "U"}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium hidden sm:block max-w-[120px] truncate">
                    {user?.firstName || "Usuário"}
                  </span>
                  <ChevronDown className="w-3 h-3 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium">{user?.fullName}</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {user?.primaryEmailAddress?.emailAddress}
                    </span>
                  </div>
                </DropdownMenuLabel>
                {userRole && (
                  <div className="px-2 pb-1">
                    <Badge variant="secondary" className="text-xs">
                      {ROLE_LABELS[userRole] ?? userRole}
                    </Badge>
                  </div>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/configuracoes" className="cursor-pointer w-full flex items-center">
                    <Settings className="w-4 h-4 mr-2" />
                    Configurações
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive cursor-pointer"
                  onClick={() => signOut()}
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
