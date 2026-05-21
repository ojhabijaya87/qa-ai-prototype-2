import { Link } from "react-router-dom";
import type { Product } from "@/types";
import { formatGBP, isProductCompletelyOutOfStock } from "@/utils";
import ProductImage from "./ProductImage";
import "./ProductCard.css";

interface Props {
  product: Product;
}

export default function ProductCard({ product }: Props) {
  const isOnSale = product.comparePrice && product.comparePrice > product.price;
  const isSoldOut = isProductCompletelyOutOfStock(product.stock);

  return (
    <Link
      to={`/product/${product.slug}`}
      className="product-card"
      data-testid={`product-card-${product.id}`}
      data-product-id={product.id}
    >
      <div className="product-card-image-wrap">
        <ProductImage
          product={product}
          size="md"
          data-testid={`product-card-image-${product.id}`}
        />
        {isSoldOut && (
          <div className="product-tag product-tag--soldout font-mono" data-testid="product-tag-soldout">
            Sold out
          </div>
        )}
        {!isSoldOut && product.tags.includes("new") && (
          <div className="product-tag product-tag--new font-mono">New</div>
        )}
        {!isSoldOut && isOnSale && (
          <div className="product-tag product-tag--sale font-mono">Sale</div>
        )}
        {!isSoldOut && product.tags.includes("limited") && (
          <div className="product-tag product-tag--limited font-mono">Limited</div>
        )}
      </div>
      <div className="product-card-meta">
        <p className="product-card-brand font-mono text-mute">{product.brand}</p>
        <h3 className="product-card-name font-display" data-testid="product-card-name">
          {product.name}
        </h3>
        <div className="product-card-price-row">
          <span className="product-card-price" data-testid="product-card-price">
            {formatGBP(product.price)}
          </span>
          {isOnSale && (
            <span className="product-card-compare-price text-mute" data-testid="product-card-compare-price">
              {formatGBP(product.comparePrice!)}
            </span>
          )}
        </div>
        <div className="product-card-colors" data-testid="product-card-colors">
          {product.colors.slice(0, 4).map((c) => (
            <span
              key={c.id}
              className="product-card-color-dot"
              style={{ background: c.hex }}
              title={c.name}
              aria-label={c.name}
            />
          ))}
          {product.colors.length > 4 && (
            <span className="product-card-color-more font-mono">
              +{product.colors.length - 4}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
