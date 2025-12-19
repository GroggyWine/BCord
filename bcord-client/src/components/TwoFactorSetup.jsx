import React, { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";

export function TwoFactorSetup() {
  const [loading, setLoading] = useState(false);
  const [otpauthUri, setOtpauthUri] = useState(null);
  const [secretBase32, setSecretBase32] = useState(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [backupCodes, setBackupCodes] = useState(null);
  const [error, setError] = useState(null);
  const [statusText, setStatusText] = useState(null);
  const [totpEnabled, setTotpEnabled] = useState(null);

  async function fetchStatus() {
    try {
      const res = await fetch("/api/auth/2fa/status", {
        credentials: "include",
      });
      if (!res.ok) return;
      const data = await res.json();
      if (typeof data.totp_enabled === "boolean") {
        setTotpEnabled(data.totp_enabled);
      }
    } catch (e) {
      // ignore status failure for now
    }
  }

  useEffect(() => {
    fetchStatus();
  }, []);

  async function handleBegin() {
    setLoading(true);
    setError(null);
    setBackupCodes(null);
    setStatusText(null);

    try {
      const res = await fetch("/api/auth/2fa/setup-begin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include", // send BCORD_* cookies
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error("setup-begin failed: " + res.status + " " + text);
      }

      const data = await res.json();
      setOtpauthUri(data.otpauth_uri);
      setSecretBase32(data.secret_base32);
      setStatusText(
        "Scan the QR code with your authenticator app, then enter the 6-digit code."
      );
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to start 2FA setup");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify() {
    setLoading(true);
    setError(null);
    setStatusText(null);

    try {
      const res = await fetch("/api/auth/2fa/setup-verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ code: verifyCode }),
      });

      const data = await res.json();

      if (!res.ok || data.status !== "ok") {
        throw new Error(data.message || "2FA verification failed");
      }

      setBackupCodes(data.backup_codes || []);
      setTotpEnabled(true);
      setStatusText("2FA has been enabled for your account.");
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to verify 2FA code");
    } finally {
      setLoading(false);
    }
  }

  const startDisabled = totpEnabled === true;

  return (
    <div style={{ maxWidth: 480, margin: "2rem auto", fontFamily: "sans-serif" }}>
      <h2>Two-Factor Authentication (TOTP)</h2>

      {totpEnabled === true && (
        <p style={{ color: "green" }}>
          2FA is currently <strong>enabled</strong> on your account.
        </p>
      )}
      {totpEnabled === false && (
        <p>
          2FA is currently <strong>disabled</strong> on your account.
        </p>
      )}

      {error && (
        <div style={{ color: "red", marginBottom: "0.75rem" }}>
          {error}
        </div>
      )}

      {statusText && (
        <div style={{ marginBottom: "0.75rem" }}>
          {statusText}
        </div>
      )}

      {!otpauthUri && (
        <button onClick={handleBegin} disabled={loading || startDisabled}>
          {totpEnabled ? "Reconfigure 2FA" : loading ? "Starting..." : "Enable 2FA"}
        </button>
      )}

      {otpauthUri && (
        <div style={{ marginTop: "1rem" }}>
          <p>
            1. Open your authenticator app (Google Authenticator, Aegis, etc.)
            on your phone.
          </p>
          <p>2. Choose “Add account” → “Scan QR code”.</p>
          <p>3. Scan this QR code:</p>

          <div
            style={{
              margin: "1rem 0",
              border: "1px solid #ccc",
              padding: "1rem",
              display: "inline-block",
            }}
          >
            <QRCodeSVG value={otpauthUri} size={200} />
          </div>

          <p>
            If you cannot scan the QR, you can enter this secret manually:
            <br />
            <code>{secretBase32}</code>
          </p>

          <p>
            4. After adding the account, enter the 6-digit code from your
            authenticator app:
          </p>

          <input
            type="text"
            value={verifyCode}
            onChange={(e) => setVerifyCode(e.target.value.trim())}
            placeholder="123456"
            maxLength={6}
            style={{ fontSize: "1.1rem", letterSpacing: "0.2em" }}
          />
          <div style={{ marginTop: "0.5rem" }}>
            <button
              onClick={handleVerify}
              disabled={loading || verifyCode.length !== 6}
            >
              {loading ? "Verifying..." : "Confirm 2FA"}
            </button>
          </div>
        </div>
      )}

      {backupCodes && backupCodes.length > 0 && (
        <div style={{ marginTop: "1.5rem" }}>
          <h3>Backup Codes</h3>
          <p>Store these somewhere safe. Each code can be used once.</p>
          <ul>
            {backupCodes.map((code) => (
              <li key={code}>
                <code>{code}</code>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

