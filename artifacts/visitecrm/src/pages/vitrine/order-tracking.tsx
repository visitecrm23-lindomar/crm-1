import { useEffect } from "react";
import { useLocation } from "wouter";
import { useUser } from "@clerk/react";
import { useGetMe } from "@workspace/api-client-react";
import { Loader2 } from "lucide-react";
import { ROLES } from "@workspace/permissions";

export default function VitrineOrderTracking({
  slug: _slug,
}: {
  slug: string;
  store?: unknown;
  initialOrderNumber?: string;
}) {
  const [, navigate] = useLocation();
  const { isSignedIn, isLoaded } = useUser();
  const { data: me, isLoading: meLoading } = useGetMe();

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      navigate("/sign-in?redirect_url=%2Fperfil");
      return;
    }
    if (meLoading) return;
    if (me?.role === ROLES.CLIENT) {
      navigate("/perfil");
    } else if (me?.role) {
      navigate("/dashboard");
    }
  }, [isLoaded, isSignedIn, me?.role, meLoading]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
    </div>
  );
}
