import { ReactNode } from "react";
import { useClerk } from "@clerk/react";
import { useGetMe } from "@workspace/api-client-react";
import { UserCircle, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PortalLayout({ children }: { children: ReactNode }) {
  const { signOut } = useClerk();
  const { data: me } = useGetMe();

  const tenant = me?.tenant;
  const primaryColor = tenant?.primaryColor ?? "#3B82F6";

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">
      <header
        className="sticky top-0 z-40 border-b shadow-sm"
        style={{ backgroundColor: primaryColor }}
      >
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {tenant?.logoUrl ? (
              <img
                src={tenant.logoUrl}
                alt={tenant.name ?? ""}
                className="h-9 w-9 rounded object-contain bg-white/10 p-1"
              />
            ) : (
              <div className="h-9 w-9 rounded bg-white/20 flex items-center justify-center font-bold text-white text-base">
                {tenant?.name?.charAt(0) ?? "V"}
              </div>
            )}
            <span className="text-white font-semibold text-base hidden sm:block">
              {tenant?.name ?? "VisiteCRM"}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-white/90">
              <UserCircle className="w-4 h-4" />
              <span className="text-sm font-medium hidden sm:block">Meu Perfil</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => signOut({ redirectUrl: tenant?.slug ? `/loja/${tenant.slug}` : "/" })}
              className="text-white/80 hover:text-white hover:bg-white/20 gap-1.5"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:block">Sair</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">{children}</main>

      <footer className="border-t bg-gray-900 text-gray-400 py-4 text-center text-xs">
        {tenant?.name} · Powered by VisiteCRM
      </footer>
    </div>
  );
}
