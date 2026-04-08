import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { useCart } from "@/contexts/CartContext";
import { PublicStore } from "@/lib/storeApi";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ShoppingCart, X, Minus, Plus, Trash2, Phone, Mail, Instagram, Facebook, Youtube, MapPin } from "lucide-react";

function CartDrawer({ slug, store }: { slug: string; store: PublicStore }) {
  const { items, isOpen, closeCart, updateQuantity, removeItem, total, clearCart } = useCart();
  const [, navigate] = useLocation();

  function goCheckout() {
    closeCart();
    navigate(`/loja/${slug}/checkout`);
  }

  return (
    <Sheet open={isOpen} onOpenChange={(o) => !o && closeCart()}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5" />
            Seu Carrinho ({items.length} {items.length === 1 ? "item" : "itens"})
          </SheetTitle>
        </SheetHeader>
        {items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
            <ShoppingCart className="w-16 h-16 mb-4 opacity-20" />
            <p>Seu carrinho está vazio</p>
            <Button variant="outline" className="mt-4" onClick={closeCart}>
              Continuar Comprando
            </Button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto space-y-3 py-4">
              {items.map((item) => {
                const key = `${item.productId}::${item.variantLabel ?? ""}`;
                return (
                  <div key={key} className="flex gap-3 p-3 rounded-lg border">
                    {item.image && (
                      <img
                        src={item.image}
                        alt={item.productName}
                        className="w-16 h-16 object-cover rounded"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm line-clamp-2">{item.productName}</p>
                      {item.variantLabel && (
                        <p className="text-xs text-muted-foreground">{item.variantLabel}</p>
                      )}
                      <p className="text-sm font-semibold mt-1">
                        R$ {(item.unitPrice * item.quantity).toFixed(2)}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          onClick={() =>
                            updateQuantity(item.productId, item.variantLabel, item.quantity - 1)
                          }
                          className="w-6 h-6 rounded border flex items-center justify-center hover:bg-muted"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="text-sm font-medium w-6 text-center">{item.quantity}</span>
                        <button
                          onClick={() =>
                            updateQuantity(item.productId, item.variantLabel, item.quantity + 1)
                          }
                          className="w-6 h-6 rounded border flex items-center justify-center hover:bg-muted"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => removeItem(item.productId, item.variantLabel)}
                          className="ml-auto p-1 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="border-t pt-4 space-y-3">
              <div className="flex justify-between font-bold text-lg">
                <span>Total</span>
                <span>R$ {total.toFixed(2)}</span>
              </div>
              <Button
                className="w-full"
                style={{ backgroundColor: store.primaryColor }}
                onClick={goCheckout}
              >
                Finalizar Pedido
              </Button>
              <Button variant="outline" className="w-full" onClick={clearCart}>
                Limpar Carrinho
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default function VitrineLayout({
  children,
  slug,
  store,
}: {
  children: ReactNode;
  slug: string;
  store: PublicStore;
}) {
  const { itemCount, openCart } = useCart();
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header
        className="sticky top-0 z-40 border-b shadow-sm"
        style={{ backgroundColor: store.primaryColor }}
      >
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <button
            onClick={() => navigate(`/loja/${slug}`)}
            className="flex items-center gap-3"
          >
            {store.logoUrl ? (
              <img
                src={store.logoUrl}
                alt={store.name}
                className="h-10 w-10 rounded object-contain bg-white/10 p-1"
              />
            ) : (
              <div className="h-10 w-10 rounded bg-white/20 flex items-center justify-center font-bold text-white text-lg">
                {store.name.charAt(0)}
              </div>
            )}
            <span className="text-white font-bold text-lg hidden sm:block">
              {store.name}
            </span>
          </button>

          <nav className="hidden md:flex items-center gap-6">
            <a
              href={`/loja/${slug}`}
              className="text-white/90 hover:text-white text-sm font-medium transition-colors"
            >
              Início
            </a>
            <a
              href={`/loja/${slug}/catalogo`}
              className="text-white/90 hover:text-white text-sm font-medium transition-colors"
            >
              Pacotes
            </a>
            {store.contactWhatsapp && (
              <a
                href={`https://wa.me/${store.contactWhatsapp.replace(/\D/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/90 hover:text-white text-sm font-medium transition-colors"
              >
                Contato
              </a>
            )}
          </nav>

          <button
            onClick={openCart}
            className="relative flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg transition-colors"
          >
            <ShoppingCart className="w-5 h-5" />
            <span className="hidden sm:block text-sm font-medium">Carrinho</span>
            {itemCount > 0 && (
              <span
                className="absolute -top-2 -right-2 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white"
                style={{ backgroundColor: store.accentColor }}
              >
                {itemCount}
              </span>
            )}
          </button>
        </div>
      </header>

      <main className="flex-1">
        {children}
      </main>

      <footer className="border-t bg-gray-900 text-gray-300">
        <div className="max-w-6xl mx-auto px-4 py-10 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <h3 className="text-white font-bold mb-3">{store.name}</h3>
            {store.description && (
              <p className="text-sm leading-relaxed">{store.description}</p>
            )}
          </div>
          <div>
            <h3 className="text-white font-bold mb-3">Contato</h3>
            <div className="space-y-2 text-sm">
              {store.contactEmail && (
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  <a href={`mailto:${store.contactEmail}`} className="hover:text-white">
                    {store.contactEmail}
                  </a>
                </div>
              )}
              {store.contactPhone && (
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4" />
                  <span>{store.contactPhone}</span>
                </div>
              )}
              {store.contactAddress && (
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  <span>{store.contactAddress}</span>
                </div>
              )}
            </div>
          </div>
          <div>
            <h3 className="text-white font-bold mb-3">Redes Sociais</h3>
            <div className="flex gap-3">
              {store.socialInstagram && (
                <a
                  href={`https://instagram.com/${store.socialInstagram.replace("@", "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white"
                >
                  <Instagram className="w-5 h-5" />
                </a>
              )}
              {store.socialFacebook && (
                <a
                  href={store.socialFacebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white"
                >
                  <Facebook className="w-5 h-5" />
                </a>
              )}
              {store.socialYoutube && (
                <a
                  href={store.socialYoutube}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white"
                >
                  <Youtube className="w-5 h-5" />
                </a>
              )}
            </div>
          </div>
        </div>
        <div className="border-t border-gray-800 text-center py-4 text-xs text-gray-500">
          {store.name} · Powered by VisiteCRM
        </div>
      </footer>

      <CartDrawer slug={slug} store={store} />
    </div>
  );
}
