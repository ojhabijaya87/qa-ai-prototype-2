import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useCart } from "@/store/cart";
import { useUi } from "@/store/ui";
import { useUser } from "@/store/user";
import "./Header.css";

const NAV = [
  { label: "Outerwear", to: "/shop/outerwear" },
  { label: "Knitwear", to: "/shop/knitwear" },
  { label: "Tops", to: "/shop/tops" },
  { label: "Bottoms", to: "/shop/bottoms" },
  { label: "Footwear", to: "/shop/footwear" },
  { label: "Accessories", to: "/shop/accessories" },
];

export default function Header() {
  const itemCount = useCart((s) => s.itemCount());
  const openCartDrawer = useUi((s) => s.openCartDrawer);
  const user = useUser((s) => s.user);
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close the mobile menu whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Lock scroll while the mobile menu is open.
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  return (
    <header className="header" data-testid="site-header">
      <div className="header-bar">
        <span className="header-bar-text font-mono">
          Complimentary delivery on orders over £150
        </span>
      </div>
      <div className="header-main container">
        <button
          type="button"
          className="header-mobile-toggle font-mono"
          onClick={() => setMobileOpen(true)}
          data-testid="mobile-menu-open"
          aria-label="Open menu"
          aria-expanded={mobileOpen}
        >
          <span className="hamburger" aria-hidden="true">
            <span /><span /><span />
          </span>
        </button>

        <Link to="/" className="logo font-display" data-testid="logo">
          Looksy
        </Link>
        <nav className="primary-nav" data-testid="primary-nav">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`nav-link font-mono ${location.pathname === item.to ? "active" : ""}`}
              data-testid={`nav-link-${item.label.toLowerCase()}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="header-actions">
          <button
            type="button"
            className="header-icon font-mono"
            onClick={() => navigate("/account")}
            data-testid="account-icon"
            aria-label="Account"
          >
            {user ? user.fullName.split(" ")[0] : "Account"}
          </button>
          <button
            type="button"
            className="header-icon cart-icon font-mono"
            onClick={openCartDrawer}
            data-testid="cart-icon"
            aria-label={`Cart with ${itemCount} items`}
          >
            Cart
            {itemCount > 0 && (
              <span className="cart-badge" data-testid="cart-badge">
                {itemCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="mobile-menu-root" data-testid="mobile-menu-root">
          <div
            className="mobile-menu-backdrop"
            onClick={() => setMobileOpen(false)}
            data-testid="mobile-menu-backdrop"
          />
          <aside
            className="mobile-menu"
            data-testid="mobile-menu"
            role="dialog"
            aria-label="Main menu"
          >
            <header className="mobile-menu-header">
              <span className="font-display mobile-menu-title">Menu</span>
              <button
                type="button"
                className="font-mono mobile-menu-close"
                onClick={() => setMobileOpen(false)}
                data-testid="mobile-menu-close"
                aria-label="Close menu"
              >
                Close
              </button>
            </header>
            <nav className="mobile-menu-nav" data-testid="mobile-menu-nav">
              <Link to="/" className="mobile-menu-link font-display" data-testid="mobile-nav-link-home">
                Home
              </Link>
              <Link to="/shop" className="mobile-menu-link font-display" data-testid="mobile-nav-link-shop">
                Shop all
              </Link>
              <div className="mobile-menu-divider" />
              {NAV.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`mobile-menu-link font-display ${
                    location.pathname === item.to ? "active" : ""
                  }`}
                  data-testid={`mobile-nav-link-${item.label.toLowerCase()}`}
                >
                  {item.label}
                </Link>
              ))}
              <div className="mobile-menu-divider" />
              <Link to="/account" className="mobile-menu-link font-display" data-testid="mobile-nav-link-account">
                {user ? user.fullName.split(" ")[0] : "Account"}
              </Link>
            </nav>
          </aside>
        </div>
      )}
    </header>
  );
}
