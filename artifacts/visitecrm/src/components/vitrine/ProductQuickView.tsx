import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { PublicStore, StoreProduct } from "@/lib/storeApi";
import {
  X,
  Bus,
  MapPin,
  Calendar,
  Clock,
  Users,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Star,
  ExternalLink,
  MessageCircle,
} from "lucide-react";

const TYPE_LABELS: Record<string, string> = {
  excursion: "Excursão",
  package: "Pacote",
  tour: "Passeio",
  transfer: "Transfer",
  cruise: "Cruzeiro",
  hotel: "Hotel",
  service: "Serviço",
  custom: "Personalizado",
};

function fmtDate(d?: string | null) {
  if (!d) return null;
  const clean = d.length <= 10 ? d + "T12:00:00" : d;
  return new Date(clean).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function ProductQuickView({
  product,
  store,
  storeSlug,
  open,
  onClose,
}: {
  product: StoreProduct;
  store: PublicStore;
  storeSlug: string;
  open: boolean;
  onClose: () => void;
}) {
  const [imgIndex, setImgIndex] = useState(0);
  const [, navigate] = useLocation();

  useEffect(() => {
    setImgIndex(0);
  }, [product.id, open]);


  const displayPrice = parseFloat(product.salePrice ?? product.price);
  const hasDiscount = !!product.salePrice;
  const isOutOfStock = product.trackInventory && (product.stockQuantity ?? 0) <= 0;
  const availableSeats =
    product.availableSeats ?? (product.trackInventory ? (product.stockQuantity ?? null) : null);
  const images = product.images ?? [];
  const includes = product.includes ?? [];
  const excludes = product.excludes ?? [];
  const features = product.features ?? [];
  const requirements = product.requirements ?? [];
  const startDate = product.departureDate ?? product.startDate;
  const typeLabel = TYPE_LABELS[product.type] ?? product.type;

  function prevImg() {
    setImgIndex((i) => (i - 1 + images.length) % images.length);
  }
  function nextImg() {
    setImgIndex((i) => (i + 1) % images.length);
  }

  function handleReserve() {
    navigate(`/loja/${storeSlug}/reservar/${product.slug}`);
    onClose();
  }

  function handleWhatsApp() {
    const phone = store.contactWhatsapp?.replace(/\D/g, "");
    if (!phone) return;
    const text = encodeURIComponent(
      `Olá! Tenho interesse na viagem: ${product.name}`
    );
    window.open(`https://wa.me/${phone}?text=${text}`, "_blank");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="max-w-2xl p-0 overflow-hidden gap-0 [&>button.absolute]:hidden">
        <div className="relative h-72 bg-gradient-to-br from-blue-400 to-blue-600 overflow-hidden shrink-0">
          {images.length > 0 ? (
            <>
              <img
                src={images[imgIndex]}
                alt={product.name}
                className="w-full h-full object-cover"
              />
              {images.length > 1 && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      prevImg();
                    }}
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      nextImg();
                    }}
                    className="absolute right-12 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center transition-colors"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                    {images.map((_, i) => (
                      <button
                        key={i}
                        onClick={(e) => {
                          e.stopPropagation();
                          setImgIndex(i);
                        }}
                        className={`rounded-full transition-all ${
                          i === imgIndex
                            ? "w-5 h-2 bg-white"
                            : "w-2 h-2 bg-white/50 hover:bg-white/80"
                        }`}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Bus className="w-20 h-20 text-white/30" />
            </div>
          )}

          <span
            className="absolute top-3 left-3 text-xs font-bold text-white px-2.5 py-1 rounded-full shadow"
            style={{ backgroundColor: store.primaryColor }}
          >
            {typeLabel}
          </span>

          {product.isFeatured && (
            <span className="absolute top-3 left-[calc(theme(spacing.3)+4.5rem)] text-xs font-bold text-amber-900 bg-yellow-400 px-2.5 py-1 rounded-full flex items-center gap-1 shadow">
              <Star className="w-3 h-3 fill-amber-900" /> Destaque
            </span>
          )}

          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center transition-colors z-10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-4" style={{ maxHeight: "calc(90vh - 280px - 68px)" }}>
          <div>
            <h2 className="text-xl font-bold leading-tight">{product.name}</h2>
            {product.destination && (
              <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                <MapPin className="w-3.5 h-3.5 shrink-0" />
                {product.destination}
              </p>
            )}
          </div>

          {(startDate || product.durationDays || availableSeats !== null) && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {startDate && (
                <div className="flex items-center gap-2 p-2.5 bg-blue-50 rounded-lg">
                  <Calendar className="w-4 h-4 text-blue-600 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[10px] text-muted-foreground">Saída</p>
                    <p className="text-xs font-semibold truncate">{fmtDate(startDate)}</p>
                  </div>
                </div>
              )}
              {product.durationDays && (
                <div className="flex items-center gap-2 p-2.5 bg-purple-50 rounded-lg">
                  <Clock className="w-4 h-4 text-purple-600 shrink-0" />
                  <div>
                    <p className="text-[10px] text-muted-foreground">Duração</p>
                    <p className="text-xs font-semibold">
                      {product.durationDays}d
                      {product.durationNights
                        ? ` / ${product.durationNights}n`
                        : ""}
                    </p>
                  </div>
                </div>
              )}
              {availableSeats !== null && availableSeats >= 0 && (
                <div className="flex items-center gap-2 p-2.5 bg-green-50 rounded-lg">
                  <Users className="w-4 h-4 text-green-600 shrink-0" />
                  <div>
                    <p className="text-[10px] text-muted-foreground">Vagas</p>
                    <p
                      className={`text-xs font-semibold ${
                        availableSeats === 0
                          ? "text-red-600"
                          : availableSeats <= 10
                          ? "text-orange-600"
                          : ""
                      }`}
                    >
                      {availableSeats === 0
                        ? "Esgotado"
                        : `${availableSeats} disp.`}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {product.shortDescription && (
            <p className="text-sm text-muted-foreground">{product.shortDescription}</p>
          )}

          {product.description && (
            <div>
              <h3 className="text-sm font-semibold mb-1.5">Sobre a Viagem</h3>
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap line-clamp-6">
                {product.description}
              </p>
            </div>
          )}

          {(includes.length > 0 || excludes.length > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {includes.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-green-700 mb-2 flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" /> O que inclui
                  </h3>
                  <ul className="space-y-1.5">
                    {includes.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {excludes.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-red-700 mb-2 flex items-center gap-1">
                    <XCircle className="w-4 h-4" /> Não inclui
                  </h3>
                  <ul className="space-y-1.5">
                    {excludes.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {features.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2">Destaques</h3>
              <ul className="space-y-1.5">
                {features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-400 shrink-0 mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {requirements.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2">Requisitos</h3>
              <ul className="space-y-1.5">
                {requirements.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0 mt-1.5" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="h-1" />
        </div>

        <div className="border-t px-5 py-3 bg-white shrink-0">
          <div className="flex items-center justify-between gap-4 mb-1.5">
            <div>
              <p className="text-[11px] text-muted-foreground">Preço por pessoa</p>
              <div className="flex items-baseline gap-2">
                {hasDiscount && (
                  <span className="text-sm text-muted-foreground line-through">
                    R$ {parseFloat(product.price).toFixed(2)}
                  </span>
                )}
                <span
                  className="text-2xl font-bold"
                  style={{ color: store.primaryColor }}
                >
                  R$ {displayPrice.toFixed(2)}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {store.contactWhatsapp && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleWhatsApp}
                  className="border-green-500 text-green-600 hover:bg-green-50"
                >
                  <MessageCircle className="w-4 h-4" />
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  navigate(`/loja/${storeSlug}/produtos/${product.slug}`);
                  onClose();
                }}
                className="flex items-center gap-1"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Ver Detalhes
              </Button>
              <Button
                size="sm"
                className="font-semibold text-white px-5"
                style={
                  !isOutOfStock
                    ? { backgroundColor: store.accentColor || store.primaryColor }
                    : undefined
                }
                disabled={isOutOfStock}
                onClick={handleReserve}
              >
                {isOutOfStock ? "Esgotado" : "Reservar Agora"}
              </Button>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <button
              onClick={() => {
                navigate(`/loja/${storeSlug}/consultar-pedido`);
                onClose();
              }}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 flex items-center gap-0.5 transition-colors"
            >
              Consultar pedido existente
              <ExternalLink className="w-3 h-3 ml-0.5" />
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
