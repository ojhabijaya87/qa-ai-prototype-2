import { useMemo } from "react";
import type { Product, ProductColor } from "@/types";
import { ILLUSTRATIONS } from "@/assets/illustrations";
import "./ProductImage.css";

interface Props {
  product: Product;
  selectedColor?: ProductColor;
  imageIndex?: number;
  size?: "sm" | "md" | "lg";
  "data-testid"?: string;
}

// Hash a string to a deterministic number (used for unique-but-stable visuals)
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// Pick a contrasting accent: if the colour is dark, accent is light; vice versa.
function pickAccent(hex: string): string {
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luma < 128 ? "#f4f0ea" : "#1a1a1f";
}

export default function ProductImage({
  product,
  selectedColor,
  imageIndex = 0,
  size = "md",
  "data-testid": testId,
}: Props) {
  const color = selectedColor ?? product.colors[0];
  const seed = hash(`${product.id}-${imageIndex}`);

  const visual = useMemo(() => {
    // Background gradient picks a soft, neutral backdrop so the garment
    // illustration reads clearly. The product's actual colour is used on
    // the SVG itself, not the background.
    const bgAngle = (seed % 60) + 110;
    const bgTone = product.category === "outerwear" || product.category === "knitwear"
      ? ["#efe9dc", "#e3dccb"]
      : product.category === "footwear"
        ? ["#e8e2d5", "#d8d2c5"]
        : product.category === "accessories"
          ? ["#f0eadc", "#e6dfd0"]
          : ["#eee8db", "#e2dccc"];

    const variant = (hash(product.id) + imageIndex) % 3;

    return {
      bgGradient: `linear-gradient(${bgAngle}deg, ${bgTone[0]} 0%, ${bgTone[1]} 100%)`,
      variant,
    };
  }, [seed, product.id, product.category, imageIndex]);

  const Illustration = ILLUSTRATIONS[product.category];
  const accent = pickAccent(color.hex);

  return (
    <div
      className={`product-image product-image--${size}`}
      data-testid={testId}
      style={{ background: visual.bgGradient }}
    >
      <div className="product-image-illustration" aria-hidden="true">
        <Illustration fill={color.hex} accent={accent} variant={visual.variant} />
      </div>
      <div className="product-image-overlay" data-treatment={product.category}>
        <span className="product-image-name font-display">{product.name}</span>
        <span className="product-image-id font-mono">{product.id}</span>
      </div>
    </div>
  );
}
