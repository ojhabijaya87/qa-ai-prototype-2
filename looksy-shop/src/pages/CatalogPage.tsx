import { useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import { PRODUCTS } from "@/data/products";
import type { Product, ProductCategory, ProductSize } from "@/types";
import ProductCard from "@/components/ProductCard";
import { isProductCompletelyOutOfStock } from "@/utils";
import "./CatalogPage.css";

type SortKey = "featured" | "price-asc" | "price-desc" | "rating" | "newest";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "featured", label: "Featured" },
  { key: "price-asc", label: "Price · Low to High" },
  { key: "price-desc", label: "Price · High to Low" },
  { key: "rating", label: "Top rated" },
  { key: "newest", label: "Newest" },
];

const CATEGORIES: { key: ProductCategory; label: string }[] = [
  { key: "outerwear", label: "Outerwear" },
  { key: "knitwear", label: "Knitwear" },
  { key: "tops", label: "Tops" },
  { key: "bottoms", label: "Bottoms" },
  { key: "footwear", label: "Footwear" },
  { key: "accessories", label: "Accessories" },
];

const ALL_SIZES: ProductSize[] = ["XS", "S", "M", "L", "XL", "XXL", "ONE"];

export default function CatalogPage() {
  const { category } = useParams();
  const initialCategory = (category as ProductCategory) ?? null;

  const [selectedCategory, setSelectedCategory] = useState<ProductCategory | null>(initialCategory);
  const [selectedColors, setSelectedColors] = useState<Set<string>>(new Set());
  const [selectedSizes, setSelectedSizes] = useState<Set<ProductSize>>(new Set());
  const [maxPrice, setMaxPrice] = useState<number>(40000);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [onSaleOnly, setOnSaleOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("featured");
  const [filtersOpen, setFiltersOpen] = useState(true);

  const allColors = useMemo(() => {
    const map = new Map<string, { id: string; name: string; hex: string }>();
    PRODUCTS.forEach((p) => p.colors.forEach((c) => map.set(c.id, c)));
    return Array.from(map.values());
  }, []);

  const filtered = useMemo(() => {
    let out = PRODUCTS.slice();

    if (selectedCategory) {
      out = out.filter((p) => p.category === selectedCategory);
    }

    if (selectedColors.size > 0) {
      out = out.filter((p) => p.colors.some((c) => selectedColors.has(c.id)));
    }

    if (selectedSizes.size > 0) {
      out = out.filter((p) => p.sizes.some((s) => selectedSizes.has(s)));
    }

    out = out.filter((p) => p.price <= maxPrice);

    if (inStockOnly) {
      out = out.filter((p) => !isProductCompletelyOutOfStock(p.stock));
    }

    if (onSaleOnly) {
      out = out.filter((p) => p.comparePrice && p.comparePrice > p.price);
    }

    out = sortProducts(out, sortKey);
    return out;
  }, [selectedCategory, selectedColors, selectedSizes, maxPrice, inStockOnly, onSaleOnly, sortKey]);

  const toggleColor = (id: string) => {
    setSelectedColors((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSize = (size: ProductSize) => {
    setSelectedSizes((prev) => {
      const next = new Set(prev);
      next.has(size) ? next.delete(size) : next.add(size);
      return next;
    });
  };

  const clearFilters = () => {
    setSelectedColors(new Set());
    setSelectedSizes(new Set());
    setMaxPrice(40000);
    setInStockOnly(false);
    setOnSaleOnly(false);
  };

  const activeFilterCount =
    selectedColors.size + selectedSizes.size + (inStockOnly ? 1 : 0) + (onSaleOnly ? 1 : 0) +
    (maxPrice < 40000 ? 1 : 0);

  return (
    <div className="catalog-page" data-testid="catalog-page">
      <div className="container">
        <header className="catalog-header" data-testid="catalog-header">
          <p className="font-mono text-mute">
            {selectedCategory ? `Shop / ${selectedCategory}` : "Shop / All"}
          </p>
          <h1 className="font-display catalog-title">
            {selectedCategory
              ? CATEGORIES.find((c) => c.key === selectedCategory)?.label
              : "The collection"}
          </h1>
          <p className="catalog-count font-mono" data-testid="catalog-result-count">
            {filtered.length} {filtered.length === 1 ? "piece" : "pieces"}
          </p>
        </header>

        <div className="catalog-toolbar">
          <button
            type="button"
            className="font-mono catalog-filter-toggle"
            onClick={() => setFiltersOpen(!filtersOpen)}
            data-testid="filter-toggle"
            aria-expanded={filtersOpen}
          >
            {filtersOpen ? "Hide" : "Show"} filters
            {activeFilterCount > 0 && (
              <span className="active-filter-count" data-testid="active-filter-count">
                ({activeFilterCount})
              </span>
            )}
          </button>
          <div className="sort-control">
            <label htmlFor="sort-select" className="font-mono text-mute">Sort</label>
            <select
              id="sort-select"
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              data-testid="sort-select"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className={`catalog-layout ${filtersOpen ? "filters-open" : ""}`}>
          {filtersOpen && (
            <aside className="catalog-filters" data-testid="catalog-filters">
              <FilterGroup label="Category">
                <div className="filter-list">
                  <button
                    type="button"
                    className={`filter-pill ${selectedCategory === null ? "active" : ""}`}
                    onClick={() => setSelectedCategory(null)}
                    data-testid="filter-category-all"
                  >
                    All
                  </button>
                  {CATEGORIES.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      className={`filter-pill ${selectedCategory === c.key ? "active" : ""}`}
                      onClick={() => setSelectedCategory(c.key)}
                      data-testid={`filter-category-${c.key}`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </FilterGroup>

              <FilterGroup label="Price">
                <input
                  type="range"
                  min="2000"
                  max="40000"
                  step="500"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(parseInt(e.target.value, 10))}
                  className="filter-range"
                  data-testid="filter-price-range"
                />
                <p className="filter-range-label font-mono">
                  Up to <span data-testid="filter-price-value">£{(maxPrice / 100).toFixed(0)}</span>
                </p>
              </FilterGroup>

              <FilterGroup label="Color">
                <div className="filter-color-grid" data-testid="filter-colors">
                  {allColors.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`filter-color ${selectedColors.has(c.id) ? "active" : ""}`}
                      onClick={() => toggleColor(c.id)}
                      style={{ background: c.hex }}
                      title={c.name}
                      aria-label={c.name}
                      aria-pressed={selectedColors.has(c.id)}
                      data-testid={`filter-color-${c.id}`}
                    />
                  ))}
                </div>
              </FilterGroup>

              <FilterGroup label="Size">
                <div className="filter-list">
                  {ALL_SIZES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`filter-pill filter-pill--size ${selectedSizes.has(s) ? "active" : ""}`}
                      onClick={() => toggleSize(s)}
                      data-testid={`filter-size-${s}`}
                      aria-pressed={selectedSizes.has(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </FilterGroup>

              <FilterGroup label="Other">
                <label className="filter-checkbox" data-testid="filter-in-stock-label">
                  <input
                    type="checkbox"
                    checked={inStockOnly}
                    onChange={(e) => setInStockOnly(e.target.checked)}
                    data-testid="filter-in-stock"
                  />
                  <span>In stock only</span>
                </label>
                <label className="filter-checkbox" data-testid="filter-sale-label">
                  <input
                    type="checkbox"
                    checked={onSaleOnly}
                    onChange={(e) => setOnSaleOnly(e.target.checked)}
                    data-testid="filter-sale"
                  />
                  <span>On sale</span>
                </label>
              </FilterGroup>

              {activeFilterCount > 0 && (
                <button
                  type="button"
                  className="font-mono filter-clear"
                  onClick={clearFilters}
                  data-testid="filter-clear"
                >
                  Clear all filters
                </button>
              )}
            </aside>
          )}

          <div className="catalog-results">
            {filtered.length === 0 ? (
              <div className="catalog-empty" data-testid="catalog-empty">
                <p className="font-display" style={{ fontSize: "1.5rem" }}>
                  Nothing matches those filters
                </p>
                <p className="text-mute">
                  Adjust your selections or clear filters to see the full collection.
                </p>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={clearFilters}
                  data-testid="catalog-empty-clear"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <div className="product-grid product-grid--catalog" data-testid="catalog-grid">
                {filtered.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="filter-group" data-testid={`filter-group-${label.toLowerCase()}`}>
      <h3 className="font-mono">{label}</h3>
      {children}
    </div>
  );
}

function sortProducts(products: Product[], key: SortKey): Product[] {
  const out = products.slice();
  switch (key) {
    case "price-asc":
      return out.sort((a, b) => a.price - b.price);
    case "price-desc":
      return out.sort((a, b) => b.price - a.price);
    case "rating":
      return out.sort((a, b) => b.rating - a.rating);
    case "newest":
      return out.sort((a, b) => Number(b.tags.includes("new")) - Number(a.tags.includes("new")));
    case "featured":
    default:
      return out.sort((a, b) =>
        Number(b.tags.includes("bestseller")) - Number(a.tags.includes("bestseller"))
      );
  }
}
