import { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCart } from "@/store/cart";
import { useUser } from "@/store/user";
import { usePromo, useToasts } from "@/store/promo";
import { useOrders } from "@/store/orders";
import { PRODUCTS, SHIPPING_METHODS, PAYMENT_METHODS } from "@/data/products";
import {
  formatGBP,
  calculateTotals,
  validateEmail,
  validateAddress,
  generateOrderId,
} from "@/utils";
import ProductImage from "@/components/ProductImage";
import "./CheckoutPage.css";

type Step = "contact" | "shipping" | "payment";

export default function CheckoutPage() {
  const items = useCart((s) => s.items);
  const clearCart = useCart((s) => s.clear);
  const user = useUser((s) => s.user);
  const applied = usePromo((s) => s.applied);
  const applyPromo = usePromo((s) => s.apply);
  const removePromo = usePromo((s) => s.remove);
  const placeOrderRecord = useOrders((s) => s.place);
  const pushToast = useToasts((s) => s.push);
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>("contact");
  const [email, setEmail] = useState(user?.email ?? "");
  const [emailError, setEmailError] = useState<string | undefined>();

  const [address, setAddress] = useState({
    fullName: user?.fullName ?? "",
    line1: "",
    line2: "",
    city: "",
    postcode: "",
    country: "United Kingdom",
    phone: "",
  });
  const [addressErrors, setAddressErrors] = useState<Record<string, string | undefined>>({});

  const [shippingId, setShippingId] = useState(SHIPPING_METHODS[0].id);
  const [paymentId, setPaymentId] = useState<"card" | "klarna" | "paypal">("card");
  const [promoInput, setPromoInput] = useState("");
  const [promoError, setPromoError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  const [card, setCard] = useState({ number: "", expiry: "", cvc: "" });
  const [cardErrors, setCardErrors] = useState<Record<string, string | undefined>>({});

  const subtotal = useMemo(() => {
    return items.reduce((sum, item) => {
      const product = PRODUCTS.find((p) => p.id === item.productId);
      return product ? sum + product.price * item.quantity : sum;
    }, 0);
  }, [items]);

  const shipping = SHIPPING_METHODS.find((m) => m.id === shippingId) ?? null;
  const totals = useMemo(
    () => calculateTotals(items, applied, shipping),
    [items, applied, shipping]
  );

  if (items.length === 0) {
    return (
      <div className="checkout-empty container" data-testid="checkout-empty">
        <h1 className="font-display">Your bag is empty</h1>
        <p className="text-mute">Choose pieces before continuing to checkout.</p>
        <Link to="/shop" className="button-primary" data-testid="checkout-empty-shop">
          Discover the collection
        </Link>
      </div>
    );
  }

  const handleApplyPromo = () => {
    if (!promoInput.trim()) {
      setPromoError("Enter a code");
      return;
    }
    const result = applyPromo(promoInput, {
      isClubMember: user?.isClubMember ?? false,
      subtotal,
    });
    if (result.ok) {
      pushToast("Promo code applied", "success");
      setPromoInput("");
      setPromoError(undefined);
    } else {
      setPromoError(promoErrorMessage(result.reason));
    }
  };

  const goToStep = (target: Step) => {
    if (target === "shipping") {
      const err = validateEmail(email);
      if (err) {
        setEmailError(err);
        return;
      }
      setEmailError(undefined);
    } else if (target === "payment") {
      const errs = validateAddress(address);
      if (Object.keys(errs).length > 0) {
        setAddressErrors(errs);
        pushToast("Please complete your address", "error");
        return;
      }
      setAddressErrors({});
    }
    setStep(target);
  };

  const handlePlaceOrder = async () => {
    if (paymentId === "card") {
      const errs: Record<string, string | undefined> = {};
      if (!/^\d{4}\s?\d{4}\s?\d{4}\s?\d{4}$/.test(card.number.replace(/\s/g, "").padEnd(16, " "))) {
        if (card.number.replace(/\s/g, "").length !== 16) errs.number = "Enter a 16-digit card number";
      }
      if (!/^\d{2}\/\d{2}$/.test(card.expiry)) errs.expiry = "Format: MM/YY";
      if (!/^\d{3,4}$/.test(card.cvc)) errs.cvc = "3 or 4 digits";
      if (Object.keys(errs).length > 0) {
        setCardErrors(errs);
        return;
      }
      setCardErrors({});
    }

    setSubmitting(true);
    // Simulate network latency. Real teams put this behind a service worker
    // for offline-first; for the demo, a 1-second await is enough to test
    // loading states.
    await new Promise((r) => setTimeout(r, 1000));

    const orderId = generateOrderId();
    placeOrderRecord({
      id: orderId,
      items,
      subtotal: totals.subtotal,
      discount: totals.discount,
      shipping: totals.shipping,
      total: totals.total,
      currency: "GBP",
      promoCodeUsed: applied?.code,
      shippingMethod: shippingId,
      paymentMethod: paymentId,
      address: {
        fullName: address.fullName,
        line1: address.line1,
        line2: address.line2 || undefined,
        city: address.city,
        postcode: address.postcode,
        country: address.country,
        phone: address.phone,
      },
      email,
      placedAt: Date.now(),
      status: "confirmed",
    });

    clearCart();
    removePromo();
    setSubmitting(false);
    navigate(`/order/${orderId}`);
  };

  return (
    <div className="checkout-page" data-testid="checkout-page">
      <div className="container checkout-grid">
        <section className="checkout-form" data-testid="checkout-form">
          <h1 className="font-display checkout-title">Checkout</h1>

          <div className="checkout-stepper" data-testid="checkout-stepper">
            <Step n={1} label="Contact" current={step} target="contact" onClick={() => setStep("contact")} />
            <Step n={2} label="Shipping" current={step} target="shipping" onClick={() => goToStep("shipping")} />
            <Step n={3} label="Payment" current={step} target="payment" onClick={() => goToStep("payment")} />
          </div>

          {step === "contact" && (
            <div className="checkout-step" data-testid="checkout-step-contact">
              <h2 className="font-display checkout-step-title">Contact</h2>
              <p className="text-mute" style={{ fontSize: "0.9rem", marginBottom: "var(--space-4)" }}>
                We'll send your order confirmation here.
              </p>
              <label className="label" htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                className={`input ${emailError ? "error" : ""}`}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (emailError) setEmailError(undefined);
                }}
                data-testid="checkout-email-input"
                placeholder="you@example.com"
              />
              {emailError && (
                <p className="error-text" data-testid="checkout-email-error">{emailError}</p>
              )}
              <button
                type="button"
                className="button-primary checkout-step-cta"
                onClick={() => goToStep("shipping")}
                data-testid="checkout-continue-shipping"
              >
                Continue to shipping
              </button>
            </div>
          )}

          {step === "shipping" && (
            <div className="checkout-step" data-testid="checkout-step-shipping">
              <h2 className="font-display checkout-step-title">Shipping</h2>

              <div className="form-grid">
                <FormField
                  label="Full name"
                  testId="checkout-fullname"
                  value={address.fullName}
                  error={addressErrors.fullName}
                  onChange={(v) => updateAddress("fullName", v)}
                />
                <FormField
                  label="Phone"
                  testId="checkout-phone"
                  value={address.phone}
                  error={addressErrors.phone}
                  onChange={(v) => updateAddress("phone", v)}
                />
                <FormField
                  label="Address line 1"
                  testId="checkout-line1"
                  value={address.line1}
                  error={addressErrors.line1}
                  onChange={(v) => updateAddress("line1", v)}
                  fullWidth
                />
                <FormField
                  label="Address line 2 (optional)"
                  testId="checkout-line2"
                  value={address.line2}
                  onChange={(v) => updateAddress("line2", v)}
                  fullWidth
                />
                <FormField
                  label="City"
                  testId="checkout-city"
                  value={address.city}
                  error={addressErrors.city}
                  onChange={(v) => updateAddress("city", v)}
                />
                <FormField
                  label="Postcode"
                  testId="checkout-postcode"
                  value={address.postcode}
                  error={addressErrors.postcode}
                  onChange={(v) => updateAddress("postcode", v)}
                />
                <FormField
                  label="Country"
                  testId="checkout-country"
                  value={address.country}
                  error={addressErrors.country}
                  onChange={(v) => updateAddress("country", v)}
                  fullWidth
                />
              </div>

              <h3 className="font-display checkout-substep-title">Delivery method</h3>
              <div className="checkout-shipping-methods" data-testid="checkout-shipping-methods">
                {SHIPPING_METHODS.map((m) => (
                  <label
                    key={m.id}
                    className={`shipping-method ${shippingId === m.id ? "active" : ""}`}
                    data-testid={`shipping-method-${m.id}`}
                  >
                    <input
                      type="radio"
                      name="shipping"
                      value={m.id}
                      checked={shippingId === m.id}
                      onChange={() => setShippingId(m.id)}
                    />
                    <div className="shipping-method-meta">
                      <span className="font-display shipping-method-name">{m.name}</span>
                      <span className="font-mono text-mute">
                        {m.estimateDays[0] === m.estimateDays[1]
                          ? `${m.estimateDays[0]} day`
                          : `${m.estimateDays[0]}–${m.estimateDays[1]} days`}
                      </span>
                    </div>
                    <span className="font-mono shipping-method-price">{formatGBP(m.price)}</span>
                  </label>
                ))}
              </div>

              <div className="checkout-step-actions">
                <button
                  type="button"
                  className="button-text"
                  onClick={() => setStep("contact")}
                  data-testid="checkout-back-contact"
                >
                  ← Back
                </button>
                <button
                  type="button"
                  className="button-primary"
                  onClick={() => goToStep("payment")}
                  data-testid="checkout-continue-payment"
                >
                  Continue to payment
                </button>
              </div>
            </div>
          )}

          {step === "payment" && (
            <div className="checkout-step" data-testid="checkout-step-payment">
              <h2 className="font-display checkout-step-title">Payment</h2>

              <div className="checkout-payment-methods" data-testid="checkout-payment-methods">
                {PAYMENT_METHODS.map((m) => (
                  <label
                    key={m.id}
                    className={`payment-method ${paymentId === m.id ? "active" : ""}`}
                    data-testid={`payment-method-${m.id}`}
                  >
                    <input
                      type="radio"
                      name="payment"
                      value={m.id}
                      checked={paymentId === m.id}
                      onChange={() => setPaymentId(m.id)}
                    />
                    <div className="payment-method-meta">
                      <span className="font-display payment-method-name">{m.label}</span>
                      <span className="text-mute" style={{ fontSize: "0.85rem" }}>
                        {m.description}
                      </span>
                    </div>
                  </label>
                ))}
              </div>

              {paymentId === "card" && (
                <div className="checkout-card-form" data-testid="checkout-card-form">
                  <FormField
                    label="Card number"
                    testId="checkout-card-number"
                    value={card.number}
                    error={cardErrors.number}
                    onChange={(v) => setCard({ ...card, number: formatCardNumber(v) })}
                    placeholder="0000 0000 0000 0000"
                    fullWidth
                  />
                  <div className="form-grid form-grid--two">
                    <FormField
                      label="Expiry"
                      testId="checkout-card-expiry"
                      value={card.expiry}
                      error={cardErrors.expiry}
                      onChange={(v) => setCard({ ...card, expiry: formatExpiry(v) })}
                      placeholder="MM/YY"
                    />
                    <FormField
                      label="CVC"
                      testId="checkout-card-cvc"
                      value={card.cvc}
                      error={cardErrors.cvc}
                      onChange={(v) => setCard({ ...card, cvc: v.replace(/\D/g, "").slice(0, 4) })}
                      placeholder="123"
                    />
                  </div>
                </div>
              )}

              {paymentId === "klarna" && (
                <p className="checkout-payment-note" data-testid="checkout-klarna-note">
                  You'll be redirected to Klarna to complete your purchase in 3 instalments.
                </p>
              )}
              {paymentId === "paypal" && (
                <p className="checkout-payment-note" data-testid="checkout-paypal-note">
                  You'll be redirected to PayPal to complete your purchase.
                </p>
              )}

              <div className="checkout-step-actions">
                <button
                  type="button"
                  className="button-text"
                  onClick={() => setStep("shipping")}
                  data-testid="checkout-back-shipping"
                >
                  ← Back
                </button>
                <button
                  type="button"
                  className="button-primary"
                  onClick={handlePlaceOrder}
                  disabled={submitting}
                  data-testid="checkout-place-order"
                >
                  {submitting ? "Placing order..." : `Place order · ${formatGBP(totals.total)}`}
                </button>
              </div>
            </div>
          )}
        </section>

        <aside className="checkout-summary" data-testid="checkout-summary">
          <h2 className="font-display checkout-summary-title">Order summary</h2>
          <ul className="checkout-summary-items">
            {items.map((item) => {
              const product = PRODUCTS.find((p) => p.id === item.productId);
              if (!product) return null;
              const color = product.colors.find((c) => c.id === item.colorId);
              return (
                <li
                  key={`${item.productId}-${item.colorId}-${item.size}`}
                  className="checkout-summary-item"
                  data-testid={`summary-item-${item.productId}`}
                >
                  <div className="summary-item-image">
                    <ProductImage product={product} selectedColor={color} size="sm" />
                  </div>
                  <div className="summary-item-meta">
                    <span className="font-display">{product.name}</span>
                    <span className="font-mono text-mute">
                      {color?.name} · {item.size} · qty {item.quantity}
                    </span>
                  </div>
                  <span className="font-mono summary-item-price">
                    {formatGBP(product.price * item.quantity)}
                  </span>
                </li>
              );
            })}
          </ul>

          <div className="checkout-promo">
            {applied ? (
              <div className="checkout-promo-applied" data-testid="checkout-promo-applied">
                <div>
                  <span className="font-mono">{applied.code}</span>
                  <p className="text-mute" style={{ fontSize: "0.8rem" }}>{applied.description}</p>
                </div>
                <button
                  type="button"
                  className="button-text"
                  onClick={removePromo}
                  data-testid="checkout-promo-remove"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div className="checkout-promo-input">
                <input
                  type="text"
                  className="input"
                  placeholder="Promo code"
                  value={promoInput}
                  onChange={(e) => {
                    setPromoInput(e.target.value);
                    if (promoError) setPromoError(undefined);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && handleApplyPromo()}
                  data-testid="checkout-promo-input"
                />
                <button
                  type="button"
                  className="button-secondary"
                  onClick={handleApplyPromo}
                  data-testid="checkout-promo-apply"
                >
                  Apply
                </button>
              </div>
            )}
            {promoError && (
              <p className="error-text" data-testid="checkout-promo-error">{promoError}</p>
            )}
          </div>

          <div className="checkout-totals" data-testid="checkout-totals">
            <Row label="Subtotal" value={formatGBP(totals.subtotal)} testId="totals-subtotal" />
            {totals.discount > 0 && (
              <Row
                label={`Discount${applied ? ` (${applied.code})` : ""}`}
                value={`−${formatGBP(totals.discount)}`}
                testId="totals-discount"
                accent
              />
            )}
            <Row
              label="Shipping"
              value={
                totals.freeShippingApplied
                  ? "Free"
                  : shipping
                    ? formatGBP(shipping.price)
                    : "—"
              }
              testId="totals-shipping"
            />
            <div className="checkout-totals-divider" />
            <Row
              label="Total"
              value={formatGBP(totals.total)}
              testId="totals-total"
              bold
            />
          </div>
        </aside>
      </div>
    </div>
  );

  function updateAddress(field: keyof typeof address, v: string) {
    setAddress((prev) => ({ ...prev, [field]: v }));
    if (addressErrors[field]) {
      setAddressErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  }
}

function Step({ n, label, current, target, onClick }: {
  n: number;
  label: string;
  current: Step;
  target: Step;
  onClick: () => void;
}) {
  const order: Step[] = ["contact", "shipping", "payment"];
  const isCurrent = current === target;
  const isPast = order.indexOf(current) > order.indexOf(target);

  return (
    <button
      type="button"
      className={`checkout-step-pill ${isCurrent ? "current" : ""} ${isPast ? "past" : ""}`}
      onClick={onClick}
      data-testid={`stepper-${target}`}
      aria-current={isCurrent ? "step" : undefined}
    >
      <span className="step-num font-mono">0{n}</span>
      <span className="step-label font-mono">{label}</span>
    </button>
  );
}

function FormField({ label, value, onChange, error, testId, placeholder, fullWidth }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  testId: string;
  placeholder?: string;
  fullWidth?: boolean;
}) {
  return (
    <div className={`form-field ${fullWidth ? "form-field--full" : ""}`}>
      <label className="label" htmlFor={testId}>{label}</label>
      <input
        id={testId}
        type="text"
        className={`input ${error ? "error" : ""}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
        placeholder={placeholder}
      />
      {error && (
        <p className="error-text" data-testid={`${testId}-error`}>{error}</p>
      )}
    </div>
  );
}

function Row({ label, value, testId, accent, bold }: {
  label: string;
  value: string;
  testId: string;
  accent?: boolean;
  bold?: boolean;
}) {
  return (
    <div className={`totals-row ${accent ? "totals-row--accent" : ""} ${bold ? "totals-row--bold" : ""}`}>
      <span>{label}</span>
      <span className="font-mono" data-testid={testId}>{value}</span>
    </div>
  );
}

function promoErrorMessage(reason?: string): string {
  switch (reason) {
    case "invalid": return "That code isn't valid";
    case "min-spend": return "This code requires a higher order total";
    case "club-only": return "This code is for Looksy Club members only";
    case "already-applied": return "A promo code is already applied — remove it first";
    default: return "Could not apply that code";
  }
}

function formatCardNumber(v: string): string {
  return v.replace(/\D/g, "").slice(0, 16).replace(/(\d{4})(?=\d)/g, "$1 ");
}

function formatExpiry(v: string): string {
  const digits = v.replace(/\D/g, "").slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
}
