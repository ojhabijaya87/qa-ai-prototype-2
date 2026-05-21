import { Link } from "react-router-dom";
import { PRODUCTS } from "@/data/products";
import ProductCard from "@/components/ProductCard";
import ProductImage from "@/components/ProductImage";
import "./HomePage.css";

export default function HomePage() {
  const newArrivals = PRODUCTS.filter((p) => p.tags.includes("new")).slice(0, 4);
  const bestsellers = PRODUCTS.filter((p) => p.tags.includes("bestseller")).slice(0, 4);

  return (
    <div className="home-page" data-testid="home-page">
      <section className="hero" data-testid="hero">
        <div className="container hero-inner">
          <div className="hero-text">
            <p className="hero-eyebrow font-mono">Autumn Winter — 26</p>
            <h1 className="hero-title font-display">
              <span>Considered</span>
              <em>everyday</em>
              <span>tailoring</span>
            </h1>
            <p className="hero-sub">
              Pieces designed to be worn, repaired and remembered. Built in small
              runs across British and Italian workshops.
            </p>
            <div className="hero-actions">
              <Link to="/shop/outerwear" className="button-primary" data-testid="hero-cta-outerwear">
                Shop outerwear
              </Link>
              <Link to="/shop" className="button-text" data-testid="hero-cta-all">
                View the collection
              </Link>
            </div>
          </div>
          <div className="hero-visual" data-testid="hero-visual" aria-hidden="true">
            <div className="hero-card hero-card--lg">
              <ProductImage product={PRODUCTS[0]} size="lg" />
            </div>
            <div className="hero-card hero-card--sm">
              <ProductImage product={PRODUCTS[6]} size="md" />
            </div>
            <div className="hero-card hero-card--md">
              <ProductImage product={PRODUCTS[1]} size="md" />
            </div>
          </div>
        </div>
      </section>

      <section className="home-section" data-testid="home-section-new">
        <div className="container">
          <div className="home-section-header">
            <p className="font-mono text-mute">01 — Just landed</p>
            <h2 className="font-display">New arrivals</h2>
            <Link to="/shop" className="button-text">View all</Link>
          </div>
          <div className="product-grid" data-testid="new-arrivals-grid">
            {newArrivals.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </div>
      </section>

      <section className="home-section" data-testid="home-section-bestsellers">
        <div className="container">
          <div className="home-section-header">
            <p className="font-mono text-mute">02 — Reliably loved</p>
            <h2 className="font-display">Bestsellers</h2>
            <Link to="/shop" className="button-text">View all</Link>
          </div>
          <div className="product-grid" data-testid="bestsellers-grid">
            {bestsellers.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </div>
      </section>

      <section className="home-editorial" data-testid="editorial-section">
        <div className="container home-editorial-inner">
          <div>
            <p className="font-mono text-mute">A note on materials</p>
            <h3 className="font-display home-editorial-title">
              We work with the kind of cloth that gets better with use.
            </h3>
            <p className="home-editorial-body">
              Heavy-gauge wools, dense cottons, full-grain leathers. The
              fabrics we choose are intended for repair, not replacement.
            </p>
            <Link to="/shop" className="button-text">Read more</Link>
          </div>
          <div className="home-editorial-art">
            <div className="home-editorial-block home-editorial-block--a">
              <ProductImage product={PRODUCTS[7]} size="md" />
            </div>
            <div className="home-editorial-block home-editorial-block--b">
              <ProductImage product={PRODUCTS[14]} size="md" />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
