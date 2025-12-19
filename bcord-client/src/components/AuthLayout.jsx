import React from "react";
import "../styles/bcord-auth.css";

export default function AuthLayout({ title, subtitle, children }) {
  return (
    <div className="bcord-auth-page">
      <div className="bcord-auth-shell">
        <header className="bcord-auth-header">
          <div className="bcord-logo-mark">B</div>
          <div className="bcord-logo-text">
            <span className="bcord-logo-main">BeKord</span>
            <span className="bcord-logo-sub">Self-hosted chat</span>
          </div>
        </header>

        <main className="bcord-auth-main">
          <div className="bcord-auth-card">
            {title && <h1 className="bcord-auth-title">{title}</h1>}
            {subtitle && (
              <p className="bcord-auth-subtitle">
                {subtitle}
              </p>
            )}
            {children}
          </div>
        </main>

        <footer className="bcord-auth-footer">
          <span>
            Running on your own server · {new Date().getFullYear()}
          </span>
        </footer>
      </div>
    </div>
  );
}
