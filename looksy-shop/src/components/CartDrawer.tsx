import { Link, useNavigate } from "react-router-dom";
import { useCart } from "@/store/cart";
import { useUi } from "@/store/ui";
import { PRODUCTS } from "@/data/products";
import { formatGBP } from "@/utils";
import ProductImage from "./ProductImage";
import "./CartDrawer.css";

export default function CartDrawer() {
  const isOpen = useUi((s) => s.cartDrawerOpen);
  const close = useUi((s) => s.closeCartDrawer);
  const items = useCart((s) => s.items);
  const subtotal = useCart((s) => s.subtotal());
  const updateQty = useCart((s) => s.updateQuantity);
  const removeItem = useCart((s) => s.removeItem);
  const navigate = useNavigate();

  if (!isOpen) return null;

  return (
    <div className="cart-drawer-root" data-testid="cart-drawer-root">
      <div
        className="cart-drawer-backdrop"
        onClick={close}
        data-testid="cart-drawer-backdrop"
      />
      <aside className="cart-drawer" data-testid="cart-drawer" role="dialog" aria-label="Shopping cart">
        <header className="cart-drawer-header">
          <h2 className="font-display">Your bag</h2>
          <button
            type="button"
            className="font-mono cart-drawer-close"
            onClick={close}
            data-testid="cart-drawer-close"
            aria-label="Close cart"
          >
            Close
          </button>
        </header>

        {items.length === 0 ? (
          <div className="cart-drawer-empty" data-testid="cart-drawer-empty">
            <p className="font-display" style={{ fontSize: "1.3rem" }}>
              Your bag is empty
            </p>
            <p className="text-mute" style={{ fontSize: "0.9rem", marginBottom: "var(--space-5)" }}>
              Choose pieces from the latest collection
            </p>
            <button
              type="button"
              className="button-primary"
              onClick={() => {
                close();
                navigate("/shop");
              }}
              data-testid="empty-cart-shop-button"
            >
              Discover the collection
            </button>
          </div>
        ) : (
          <>
            <ul className="cart-drawer-items" data-testid="cart-drawer-items">
              {items.map((item) => {
                const product = PRODUCTS.find((p) => p.id === item.productId);
                if (!product) return null;
                const color = product.colors.find((c) => c.id === item.colorId);
                const stock = product.stock[`${item.colorId}:${item.size}`] ?? 0;
                return (
                  <li
                    key={`${item.productId}-${item.colorId}-${item.size}`}
                    className="cart-drawer-item"
                    data-testid={`cart-item-${item.productId}-${item.colorId}-${item.size}`}
                    data-product-id={item.productId}
                  >
                    <div className="cart-drawer-item-image">
                      <ProductImage product={product} selectedColor={color} size="sm" />
                    </div>
                    <div className="cart-drawer-item-meta">
                      <Link
                        to={`/product/${product.slug}`}
                        onClick={close}
                        className="cart-drawer-item-name font-display"
                        data-testid="cart-item-name"
                      >
                        {product.name}
                      </Link>
                      <div className="cart-drawer-item-variant font-mono text-mute">
                        <span data-testid="cart-item-color">{color?.name}</span>
                        <span> · </span>
                        <span data-testid="cart-item-size">{item.size}</span>
                      </div>
                      <div className="cart-drawer-item-qty-row">
                        <div className="cart-drawer-qty-control" data-testid={`cart-qty-${item.productId}`}>
                          <button
                            type="button"
                            onClick={() =>
                              updateQty(item.productId, item.colorId, item.size, item.quantity - 1)
                            }
                            data-testid="cart-qty-decrement"
                            aria-label="Decrease quantity"
                          >
                            −
                          </button>
                          <span data-testid="cart-qty-value">{item.quantity}</span>
                          <button
                            type="button"
                            onClick={() =>
                              updateQty(item.productId, item.colorId, item.size, item.quantity + 1)
                            }
                            disabled={item.quantity >= stock}
                            data-testid="cart-qty-increment"
                            aria-label="Increase quantity"
                          >
                            +
                          </button>
                        </div>
                        <button
                          type="button"
                          className="font-mono cart-drawer-remove"
                          onClick={() => removeItem(item.productId, item.colorId, item.size)}
                          data-testid={`cart-remove-${item.productId}`}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                    <div className="cart-drawer-item-price font-mono" data-testid="cart-item-line-total">
                      {formatGBP(product.price * item.quantity)}
                    </div>
                  </li>
                );
              })}
            </ul>

            <footer className="cart-drawer-footer">
              <div className="cart-drawer-subtotal">
                <span className="font-mono">Subtotal</span>
                <span className="font-mono" data-testid="cart-drawer-subtotal">
                  {formatGBP(subtotal)}
                </span>
              </div>
              <p className="text-mute" style={{ fontSize: "0.8rem", textAlign: "center", marginBottom: "var(--space-4)" }}>
                Shipping and discounts calculated at checkout
              </p>
              <button
                type="button"
                className="button-primary cart-drawer-checkout"
                onClick={() => {
                  close();
                  navigate("/checkout");
                }}
                data-testid="cart-drawer-checkout-button"
              >
                Continue to checkout →
              </button>
            </footer>
          </>
        )}
      </aside>
    </div>
  );
}
