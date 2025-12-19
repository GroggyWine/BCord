#pragma once

#include <string>
#include <cstdint>
#include <vector>

// Generate a new random TOTP secret (Base32 encoded).
// This is what we show to the user as a QR or manual entry.
std::string generate_totp_secret_base32(std::size_t num_bytes = 20);

// Build the otpauth URI for QR provisioning
// Example: otpauth://totp/BCord:username?secret=XXXX&issuer=BCord
std::string build_totp_otpauth_uri(const std::string &issuer,
                                   const std::string &account_name,
                                   const std::string &secret_base32);

// Return the current TOTP code (6 digits) for a given Base32 secret.
// Returns true on success, false on failure.
bool compute_totp_code(const std::string &secret_base32,
                       std::uint64_t time_step,
                       std::uint32_t &out_code);

// Wrapper to compute "now" TOTP code (time_step = now / 30).
bool compute_current_totp_code(const std::string &secret_base32,
                               std::uint32_t &out_code,
                               int step_seconds = 30);

// Verify a TOTP code for the "current" time with a small window (±1 step).
bool verify_totp_code(const std::string &secret_base32,
                      std::uint32_t supplied_code,
                      int step_seconds = 30,
                      int window = 1);

// ---------------------------------------------------------------------------
// Encryption helpers for TOTP secrets (AES-256-GCM)
// ---------------------------------------------------------------------------
//
// We encrypt TOTP secrets at rest using a 256-bit key from the environment.
// Env var: BCORD_TOTP_KEY (raw bytes, must be at least 32 chars).
//
// encrypt_totp_secret:
//   plain_secret -> cipher_b64, iv_b64
// decrypt_totp_secret:
//   cipher_b64 + iv_b64 -> plain_secret
//
// Both return true on success, false on failure.

bool encrypt_totp_secret(const std::string &plain_secret,
                         std::string &out_cipher_b64,
                         std::string &out_iv_b64);

bool decrypt_totp_secret(const std::string &cipher_b64,
                         const std::string &iv_b64,
                         std::string &out_plain_secret);

