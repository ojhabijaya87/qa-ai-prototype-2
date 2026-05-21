import { useState, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { PRODUCTS } from "@/data/products";
import { useCart } from "@/store/cart";
import { useUi } from "@/store/ui";
import { useToasts } from "@/store/promo";
import { formatGBP, isVariantInStock } from "@/utils";
import ProductImage from "@/components/ProductImage";
import ProductCard from "@/components/ProductCard";
import type { ProductSize } from "@/types";
import "./ProductPage.css";

export default function ProductPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const product = useMemo(() => PRODUCTS.find((p) => p.slug === slug), [slug]);
  const addItem = useCart((s) => s.addItem);
  const openCart = useUi((s) => s.openCartDrawer);
  const pushToast = useToasts((s) => s.push);

  const [selectedColorId, setSelectedColorId] = useState(product?.colors[0]?.id ?? "");
  const [selectedSize, setSelectedSize] = useState<ProductSize | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [activeImage, setActiveImage] = useState(0);
  const [accordion, setAccordion] = useState<"details" | "shipping" | "returns" | null>("details");

  if (!product) {
    return (
      <div className="container" style={{ padding: "var(--space-9) 0", textAlign: "center" }}>
        <h2 className="font-display">Product not found</h2>
        <Link to="/shop" className="button-text" style={{ marginTop: "var(--space-4)", display: "inline-block" }}>
          Back to shop
        </Link>
      </div>
    );
  }

  const selectedColor = product.colors.find((c) => c.id === selectedColorId);
  const isOnSale = product.comparePrice && product.comparePrice > product.price;
  const stockForVariant = selectedSize
    ? product.stock[`${selectedColorId}:${selectedSize}`] ?? 0
    : 0;
  const canAddToCart = selectedSize !== null && stockForVariant > 0;

  const related = PRODUCTS.filter(
    (p) => p.category === product.category && p.id !== product.id
  ).slice(0, 4);

  const handleAddToCart = () => {
    if (!selectedSize) {
      pushToast("Please choose a size", "error");
      return;
    }
    const result = addItem(product.id, selectedColorId, selectedSize, quantity);
    if (result.ok) {
      pushToast(`${product.name} added to your bag`, "success");
      openCart();
    } else if (result.reason === "out-of-stock") {
      pushToast("This size is out of stock", "error");
    } else if (result.reason === "exceeds-stock") {
      pushToast(`Only ${result.capped} available — added to bag`, "info");
      openCart();
    }
  };

  return (
    <div className="product-page" data-testid="product-page" data-product-id={product.id}>
      <div className="container">
        <nav className="breadcrumb font-mono" data-testid="breadcrumb">
          <Link to="/">Home</Link> /{" "}
          <Link to={`/shop/${product.category}`}>{product.category}</Link> /{" "}
          <span data-testid="breadcrumb-current">{product.name}</span>
        </nav>

        <div className="product-page-layout">
          <div className="product-gallery" data-testid="product-gallery">
            <div className="product-gallery-main" data-testid="product-gallery-main">
              <ProductImage
                product={product}
                selectedColor={selectedColor}
                imageIndex={activeImage}
                size="lg"
                data-testid="product-gallery-main-image"
              />
            </div>
            {product.images.length > 1 && (
              <div className="product-gallery-thumbs" data-testid="product-gallery-thumbs">
                {product.images.map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className={`product-gallery-thumb ${idx === activeImage ? "active" : ""}`}
                    onClick={() => setActiveImage(idx)}
                    data-testid={`product-gallery-thumb-${idx}`}
                    aria-label={`Show image ${idx + 1}`}
                  >
                    <ProductImage
                      product={product}
                      selectedColor={selectedColor}
                      imageIndex={idx}
                      size="sm"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="product-details" data-testid="product-details">
            <p className="product-brand font-mono text-mute" data-testid="product-brand">
              {product.brand}
            </p>
            <h1 className="product-name font-display" data-testid="product-name">
              {product.name}
            </h1>
            <div className="product-rating" data-testid="product-rating">
              <span className="product-rating-stars" aria-label={`${product.rating} out of 5`}>
                {"★".repeat(Math.round(product.rating))}
                {"☆".repeat(5 - Math.round(product.rating))}
              </span>
              <span className="font-mono text-mute">
                {product.rating} · {product.reviewCount} reviews
              </span>
            </div>
            <div className="product-price" data-testid="product-price">
              {formatGBP(product.price)}
              {isOnSale && (
                <span className="product-compare-price text-mute" data-testid="product-compare-price">
                  {formatGBP(product.comparePrice!)}
                </span>
              )}
            </div>

            <div className="product-option-group" data-testid="product-color-options">
              <p className="font-mono product-option-label">
                Color · <span data-testid="product-selected-color">{selectedColor?.name}</span>
              </p>
              <div className="product-color-swatches">
                {product.colors.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`product-color-swatch ${c.id === selectedColorId ? "active" : ""}`}
                    onClick={() => {
                      setSelectedColorId(c.id);
                      setSelectedSize(null);
                    }}
                    style={{ background: c.hex }}
                    title={c.name}
                    aria-label={c.name}
                    aria-pressed={c.id === selectedColorId}
                    data-testid={`product-color-${c.id}`}
                  />
                ))}
              </div>
            </div>

            <div className="product-option-group" data-testid="product-size-options">
              <div className="product-size-header">
                <p className="font-mono product-option-label">Size</p>
                <button type="button" className="font-mono product-size-guide" data-testid="size-guide-link">
                  Size guide
                </button>
              </div>
              <div className="product-size-grid">
                {product.sizes.map((s) => {
                  const inStock = isVariantInStock(product.stock, selectedColorId, s);
                  return (
                    <button
                      key={s}
                      type="button"
                      className={`product-size ${selectedSize === s ? "active" : ""} ${
                        !inStock ? "out-of-stock" : ""
                      }`}
                      onClick={() => inStock && setSelectedSize(s)}
                      disabled={!inStock}
                      data-testid={`product-size-${s}`}
                      data-stock={inStock ? "in-stock" : "out-of-stock"}
                      aria-pressed={selectedSize === s}
                    >
                      {s}
                      {!inStock && <span className="size-strike" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
              {selectedSize && stockForVariant > 0 && stockForVariant <= 3 && (
                <p className="font-mono product-low-stock" data-testid="product-low-stock-warning">
                  Only {stockForVariant} left in this size
                </p>
              )}
            </div>

            <div className="product-quantity-row">
              <div className="product-quantity" data-testid="product-quantity">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  data-testid="product-qty-decrement"
                  disabled={quantity <= 1}
                  aria-label="Decrease quantity"
                >
                  −
                </button>
                <span data-testid="product-qty-value">{quantity}</span>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => q + 1)}
                  data-testid="product-qty-increment"
                  aria-label="Increase quantity"
                >
                  +
                </button>
              </div>
              <button
                type="button"
                className="button-primary product-add-to-cart"
                onClick={handleAddToCart}
                disabled={!canAddToCart}
                data-testid="product-add-to-cart"
              >
                {!selectedSize
                  ? "Select a size"
                  : !canAddToCart
                    ? "Out of stock"
                    : "Add to bag"}
              </button>
            </div>

            <div className="product-accordions" data-testid="product-accordions">
              {(["details", "shipping", "returns"] as const).map((key) => (
                <div
                  key={key}
                  className={`accordion ${accordion === key ? "open" : ""}`}
                  data-testid={`accordion-${key}`}
                >
                  <button
                    type="button"
                    className="accordion-toggle font-mono"
                    onClick={() => setAccordion(accordion === key ? null : key)}
                    data-testid={`accordion-toggle-${key}`}
                    aria-expanded={accordion === key}
                  >
                    <span>{accordionLabel(key)}</span>
                    <span>{accordion === key ? "−" : "+"}</span>
                  </button>
                  {accordion === key && (
                    <div className="accordion-body" data-testid={`accordion-body-${key}`}>
                      {key === "details" && (
                        <p>{product.description}</p>
                      )}
                      {key === "shipping" && (
                        <p>
                          Standard delivery 3-5 working days. Express available at checkout.
                          Complimentary on orders over £150.
                        </p>
                      )}
                      {key === "returns" && (
                        <p>
                          Free returns within 30 days of receipt. Items must be in original
                          condition with all tags attached.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {related.length > 0 && (
          <section className="product-related" data-testid="product-related">
            <h2 className="font-display product-related-title">You might also like</h2>
            <div className="product-grid product-grid--related">
              {related.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
            <div style={{ textAlign: "center", marginTop: "var(--space-6)" }}>
              <button
                type="button"
                className="button-secondary"
                onClick={() => navigate("/shop")}
                data-testid="product-related-shop-all"
              >
                View the full collection
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function accordionLabel(key: "details" | "shipping" | "returns"): string {
  switch (key) {
    case "details": return "Details & materials";
    case "shipping": return "Shipping";
    case "returns": return "Returns";
  }
}
