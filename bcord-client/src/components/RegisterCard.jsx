// ============================================================================
// BeKord Frontend — RegisterCard with RANDOM auto-loading image CAPTCHA
// ============================================================================
import React, { useState, useEffect } from "react";
import axios from "axios";
import { useNavigate, Link } from "react-router-dom";
import AuthLayout from "./AuthLayout";

export default function RegisterCard() {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");

  // CAPTCHA STATE
  const [captchaText, setCaptchaText] = useState("");
  const [captchaImageUrl, setCaptchaImageUrl] = useState("");
  const [captchaMsg, setCaptchaMsg] = useState("");
  const [captchaAnswer, setCaptchaAnswer] = useState(""); // The actual CAPTCHA text to verify

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Generate random CAPTCHA text (6 characters: letters and numbers)
  function generateRandomCaptcha() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing chars like O, 0, I, 1
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  // Load / refresh the CAPTCHA image
  async function loadCaptcha() {
    try {
      setCaptchaMsg("Loading CAPTCHA…");
      
      // Generate NEW random text for this CAPTCHA
      const randomText = generateRandomCaptcha();
      setCaptchaAnswer(randomText); // Store the answer
      setCaptchaText(""); // Clear user input

      const res = await axios.post(
        "/captcha",
        {
          text: randomText, // Use the random text, NOT a fixed value!
          width: 400,
          height: 100,
          difficulty: 2,
        },
        { responseType: "blob" }
      );

      // Clean up old object URL if present
      if (captchaImageUrl) {
        URL.revokeObjectURL(captchaImageUrl);
      }

      const url = URL.createObjectURL(res.data);
      setCaptchaImageUrl(url);
      setCaptchaMsg("Enter the characters shown above.");
    } catch (err) {
      console.error("Failed to load CAPTCHA", err);
      setCaptchaMsg("⚠️ Failed to load CAPTCHA. Click refresh to try again.");
    }
  }

  // Auto-load CAPTCHA when the page first renders
  useEffect(() => {
    loadCaptcha().catch(() => {
      /* handled above */
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccessMessage("");

    const trimmedUsername = username.trim();
    const trimmedEmail = email.trim();

    if (!trimmedUsername || !trimmedEmail || !password) {
      setError("Please fill in all required fields.");
      return;
    }

    if (password !== passwordConfirm) {
      setError("Passwords do not match.");
      return;
    }

    if (!captchaText.trim()) {
      setError("Please enter the CAPTCHA text.");
      return;
    }

    // Verify CAPTCHA matches (case-insensitive)
    if (captchaText.trim().toUpperCase() !== captchaAnswer.toUpperCase()) {
      setError("CAPTCHA text is incorrect. Please try again.");
      await loadCaptcha(); // Refresh CAPTCHA
      return;
    }

    setSubmitting(true);

    try {
      const payload = {
        username: trimmedUsername,
        email: trimmedEmail,
        password,
        captcha_text: captchaText.trim(),
      };

      const res = await axios.post("/api/auth/register", payload, {
        withCredentials: true,
      });

      if (
        typeof res.data?.message === "string" &&
        res.data.message.toLowerCase().includes("captcha")
      ) {
        setError(res.data.message);
        await loadCaptcha();
        setSubmitting(false);
        return;
      }

      const stored = {
        username: trimmedUsername,
        email: trimmedEmail,
        createdAt: Date.now(),
      };
      try {
        localStorage.setItem(
          "bcord_pending_verification",
          JSON.stringify(stored)
        );
      } catch (storageErr) {
        console.warn("Could not store pending verification info", storageErr);
      }

      setSuccessMessage("Account created. Check your email for a 6-digit code.");

      setTimeout(() => {
        navigate("/verify", { state: { fromRegister: true } });
      }, 400);
    } catch (err) {
      console.error("Registration failed", err);

      const status = err?.response?.status;
      const serverMessage =
        err?.response?.data?.message || err?.response?.data?.error;

      if (serverMessage) {
        setError(serverMessage);
      } else if (status === 409) {
        setError(
          "That email or username is already registered. Try logging in instead."
        );
      } else {
        setError("Could not create your account. Please try again.");
      }

      try {
        await loadCaptcha();
      } catch {
        /* ignore */
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Create your BeKord account"
      subtitle="Private, self-hosted chat spaces. Your data stays on your server."
    >
      {error && <div className="bcord-error">{error}</div>}
      {successMessage && <div className="bcord-success">{successMessage}</div>}

      <form
        className="bcord-form"
        onSubmit={handleSubmit}
        autoComplete="off"
        noValidate
      >
        <div className="bcord-field-group">
          <div className="bcord-label-row">
            <label htmlFor="username" className="bcord-label">
              Username
            </label>
            <span className="bcord-label-hint">
              This is how you appear in chat.
            </span>
          </div>
          <input
            id="username"
            className="bcord-input"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. groggywine"
            autoComplete="new-username"
            required
          />
        </div>

        <div className="bcord-field-group">
          <div className="bcord-label-row">
            <label htmlFor="email" className="bcord-label">
              Email
            </label>
            <span className="bcord-label-hint">
              Used only for login &amp; security.
            </span>
          </div>
          <input
            id="email"
            className="bcord-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="off"
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
            placeholder="Choose a strong password"
            autoComplete="new-password"
            required
          />
        </div>

        <div className="bcord-field-group">
          <div className="bcord-label-row">
            <label htmlFor="passwordConfirm" className="bcord-label">
              Confirm password
            </label>
          </div>
          <input
            id="passwordConfirm"
            className="bcord-input"
            type="password"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            placeholder="Repeat your password"
            autoComplete="new-password"
            required
          />
        </div>

        {/* CAPTCHA box with REFRESH BUTTON */}
        <div className="bcord-captcha-slot">
          <div className="bcord-captcha-box">
            <div className="bcord-label-row">
              <span className="bcord-label">CAPTCHA</span>
              <span className="bcord-label-hint">
                Type the characters you see in the image.
              </span>
            </div>

            <div className="bcord-captcha-image-wrap">
              {captchaImageUrl ? (
                <img
                  src={captchaImageUrl}
                  alt="CAPTCHA"
                  className="bcord-captcha-image"
                  onClick={loadCaptcha}
                  title="Click to reload CAPTCHA"
                />
              ) : (
                <div className="bcord-captcha-placeholder">
                  Loading…
                </div>
              )}
            </div>

            <div className="bcord-captcha-input-row">
              <input
                className="bcord-input"
                type="text"
                value={captchaText}
                onChange={(e) => setCaptchaText(e.target.value)}
                placeholder="Enter the text you see"
                autoComplete="off"
                required
              />
              <button
                type="button"
                className="bcord-captcha-refresh-btn"
                onClick={loadCaptcha}
                title="Get a new CAPTCHA"
              >
                🔄
              </button>
            </div>
            {captchaMsg && (
              <div className="bcord-captcha-msg">{captchaMsg}</div>
            )}
          </div>
        </div>

        <button
          type="submit"
          className="bcord-button"
          disabled={submitting}
        >
          {submitting ? "Creating account…" : "Create account"}
        </button>

        <div className="bcord-helper-row">
          <span className="bcord-small">
            By continuing you agree to use BeKord on your own infrastructure.
          </span>
        </div>

        <div className="bcord-helper-row">
          <span>Already have an account?</span>
          <Link to="/login" className="bcord-link">
            Log in
          </Link>
        </div>
      </form>
    </AuthLayout>
  );
}
