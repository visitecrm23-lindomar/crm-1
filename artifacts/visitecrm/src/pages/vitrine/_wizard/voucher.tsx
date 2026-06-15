import { useState, useEffect } from "react";
import { MapPin, Calendar, Clock, Armchair } from "lucide-react";
import QRCode from "qrcode";
import { PublicStore, StoreProduct } from "@/lib/storeApi";
import { calculateTripDuration } from "@/lib/tripDuration";
import { fmtDate, PAYMENT_LABELS } from "./constants";

export function Voucher({
  order,
  product,
  store,
  customerName,
  seats,
  paymentMethod,
  referralDiscount = 0,
  referralDiscountType,
  referralDiscountPct,
  couponDiscount = 0,
  couponCode,
}: {
  order: { orderNumber: string; totalAmount: string; createdAt: string };
  product: StoreProduct;
  store: PublicStore;
  customerName: string;
  seats: (number | string)[];
  paymentMethod: string;
  referralDiscount?: number;
  referralDiscountType?: string;
  referralDiscountPct?: number;
  couponDiscount?: number;
  couponCode?: string;
}) {
  const [qrDataUrl, setQrDataUrl] = useState("");

  useEffect(() => {
    if (order.orderNumber) {
      QRCode.toDataURL(order.orderNumber, { width: 80, margin: 1, errorCorrectionLevel: "M" })
        .then((url) => setQrDataUrl(url))
        .catch(() => {});
    }
  }, [order.orderNumber]);

  const startDate = product.departureDate ?? product.startDate;
  const images = product.images ?? [];

  return (
    <div
      id="voucher"
      className="border-2 border-dashed border-primary/40 rounded-2xl p-6 bg-white max-w-lg mx-auto print:block print:border-solid print:border-gray-300"
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          {store.logoUrl ? (
            <img src={store.logoUrl} alt={store.name} className="h-10 object-contain" />
          ) : (
            <p className="font-bold text-lg" style={{ color: store.primaryColor }}>
              {store.name}
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-0.5">Voucher de Reserva</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Pedido</p>
          <p className="font-mono font-bold text-primary text-lg">{order.orderNumber}</p>
        </div>
      </div>

      <div
        className="h-1 rounded-full mb-4"
        style={{ background: `linear-gradient(90deg, ${store.primaryColor}, ${store.secondaryColor})` }}
      />

      <div className="flex gap-4 mb-4">
        {images[0] && (
          <div className="w-20 h-20 rounded-lg overflow-hidden shrink-0">
            <img src={images[0]} alt={product.name} className="w-full h-full object-cover" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-bold text-base leading-tight mb-1">{product.name}</p>
          {product.destination && (
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 shrink-0" /> {product.destination}
            </p>
          )}
          {startDate && (
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 shrink-0" /> {fmtDate(startDate)}
            </p>
          )}
          {(() => {
            const dur =
              calculateTripDuration(
                product.departureDate ?? product.startDate,
                product.endDate,
                product.departureTime,
                product.returnTime,
              ) ??
              (product.durationDays
                ? { formatted: `${product.durationDays} dia${product.durationDays > 1 ? "s" : ""}` }
                : null);
            return dur ? (
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 shrink-0" /> {dur.formatted}
              </p>
            ) : null;
          })()}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm mb-4">
        <div className="bg-muted/50 rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-0.5">Passageiro</p>
          <p className="font-semibold">{customerName}</p>
        </div>
        {seats.length > 0 && (
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
              <Armchair className="w-3 h-3" /> Assento(s)
            </p>
            <p className="font-semibold">{seats.join(", ")}</p>
          </div>
        )}
        <div className="bg-muted/50 rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-0.5">Pagamento</p>
          <p className="font-semibold">{PAYMENT_LABELS[paymentMethod] ?? paymentMethod}</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-0.5">Total</p>
          <p className="font-bold text-green-700 text-base">
            R$ {parseFloat(order.totalAmount).toFixed(2)}
          </p>
        </div>
      </div>

      {(referralDiscount > 0 || couponDiscount > 0) && (
        <div className="border border-green-200 bg-green-50 rounded-lg px-3 py-2 mb-4 space-y-1 text-sm text-green-800">
          <p className="text-xs font-semibold text-green-700 mb-1">Descontos aplicados</p>
          {referralDiscount > 0 && (
            <div className="flex justify-between">
              <span>
                {referralDiscountType === "percentage" && referralDiscountPct != null
                  ? `Desconto de indicação (${referralDiscountPct}%)`
                  : "Desconto de indicação"}
              </span>
              <span className="font-semibold">− R$ {referralDiscount.toFixed(2)}</span>
            </div>
          )}
          {couponDiscount > 0 && (
            <div className="flex justify-between">
              <span>{couponCode ? `Cupom ${couponCode}` : "Desconto de cupom"}</span>
              <span className="font-semibold">− R$ {couponDiscount.toFixed(2)}</span>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-4 border-t pt-4">
        <div className="shrink-0">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="QR Code do pedido" className="w-20 h-20 rounded-lg" />
          ) : (
            <div className="w-20 h-20 bg-muted rounded-lg flex items-center justify-center">
              <p className="text-[10px] text-muted-foreground">QR Code</p>
            </div>
          )}
        </div>
        <div className="flex-1 text-xs text-muted-foreground leading-relaxed">
          <p>Apresente este voucher no embarque. Em caso de dúvidas, entre em contato com nossa equipe.</p>
          {store.contactWhatsapp && (
            <p className="mt-1 font-medium text-foreground">WhatsApp: {store.contactWhatsapp}</p>
          )}
          {store.contactEmail && (
            <p className="font-medium text-foreground">{store.contactEmail}</p>
          )}
        </div>
      </div>
    </div>
  );
}
