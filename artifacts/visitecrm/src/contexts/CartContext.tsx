import {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from "react";

export interface CartItem {
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  variantLabel?: string;
  image?: string;
}

interface CartContextType {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "quantity"> & { quantity?: number }) => void;
  updateQuantity: (productId: string, variantLabel: string | undefined, quantity: number) => void;
  removeItem: (productId: string, variantLabel?: string) => void;
  clearCart: () => void;
  total: number;
  itemCount: number;
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  toggleCart: () => void;
}

const CartContext = createContext<CartContextType | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const addItem = useCallback(
    (item: Omit<CartItem, "quantity"> & { quantity?: number }) => {
      setItems((prev) => {
        const key = `${item.productId}::${item.variantLabel ?? ""}`;
        const existing = prev.find(
          (i) =>
            `${i.productId}::${i.variantLabel ?? ""}` === key
        );
        if (existing) {
          return prev.map((i) =>
            `${i.productId}::${i.variantLabel ?? ""}` === key
              ? { ...i, quantity: i.quantity + (item.quantity ?? 1) }
              : i
          );
        }
        return [...prev, { ...item, quantity: item.quantity ?? 1 }];
      });
    },
    []
  );

  const updateQuantity = useCallback(
    (productId: string, variantLabel: string | undefined, quantity: number) => {
      setItems((prev) => {
        const key = `${productId}::${variantLabel ?? ""}`;
        if (quantity <= 0) {
          return prev.filter(
            (i) => `${i.productId}::${i.variantLabel ?? ""}` !== key
          );
        }
        return prev.map((i) =>
          `${i.productId}::${i.variantLabel ?? ""}` === key
            ? { ...i, quantity }
            : i
        );
      });
    },
    []
  );

  const removeItem = useCallback(
    (productId: string, variantLabel?: string) => {
      const key = `${productId}::${variantLabel ?? ""}`;
      setItems((prev) =>
        prev.filter((i) => `${i.productId}::${i.variantLabel ?? ""}` !== key)
      );
    },
    []
  );

  const clearCart = useCallback(() => setItems([]), []);
  const openCart = useCallback(() => setIsOpen(true), []);
  const closeCart = useCallback(() => setIsOpen(false), []);
  const toggleCart = useCallback(() => setIsOpen((v) => !v), []);

  const total = items.reduce((acc, i) => acc + i.unitPrice * i.quantity, 0);
  const itemCount = items.reduce((acc, i) => acc + i.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        addItem,
        updateQuantity,
        removeItem,
        clearCart,
        total,
        itemCount,
        isOpen,
        openCart,
        closeCart,
        toggleCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}
