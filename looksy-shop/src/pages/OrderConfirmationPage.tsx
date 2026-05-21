import { useParams, Link } from "react-router-dom";
import { useOrders } from "@/store/orders";
import { PRODUCTS, SHIPPING_METHODS, PAYMENT_METHODS } from "@/data/products";
import { formatGBP } from "@/utils";
import ProductImage from "@/components/ProductImage";
import "./OrderConfirmationPage.css";

export default function OrderConfirmationPage() {
  const { orderId } = useParams();
  const order = useOrders((s) => (orderId ? s.getById(orderId) : undefined));

  if (!order) {
    return (
      <div className="container order-not-found" data-testid="order-not-found">
        <h1 className="font-display">Order not found</h1>
        <p className="text-mute">We couldn't find that order. It may have been placed on a different device.</p>
        <Link to="/shop" className="button-primary">Continue shopping</Link>
      </div>
    );
  }

  const shipping = SHIPPING_METHODS.find((m) => m.id === order.shippingMethod);
  const payment = PAYMENT_METHODS.find((m) => m.id === order.paymentMethod);
  const placed = new Date(order.placedAt);
  const eta = shipping
    ? new Date(order.placedAt + shipping.estimateDays[1] * 86400000)
    : null;

  return (
    <div className="order-page" data-testid="order-confirmation-page" data-order-id={order.id}>
      <div className="container">
        <header className="order-header" data-testid="order-header">
          <p className="font-mono text-mute">Order confirmed</p>
          <h1 className="font-display order-thanks">Thank you, {order.address.fullName.split(" ")[0]}.</h1>
          <p className="order-sub">
            Your order is on its way. A confirmation has been sent to{" "}
            <span data-testid="order-email">{order.email}</span>.
          </p>
          <div className="order-id-row">
            <span className="font-mono text-mute">Order</span>
            <span className="font-mono" data-testid="order-id">{order.id}</span>
          </div>
        </header>

        <div className="order-grid">
          <section className="order-items-card" data-testid="order-items">
            <h2 className="font-display order-section-title">Your pieces</h2>
            <ul className="order-items-list">
              {order.items.map((item) => {
                const product = PRODUCTS.find((p) => p.id === item.productId);
                if (!product) return null;
                const color = product.colors.find((c) => c.id === item.colorId);
                return (
                  <li
                    key={`${item.productId}-${item.colorId}-${item.size}`}
                    className="order-item"
                    data-testid={`order-item-${item.productId}`}
                  >
                    <div className="order-item-image">
                      <ProductImage product={product} selectedColor={color} size="sm" />
                    </div>
                    <div className="order-item-meta">
                      <span className="font-display order-item-name">{product.name}</span>
                      <span className="font-mono text-mute">
                        {color?.name} · {item.size} · qty {item.quantity}
                      </span>
                    </div>
                    <span className="font-mono order-item-price" data-testid={`order-item-line-total-${item.productId}`}>
                      {formatGBP(product.price * item.quantity)}
                    </span>
                  </li>
                );
              })}
            </ul>

            <dl className="order-totals" data-testid="order-totals">
              <div className="order-totals-row">
                <dt>Subtotal</dt>
                <dd className="font-mono" data-testid="order-subtotal">{formatGBP(order.subtotal)}</dd>
              </div>
              {order.discount > 0 && (
                <div className="order-totals-row order-totals-row--accent">
                  <dt>Discount{order.promoCodeUsed ? ` (${order.promoCodeUsed})` : ""}</dt>
                  <dd className="font-mono" data-testid="order-discount">−{formatGBP(order.discount)}</dd>
                </div>
              )}
              <div className="order-totals-row">
                <dt>Shipping</dt>
                <dd className="font-mono" data-testid="order-shipping-cost">
                  {order.shipping === 0 ? "Free" : formatGBP(order.shipping)}
                </dd>
              </div>
              <div className="order-totals-row order-totals-row--bold">
                <dt>Total</dt>
                <dd className="font-mono" data-testid="order-total">{formatGBP(order.total)}</dd>
              </div>
            </dl>
          </section>

          <aside className="order-meta-card" data-testid="order-meta">
            <div className="order-meta-block">
              <h3 className="font-mono">Delivery</h3>
              <p className="font-display order-meta-strong" data-testid="order-shipping-method">
                {shipping?.name ?? order.shippingMethod}
              </p>
              {eta && (
                <p className="text-mute" data-testid="order-eta">
                  Estimated arrival{" "}
                  {eta.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
                </p>
              )}
            </div>

            <div className="order-meta-block">
              <h3 className="font-mono">Shipping address</h3>
              <address className="order-address" data-testid="order-address">
                <span>{order.address.fullName}</span>
                <span>{order.address.line1}</span>
                {order.address.line2 && <span>{order.address.line2}</span>}
                <span>{order.address.city}</span>
                <span>{order.address.postcode}</span>
                <span>{order.address.country}</span>
                <span className="text-mute">{order.address.phone}</span>
              </address>
            </div>

            <div className="order-meta-block">
              <h3 className="font-mono">Payment</h3>
              <p className="font-display order-meta-strong" data-testid="order-payment-method">
                {payment?.label ?? order.paymentMethod}
              </p>
            </div>

            <div className="order-meta-block">
              <h3 className="font-mono">Placed</h3>
              <p data-testid="order-placed-at">
                {placed.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                {", "}
                {placed.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </aside>
        </div>

        <div className="order-actions">
          <Link to="/shop" className="button-primary" data-testid="order-continue-shopping">
            Continue shopping
          </Link>
          <Link to="/account" className="button-text" data-testid="order-view-account">
            View order history
          </Link>
        </div>
      </div>
    </div>
  );
}
