import { SignIn } from "@clerk/react";
import { useLocation } from "wouter";
import { useUser } from "@clerk/react";
import { useEffect } from "react";
import { PublicStore } from "@/lib/storeApi";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function VitrineSignIn({
  store,
}: {
  slug: string;
  store: PublicStore;
}) {
  const { isSignedIn } = useUser();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (isSignedIn) {
      navigate("/perfil", { replace: true });
    }
  }, [isSignedIn, navigate]);

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-start justify-center pt-10 pb-16 px-4 bg-gray-50">
      <div className="w-full max-w-md space-y-6">
        <div
          className="rounded-2xl p-8 text-white text-center"
          style={{
            background: `linear-gradient(135deg, ${store.primaryColor}, ${store.secondaryColor || store.primaryColor}cc)`,
          }}
        >
          {store.logoUrl ? (
            <img
              src={store.logoUrl}
              alt={store.name}
              className="h-16 w-16 mx-auto mb-3 rounded-xl object-contain bg-white/10 p-2"
            />
          ) : (
            <div
              className="h-16 w-16 mx-auto mb-3 rounded-xl bg-white/20 flex items-center justify-center font-bold text-2xl"
            >
              {store.name.charAt(0)}
            </div>
          )}
          <h1 className="text-2xl font-bold">{store.name}</h1>
          <p className="text-white/80 text-sm mt-1">
            Acesse sua Área do Cliente
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border p-6">
          <p className="text-sm text-muted-foreground text-center mb-4">
            Entre com o e-mail e a senha enviados após a sua reserva.
          </p>
          <SignIn
            routing="hash"
            fallbackRedirectUrl="/perfil"
            forceRedirectUrl="/perfil"
            signUpUrl={`${basePath}/sign-up`}
            appearance={{
              elements: {
                rootBox: "w-full",
                card: "shadow-none border-0 p-0 bg-transparent",
                headerTitle: "hidden",
                headerSubtitle: "hidden",
                socialButtonsBlockButton: "border rounded-lg h-11",
                formButtonPrimary: "h-11 rounded-lg",
                footerAction: "hidden",
              },
              variables: {
                colorPrimary: store.primaryColor,
              },
            }}
          />
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Não fez nenhuma reserva?{" "}
          <a
            href={`/loja/${store.slug}`}
            className="underline hover:text-foreground"
          >
            Ver pacotes disponíveis
          </a>
        </p>
      </div>
    </div>
  );
}
