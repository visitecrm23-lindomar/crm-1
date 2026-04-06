import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useUser, useClerk } from "@clerk/react";
import { useGetMe } from "@workspace/api-client-react";
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

const NAVIGATION = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Pipeline", href: "/pipeline", icon: Trello },
  { name: "Clientes", href: "/clients", icon: Users },
  { name: "Viagens", href: "/trips", icon: Map },
  { name: "Reservas", href: "/reservations", icon: CalendarCheck },
  { name: "Financeiro", href: "/financeiro", icon: DollarSign },
  { name: "Comunicação", href: "/communication", icon: MessageSquare },
  { name: "Automações", href: "/automations", icon: Zap },
  { name: "Marketing", href: "/marketing", icon: Target },
  { name: "Cadastros", href: "/registrations", icon: BookOpen },
  { name: "Analíticos", href: "/analytics", icon: BarChart2 },
  { name: "Configurações", href: "/settings", icon: Settings },
];

const ROLE_LABELS: Record<string, string> = {
  superadmin: "Super Admin",
  agencia: "Agência",
  vendedor: "Vendedor",
  cliente: "Cliente",
};

export default function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { user } = useUser();
  const { signOut } = useClerk();
  const { data: me } = useGetMe();

  const tenantName: string = me?.tenant?.name ?? "VisiteCRM";
  const tenantLogoUrl: string | undefined = me?.tenant?.logoUrl ?? undefined;
  const tenantPrimaryColor: string = me?.tenant?.primaryColor ?? "#3B82F6";
  const userRole: string | undefined = me?.role;
  const tenantInitial = tenantName.charAt(0).toUpperCase();
  const currentSection = NAVIGATION.find(
    (n) => location === n.href || (n.href !== "/" && location.startsWith(n.href))
  );

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
          {NAVIGATION.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                }`}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                {item.name}
              </Link>
            );
          })}
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
              <span className="text-xs font-medium text-sidebar-foreground truncate">{user?.fullName || "Usuário"}</span>
              {userRole && (
                <span className="text-xs text-sidebar-foreground/50">{ROLE_LABELS[userRole] ?? userRole}</span>
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
        <header className="h-13 bg-background border-b px-6 flex items-center justify-between shrink-0" style={{ minHeight: "52px" }}>
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
            <Button variant="ghost" size="icon" className="h-8 w-8" title="Notificações">
              <Bell className="w-4 h-4" />
            </Button>

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
                    <span className="text-xs font-normal text-muted-foreground">{user?.primaryEmailAddress?.emailAddress}</span>
                  </div>
                </DropdownMenuLabel>
                {userRole && (
                  <div className="px-2 pb-1">
                    <Badge variant="secondary" className="text-xs">{ROLE_LABELS[userRole] ?? userRole}</Badge>
                  </div>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/settings" className="cursor-pointer w-full flex items-center">
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
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
