// ============================================================================
// BeKord Frontend — LoginCard (dark theme, shared AuthLayout)
// ============================================================================
// UPDATED: 2025-12-19
// CHANGES: - Use login() from api.js to properly store JWT tokens
//          - navigate to /chat on success
// ============================================================================
import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import AuthLayout from "./AuthLayout";
import { login } from "../api";  // Use api.js login which stores tokens
import { playLoginChord } from "../utils/sounds";

export default function LoginCard() {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccessMessage("");

    const trimmedUsername = username.trim();
    if (!trimmedUsername || !password) {
      setError("Please enter your username and password.");
      return;
    }

    setSubmitting(true);

    try {
      // ---------------------------------------------------------------------
      // IMPORTANT: Use login() from api.js - it stores tokens in localStorage
      // This is required for isAuthenticated() check in routing
      // ---------------------------------------------------------------------
      const res = await login({ username: trimmedUsername, password });

      const msg = res.data?.message || "Login successful.";
      setSuccessMessage(msg);
      playLoginChord();

      // Navigate to chat page after brief delay for user feedback
      setTimeout(() => {
        navigate("/chat");
      }, 500);
    } catch (err) {
      console.error("Login failed", err);

      const status = err?.response?.status;
      const serverMessage =
        err?.response?.data?.message || err?.response?.data?.error;

      if (status === 401 && serverMessage) {
        // e.g. wrong password, unverified account, etc.
        setError(serverMessage);
      } else if (serverMessage) {
        setError(serverMessage);
      } else {
        setError("Could not log you in. Please check your credentials and try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Sign in to BeKord"
      subtitle="Enter your credentials to access the chat dashboard."
    >
      {error && <div className="bcord-error">{error}</div>}
      {successMessage && <div className="bcord-success">{successMessage}</div>}

      <form className="bcord-form" onSubmit={handleSubmit} noValidate>
        <div className="bcord-field-group">
          <div className="bcord-label-row">
            <label htmlFor="username" className="bcord-label">
              Username
            </label>
          </div>
          <input
            id="username"
            className="bcord-input"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Your BeKord username"
            autoComplete="username"
            required
          />
        </div>

        <div className="bcord-field-group">
          <div className="bcord-label-row">
            <label htmlFor="password" className="bcord-label">
              Password
            </label>
          </div>
          <input
            id="password"
            className="bcord-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password"
            autoComplete="current-password"
            required
          />
        </div>

        <button
          type="submit"
          className="bcord-button"
          disabled={submitting}
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>

        <div className="bcord-helper-row">
          <span>Don't have an account?</span>
          <Link to="/register" className="bcord-link">
            Create one
          </Link>
        </div>
      </form>
    </AuthLayout>
  );
}
