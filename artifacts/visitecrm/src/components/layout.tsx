import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useUser, useClerk } from "@clerk/react";
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
  BookOpen
} from "lucide-react";

export default function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { user } = useUser();
  const { signOut } = useClerk();

  const navigation = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { name: "Pipeline", href: "/pipeline", icon: Trello },
    { name: "Clientes", href: "/clients", icon: Users },
    { name: "Viagens", href: "/trips", icon: Map },
    { name: "Reservas", href: "/reservations", icon: CalendarCheck },
    { name: "Financeiro", href: "/financial", icon: DollarSign },
    { name: "Comunicação", href: "/communication", icon: MessageSquare },
    { name: "Automações", href: "/automations", icon: Zap },
    { name: "Marketing", href: "/marketing", icon: Target },
    { name: "Cadastros", href: "/registrations", icon: BookOpen },
    { name: "Configurações", href: "/settings", icon: Settings },
  ];

  return (
    <div className="flex h-screen bg-muted/30">
      <div className="w-60 bg-sidebar border-r flex flex-col shrink-0">
        <div className="px-5 py-4 flex items-center gap-3 border-b border-sidebar-border">
          <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">
            V
          </div>
          <span className="font-bold text-base text-sidebar-foreground">VisiteCRM</span>
        </div>
        
        <div className="flex-1 overflow-y-auto py-4 px-3 flex flex-col gap-0.5">
          {navigation.map((item) => {
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

        <div className="p-3 border-t border-sidebar-border">
          <div className="flex items-center gap-3 mb-3 px-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 overflow-hidden shrink-0">
              {user?.imageUrl ? (
                <img src={user.imageUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-primary font-bold text-xs">
                  {user?.firstName?.[0] ?? "U"}
                </div>
              )}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium text-sidebar-foreground truncate">{user?.fullName || "Usuário"}</span>
              <span className="text-xs text-sidebar-foreground/50 truncate">{user?.primaryEmailAddress?.emailAddress}</span>
            </div>
          </div>
          <button 
            onClick={() => signOut()}
            className="flex items-center gap-3 px-3 py-2 w-full rounded-md text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sair
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
