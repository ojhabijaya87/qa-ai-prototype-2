import "./Footer.css";

export default function Footer() {
  return (
    <footer className="footer" data-testid="site-footer">
      <div className="container footer-inner">
        <div className="footer-col">
          <h4 className="font-mono">Looksy</h4>
          <p className="footer-tagline font-display">
            Modernist apparel for the discerning everyday.
          </p>
        </div>
        <div className="footer-col">
          <h4 className="font-mono">Shop</h4>
          <ul>
            <li><a href="/shop/outerwear">Outerwear</a></li>
            <li><a href="/shop/knitwear">Knitwear</a></li>
            <li><a href="/shop/footwear">Footwear</a></li>
          </ul>
        </div>
        <div className="footer-col">
          <h4 className="font-mono">Service</h4>
          <ul>
            <li><a href="#">Delivery</a></li>
            <li><a href="#">Returns</a></li>
            <li><a href="#">Size guide</a></li>
            <li><a href="#">Contact</a></li>
          </ul>
        </div>
        <div className="footer-col">
          <h4 className="font-mono">Newsletter</h4>
          <p className="text-mute" style={{ fontSize: "0.875rem" }}>
            New arrivals and editorial, twice monthly.
          </p>
          <form
            className="newsletter-form"
            onSubmit={(e) => e.preventDefault()}
            data-testid="newsletter-form"
          >
            <input
              type="email"
              placeholder="Email address"
              className="input"
              data-testid="newsletter-email-input"
            />
            <button type="submit" className="button-primary" data-testid="newsletter-submit">
              Subscribe
            </button>
          </form>
        </div>
      </div>
      <div className="footer-bottom container">
        <span className="font-mono text-mute">© Looksy {new Date().getFullYear()}</span>
        <span className="font-mono text-mute">All prices in GBP, inclusive of VAT</span>
      </div>
    </footer>
  );
}
