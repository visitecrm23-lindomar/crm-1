import { useState, useEffect } from "react";
import { useParams, Switch, Route, Redirect } from "wouter";
import { publicStoreApi, PublicStore } from "@/lib/storeApi";
import { CartProvider } from "@/contexts/CartContext";
import VitrineLayout from "./layout";
import VitrineHome from "./home";
import VitrineCatalog from "./catalog";
import VitrineProduct from "./product";
import VitrineCheckout from "./checkout";
import VitrineOrderTracking from "./order-tracking";
import { Loader2 } from "lucide-react";

function StoreRouter({ slug }: { slug: string }) {
  const [store, setStore] = useState<PublicStore | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    publicStoreApi
      .getStore(slug)
      .then((s) => setStore(s))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !store) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center px-4">
        <h1 className="text-4xl font-bold mb-2">404</h1>
        <p className="text-muted-foreground text-lg mb-6">Loja não encontrada.</p>
        <a href="/" className="text-primary underline">
          Voltar ao início
        </a>
      </div>
    );
  }

  if (store.maintenanceMode) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center text-center px-4 text-white"
        style={{
          background: `linear-gradient(135deg, ${store.primaryColor}, ${store.secondaryColor})`,
        }}
      >
        {store.logoUrl && (
          <img src={store.logoUrl} alt={store.name} className="h-20 mb-6 rounded-lg" />
        )}
        <h1 className="text-3xl font-bold mb-3">{store.name}</h1>
        <p className="text-white/80 max-w-md text-lg">
          {store.maintenanceMessage ?? "Estamos em manutenção. Voltamos em breve!"}
        </p>
      </div>
    );
  }

  return (
    <VitrineLayout slug={slug} store={store}>
      <Switch>
        <Route path={`/loja/${slug}`}>
          <VitrineHome slug={slug} store={store} />
        </Route>
        <Route path={`/loja/${slug}/catalogo`}>
          <VitrineCatalog slug={slug} store={store} />
        </Route>
        <Route path={`/loja/${slug}/produto/:productSlug`}>
          {(params: Record<string, string>) => (
            <VitrineProduct
              slug={slug}
              productSlug={params.productSlug}
              store={store}
            />
          )}
        </Route>
        <Route path={`/loja/${slug}/checkout`}>
          <VitrineCheckout slug={slug} store={store} />
        </Route>
        <Route path={`/loja/${slug}/pedido/:orderNumber`}>
          {(params: Record<string, string>) => (
            <VitrineOrderTracking
              slug={slug}
              store={store}
              initialOrderNumber={params.orderNumber}
            />
          )}
        </Route>
        <Route path={`/loja/${slug}/consultar-pedido`}>
          <VitrineOrderTracking slug={slug} store={store} />
        </Route>
        <Route>
          <Redirect to={`/loja/${slug}`} />
        </Route>
      </Switch>
    </VitrineLayout>
  );
}

export default function Vitrine() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug ?? "";

  if (!slug) {
    return <Redirect to="/" />;
  }

  return (
    <CartProvider>
      <StoreRouter slug={slug} />
    </CartProvider>
  );
}
