import { useState } from "react";
import { Link } from "react-router-dom";
import { useUser } from "@/store/user";
import { useOrders } from "@/store/orders";
import { useToasts } from "@/store/promo";
import { formatGBP, validateEmail } from "@/utils";
import "./AccountPage.css";

export default function AccountPage() {
  const user = useUser((s) => s.user);
  const signIn = useUser((s) => s.signIn);
  const signOut = useUser((s) => s.signOut);
  const orders = useOrders((s) => s.orders);
  const pushToast = useToasts((s) => s.push);

  const [form, setForm] = useState({ email: "", fullName: "", isClubMember: false });
  const [errors, setErrors] = useState<{ email?: string; fullName?: string }>({});

  const handleSignIn = () => {
    const next: typeof errors = {};
    const emailErr = validateEmail(form.email);
    if (emailErr) next.email = emailErr;
    if (!form.fullName.trim()) next.fullName = "Full name is required";
    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }
    signIn(form.email, form.fullName, form.isClubMember);
    pushToast(`Welcome, ${form.fullName.split(" ")[0]}`, "success");
    setErrors({});
  };

  const handleSignOut = () => {
    signOut();
    pushToast("Signed out", "info");
  };

  const handleToggleClub = () => {
    if (!user) return;
    signIn(user.email, user.fullName, !user.isClubMember);
    pushToast(
      user.isClubMember ? "Left Looksy Club" : "Welcome to Looksy Club",
      user.isClubMember ? "info" : "success"
    );
  };

  return (
    <div className="account-page" data-testid="account-page">
      <div className="container">
        <header className="account-header">
          <p className="font-mono text-mute">Account</p>
          <h1 className="font-display account-title">
            {user ? `Hello, ${user.fullName.split(" ")[0]}` : "Welcome to Looksy"}
          </h1>
        </header>

        {!user ? (
          <div className="account-signin-card" data-testid="account-signin-card">
            <h2 className="font-display account-card-title">Sign in</h2>
            <p className="text-mute" style={{ fontSize: "0.9rem", marginBottom: "var(--space-5)" }}>
              For demo purposes — no password, no real authentication.
            </p>
            <div className="form-stack">
              <div className="form-field">
                <label className="label" htmlFor="signin-fullname">Full name</label>
                <input
                  id="signin-fullname"
                  type="text"
                  className={`input ${errors.fullName ? "error" : ""}`}
                  value={form.fullName}
                  onChange={(e) => {
                    setForm({ ...form, fullName: e.target.value });
                    if (errors.fullName) setErrors({ ...errors, fullName: undefined });
                  }}
                  data-testid="signin-fullname-input"
                />
                {errors.fullName && (
                  <p className="error-text" data-testid="signin-fullname-error">{errors.fullName}</p>
                )}
              </div>
              <div className="form-field">
                <label className="label" htmlFor="signin-email">Email</label>
                <input
                  id="signin-email"
                  type="email"
                  className={`input ${errors.email ? "error" : ""}`}
                  value={form.email}
                  onChange={(e) => {
                    setForm({ ...form, email: e.target.value });
                    if (errors.email) setErrors({ ...errors, email: undefined });
                  }}
                  data-testid="signin-email-input"
                />
                {errors.email && (
                  <p className="error-text" data-testid="signin-email-error">{errors.email}</p>
                )}
              </div>
              <label className="account-club-checkbox" data-testid="signin-club-label">
                <input
                  type="checkbox"
                  checked={form.isClubMember}
                  onChange={(e) => setForm({ ...form, isClubMember: e.target.checked })}
                  data-testid="signin-club-checkbox"
                />
                <span>
                  <strong className="font-display">Join Looksy Club</strong>
                  <span className="text-mute" style={{ display: "block", fontSize: "0.85rem" }}>
                    Unlock 15% off with code CLUB15 and early access to new arrivals.
                  </span>
                </span>
              </label>
              <button
                type="button"
                className="button-primary"
                onClick={handleSignIn}
                data-testid="signin-submit"
              >
                Sign in
              </button>
            </div>
          </div>
        ) : (
          <div className="account-grid">
            <div className="account-info-card" data-testid="account-info-card">
              <h2 className="font-display account-card-title">Profile</h2>
              <dl className="account-details">
                <div>
                  <dt className="font-mono text-mute">Name</dt>
                  <dd data-testid="account-fullname">{user.fullName}</dd>
                </div>
                <div>
                  <dt className="font-mono text-mute">Email</dt>
                  <dd data-testid="account-email">{user.email}</dd>
                </div>
                <div>
                  <dt className="font-mono text-mute">Looksy Club</dt>
                  <dd data-testid="account-club-status">
                    {user.isClubMember ? "Member" : "Not a member"}
                  </dd>
                </div>
              </dl>
              <div className="account-actions">
                <button
                  type="button"
                  className="button-secondary"
                  onClick={handleToggleClub}
                  data-testid="account-toggle-club"
                >
                  {user.isClubMember ? "Leave Looksy Club" : "Join Looksy Club"}
                </button>
                <button
                  type="button"
                  className="button-text"
                  onClick={handleSignOut}
                  data-testid="account-signout"
                >
                  Sign out
                </button>
              </div>
            </div>

            <div className="account-orders-card" data-testid="account-orders-card">
              <h2 className="font-display account-card-title">Order history</h2>
              {orders.length === 0 ? (
                <div className="account-orders-empty" data-testid="account-orders-empty">
                  <p className="text-mute">No orders yet.</p>
                  <Link to="/shop" className="button-text">Start shopping</Link>
                </div>
              ) : (
                <ul className="account-orders-list" data-testid="account-orders-list">
                  {orders.map((order) => (
                    <li
                      key={order.id}
                      className="account-order"
                      data-testid={`account-order-${order.id}`}
                    >
                      <div className="account-order-meta">
                        <span className="font-mono account-order-id">{order.id}</span>
                        <span className="text-mute" style={{ fontSize: "0.85rem" }}>
                          {new Date(order.placedAt).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          })}
                          {" · "}
                          {order.items.length} {order.items.length === 1 ? "item" : "items"}
                        </span>
                      </div>
                      <span className="font-mono account-order-total">{formatGBP(order.total)}</span>
                      <Link
                        to={`/order/${order.id}`}
                        className="button-text"
                        data-testid={`account-view-order-${order.id}`}
                      >
                        View
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
