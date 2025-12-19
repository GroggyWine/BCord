// ============================================================================
// BeKord Frontend — VerifyCard (Email Verification + Redirect Splash)
// ============================================================================
import React, { useState, useEffect } from "react";
import axios from "axios";
import { useLocation, useNavigate, Link } from "react-router-dom";
import AuthLayout from "./AuthLayout";

export default function VerifyCard() {
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");

  const [pendingEmail, setPendingEmail] = useState("");
  const [pendingFromRegister, setPendingFromRegister] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Load pending verification info from localStorage (if coming from /register)
  useEffect(() => {
    try {
      const raw = localStorage.getItem("bcord_pending_verification");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.email) {
          setPendingEmail(parsed.email);
        }
        if (parsed?.username) {
          setUsername(parsed.username);
        }
      }
    } catch (e) {
      console.warn("Could not read pending verification from localStorage", e);
    }

    if (location.state && location.state.fromRegister) {
      setPendingFromRegister(true);
    }
  }, [location.state]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccessMessage("");

    if (!username.trim() || !code.trim()) {
      setError("Please enter your username and the 6-digit code.");
      return;
    }

    if (code.trim().length < 6) {
      setError("Please enter the full 6-digit code.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        username: username.trim(),
        code: code.trim(),
      };

      await axios.post("/api/auth/verify", payload, {
        withCredentials: true,
      });

      setSuccessMessage("Your email is verified. You can now log in.");
      // Once verified, this pending object is no longer needed
      localStorage.removeItem("bcord_pending_verification");

      setTimeout(() => {
        navigate("/login");
      }, 700);
    } catch (err) {
      console.error("Verification failed", err);

      const status = err?.response?.status;
      const serverMessage =
        err?.response?.data?.message || err?.response?.data?.error;

      if (status === 400 || status === 401) {
        setError(
          serverMessage ||
            "That code looks invalid or expired. Please check your email and try again."
        );
      } else if (serverMessage) {
        setError(serverMessage);
      } else {
        setError("Could not verify your account right now. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleResendClick() {
    // Stub for now — backend endpoint not defined in your spec.
    // Keeps the UX ready without changing backend behavior.
    setSuccessMessage(
      "If you didn’t receive the code, try checking spam or registering again with the same email."
    );
  }

  const subtitleText =
    pendingEmail && pendingFromRegister
      ? `We sent a 6-digit code to ${pendingEmail}. Enter it below to activate your account.`
      : pendingEmail
      ? `Enter the 6-digit code we sent to ${pendingEmail}.`
      : "Enter the 6-digit code we sent to your email address.";

  return (
    <AuthLayout
      title="Verify your email"
      subtitle={subtitleText}
    >
      {error && <div className="bcord-error">{error}</div>}
      {successMessage && <div className="bcord-success">{successMessage}</div>}

      <form className="bcord-form" onSubmit={handleSubmit} noValidate>
        <div className="bcord-field-group">
          <div className="bcord-label-row">
            <label htmlFor="username" className="bcord-label">
              Username
            </label>
            <span className="bcord-label-hint">
              The account you’re verifying.
            </span>
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
            <label htmlFor="code" className="bcord-label">
              6-digit code
            </label>
            <span className="bcord-label-hint">
              You’ll find this in the verification email.
            </span>
          </div>
          <input
            id="code"
            className="bcord-input bcord-code-input"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={code}
            onChange={(e) =>
              setCode(
                e.target.value
                  .replace(/[^0-9]/g, "")
                  .slice(0, 6)
              )
            }
            placeholder="••••••"
            required
          />
        </div>

        <button
          type="submit"
          className="bcord-button"
          disabled={submitting}
        >
          {submitting ? "Verifying…" : "Verify account"}
        </button>

        <div className="bcord-helper-row">
          <span className="bcord-small">
            Didn’t get the email? Check your spam folder, or make sure the
            address above is correct.
          </span>
        </div>

        <div className="bcord-helper-row">
          <button
            type="button"
            className="bcord-link"
            style={{ border: "none", background: "transparent", padding: 0 }}
            onClick={handleResendClick}
          >
            Didn’t get a code?
          </button>
          <Link to="/login" className="bcord-link">
            Back to login
          </Link>
        </div>
      </form>
    </AuthLayout>
  );
}

