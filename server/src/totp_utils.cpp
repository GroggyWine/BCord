#include "totp_utils.h"

#include <stdexcept>
#include <random>
#include <ctime>
#include <cstring>

#include <openssl/evp.h>
#include <openssl/hmac.h>
#include <openssl/rand.h>
#include <openssl/sha.h>

#include <nlohmann/json.hpp>

// For Base32 and Base64 helpers
#include <algorithm>
#include <array>

// ---------------------------------------------------------------------------
// Simple Base32 (RFC 4648) encode/decode for TOTP secrets
// ---------------------------------------------------------------------------

static const char BASE32_ALPHABET[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

static std::string base32_encode(const std::vector<uint8_t> &data) {
    std::string out;
    out.reserve((data.size() * 8 + 4) / 5);

    uint32_t buffer = 0;
    int bits_left = 0;

    for (auto byte : data) {
        buffer = (buffer << 8) | byte;
        bits_left += 8;
        while (bits_left >= 5) {
            int index = (buffer >> (bits_left - 5)) & 0x1F;
            bits_left -= 5;
            out.push_back(BASE32_ALPHABET[index]);
        }
    }

    if (bits_left > 0) {
        int index = (buffer << (5 - bits_left)) & 0x1F;
        out.push_back(BASE32_ALPHABET[index]);
    }

    return out;
}

static bool base32_decode(const std::string &input, std::vector<uint8_t> &out) {
    out.clear();
    uint32_t buffer = 0;
    int bits_left = 0;

    auto decode_char = [](char c) -> int {
        if (c >= 'A' && c <= 'Z') return c - 'A';
        if (c >= 'a' && c <= 'z') return c - 'a'; // be forgiving
        if (c >= '2' && c <= '7') return c - '2' + 26;
        return -1;
    };

    for (char c : input) {
        if (c == '=' || c == ' ') continue;
        int val = decode_char(c);
        if (val < 0) return false;
        buffer = (buffer << 5) | static_cast<uint32_t>(val);
        bits_left += 5;
        if (bits_left >= 8) {
            bits_left -= 8;
            out.push_back(static_cast<uint8_t>((buffer >> bits_left) & 0xFF));
        }
    }
    return true;
}

// ---------------------------------------------------------------------------
// Base64 helpers for encryption (we already have similar logic in jwt_utils)
// ---------------------------------------------------------------------------

static std::string base64_encode(const uint8_t *data, std::size_t len) {
    static const char tbl[] =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    std::string out;
    out.reserve(4 * ((len + 2) / 3));
    for (std::size_t i = 0; i < len;) {
        uint32_t octet_a = i < len ? data[i++] : 0;
        uint32_t octet_b = i < len ? data[i++] : 0;
        uint32_t octet_c = i < len ? data[i++] : 0;

        uint32_t triple = (octet_a << 16) | (octet_b << 8) | octet_c;

        out.push_back(tbl[(triple >> 18) & 0x3F]);
        out.push_back(tbl[(triple >> 12) & 0x3F]);
        out.push_back(i > len + 1 ? '=' : tbl[(triple >> 6) & 0x3F]);
        out.push_back(i > len ? '=' : tbl[triple & 0x3F]);
    }
    return out;
}

static bool base64_decode(const std::string &input, std::vector<uint8_t> &out) {
    static const int DECODE_TBL[256] = {
        // initialize once with -1 and fill, but for brevity we do it programmatically below
    };
    // We'll use OpenSSL BIO for simplicity since it's already a dependency.
    std::string s = input;
    BIO *b64 = BIO_new(BIO_f_base64());
    BIO_set_flags(b64, BIO_FLAGS_BASE64_NO_NL);
    BIO *bio = BIO_new_mem_buf(s.data(), s.size());
    bio = BIO_push(b64, bio);

    out.clear();
    char buf[256];
    int len;
    while ((len = BIO_read(bio, buf, sizeof(buf))) > 0) {
        out.insert(out.end(), buf, buf + len);
    }

    BIO_free_all(bio);
    return true;
}

// ---------------------------------------------------------------------------
// TOTP helpers
// ---------------------------------------------------------------------------

std::string generate_totp_secret_base32(std::size_t num_bytes) {
    if (num_bytes == 0) num_bytes = 20;
    std::vector<uint8_t> bytes(num_bytes);
    if (RAND_bytes(bytes.data(), static_cast<int>(bytes.size())) != 1) {
        throw std::runtime_error("RAND_bytes failed for TOTP secret");
    }
    return base32_encode(bytes);
}

std::string build_totp_otpauth_uri(const std::string &issuer,
                                   const std::string &account_name,
                                   const std::string &secret_base32) {
    // Basic URL encoding for issuer/account is skipped for now; you can add if needed.
    std::ostringstream oss;
    oss << "otpauth://totp/"
        << issuer << ":" << account_name
        << "?secret=" << secret_base32
        << "&issuer=" << issuer
        << "&algorithm=SHA1&digits=6&period=30";
    return oss.str();
}

static void hmac_sha1(const std::vector<uint8_t> &key,
                      const uint8_t *data,
                      std::size_t data_len,
                      uint8_t out[SHA_DIGEST_LENGTH]) {
    unsigned int len = 0;
    HMAC(EVP_sha1(),
         key.data(), static_cast<int>(key.size()),
         data, data_len,
         out, &len);
}

bool compute_totp_code(const std::string &secret_base32,
                       std::uint64_t time_step,
                       std::uint32_t &out_code) {
    std::vector<uint8_t> key;
    if (!base32_decode(secret_base32, key) || key.empty()) {
        return false;
    }

    // 8-byte big endian time_step
    uint8_t msg[8];
    for (int i = 7; i >= 0; --i) {
        msg[i] = static_cast<uint8_t>(time_step & 0xFF);
        time_step >>= 8;
    }

    uint8_t hash[SHA_DIGEST_LENGTH];
    hmac_sha1(key, msg, sizeof(msg), hash);

    // Dynamic truncation
    int offset = hash[SHA_DIGEST_LENGTH - 1] & 0x0F;
    std::uint32_t bin_code =
        ((hash[offset] & 0x7F) << 24) |
        ((hash[offset + 1] & 0xFF) << 16) |
        ((hash[offset + 2] & 0xFF) << 8) |
        (hash[offset + 3] & 0xFF);

    out_code = bin_code % 1000000; // 6 digits
    return true;
}

bool compute_current_totp_code(const std::string &secret_base32,
                               std::uint32_t &out_code,
                               int step_seconds) {
    std::uint64_t now = static_cast<std::uint64_t>(std::time(nullptr));
    std::uint64_t step = now / static_cast<std::uint64_t>(step_seconds);
    return compute_totp_code(secret_base32, step, out_code);
}

bool verify_totp_code(const std::string &secret_base32,
                      std::uint32_t supplied_code,
                      int step_seconds,
                      int window) {
    std::uint64_t now = static_cast<std::uint64_t>(std::time(nullptr));
    std::uint64_t current_step = now / static_cast<std::uint64_t>(step_seconds);

    for (int w = -window; w <= window; ++w) {
        std::uint64_t step = current_step + static_cast<std::int64_t>(w);
        std::uint32_t code = 0;
        if (!compute_totp_code(secret_base32, step, code)) {
            return false;
        }
        if (code == supplied_code) {
            return true;
        }
    }
    return false;
}

// ---------------------------------------------------------------------------
// AES-256-GCM encryption helpers for TOTP secrets
// ---------------------------------------------------------------------------

static bool get_totp_key(std::vector<uint8_t> &key) {
    const char *env = std::getenv("BCORD_TOTP_KEY");
    if (!env) return false;
    std::string raw = env;
    if (raw.size() < 32) return false;

    key.assign(raw.begin(), raw.begin() + 32);
    return true;
}

bool encrypt_totp_secret(const std::string &plain_secret,
                         std::string &out_cipher_b64,
                         std::string &out_iv_b64) {
    std::vector<uint8_t> key;
    if (!get_totp_key(key)) {
        return false;
    }

    // IV: 12 bytes for GCM
    std::vector<uint8_t> iv(12);
    if (RAND_bytes(iv.data(), static_cast<int>(iv.size())) != 1) {
        return false;
    }

    EVP_CIPHER_CTX *ctx = EVP_CIPHER_CTX_new();
    if (!ctx) return false;

    bool ok = false;
    std::vector<uint8_t> ciphertext(plain_secret.size() + 16);
    int len = 0;
    int ciphertext_len = 0;
    uint8_t tag[16];

    do {
        if (EVP_EncryptInit_ex(ctx, EVP_aes_256_gcm(), nullptr,
                               key.data(), iv.data()) != 1) {
            break;
        }

        if (EVP_EncryptUpdate(ctx,
                              ciphertext.data(), &len,
                              reinterpret_cast<const uint8_t*>(plain_secret.data()),
                              static_cast<int>(plain_secret.size())) != 1) {
            break;
        }
        ciphertext_len = len;

        if (EVP_EncryptFinal_ex(ctx, ciphertext.data() + len, &len) != 1) {
            break;
        }
        ciphertext_len += len;

        if (EVP_CIPHER_CTX_ctrl(ctx, EVP_CTRL_GCM_GET_TAG, 16, tag) != 1) {
            break;
        }

        // Serialize as: ciphertext || tag
        ciphertext.resize(ciphertext_len + 16);
        std::memcpy(ciphertext.data() + ciphertext_len, tag, 16);

        out_cipher_b64 = base64_encode(ciphertext.data(), ciphertext.size());
        out_iv_b64 = base64_encode(iv.data(), iv.size());
        ok = true;
    } while (false);

    EVP_CIPHER_CTX_free(ctx);
    return ok;
}

bool decrypt_totp_secret(const std::string &cipher_b64,
                         const std::string &iv_b64,
                         std::string &out_plain_secret) {
    std::vector<uint8_t> key;
    if (!get_totp_key(key)) {
        return false;
    }

    std::vector<uint8_t> ciphertext_and_tag;
    if (!base64_decode(cipher_b64, ciphertext_and_tag)) {
        return false;
    }
    if (ciphertext_and_tag.size() < 16) {
        return false;
    }

    std::vector<uint8_t> iv;
    if (!base64_decode(iv_b64, iv)) {
        return false;
    }

    std::size_t total = ciphertext_and_tag.size();
    std::size_t ct_len = total - 16;
    std::vector<uint8_t> ciphertext(ct_len);
    std::memcpy(ciphertext.data(), ciphertext_and_tag.data(), ct_len);
    uint8_t tag[16];
    std::memcpy(tag, ciphertext_and_tag.data() + ct_len, 16);

    EVP_CIPHER_CTX *ctx = EVP_CIPHER_CTX_new();
    if (!ctx) return false;

    bool ok = false;
    std::vector<uint8_t> plain(ciphertext.size() + 16);
    int len = 0;
    int plain_len = 0;

    do {
        if (EVP_DecryptInit_ex(ctx, EVP_aes_256_gcm(), nullptr,
                               key.data(), iv.data()) != 1) {
            break;
        }

        if (EVP_DecryptUpdate(ctx,
                              plain.data(), &len,
                              ciphertext.data(), static_cast<int>(ciphertext.size())) != 1) {
            break;
        }
        plain_len = len;

        if (EVP_CIPHER_CTX_ctrl(ctx, EVP_CTRL_GCM_SET_TAG, 16, tag) != 1) {
            break;
        }

        if (EVP_DecryptFinal_ex(ctx, plain.data() + len, &len) != 1) {
            // auth failed
            break;
        }
        plain_len += len;

        plain.resize(plain_len);
        out_plain_secret.assign(reinterpret_cast<char*>(plain.data()), plain.size());
        ok = true;
    } while (false);

    EVP_CIPHER_CTX_free(ctx);
    return ok;
}

