#include <pqxx/pqxx>
#include <iostream>
#include <string>
#include "db_init.h"

// Uses PG_CONN from main.cpp
extern const std::string PG_CONN;

bool initialize_schema() {
    try {
        pqxx::connection c(PG_CONN);
        pqxx::work txn(c);

        // USERS TABLE (base definition)
        txn.exec(R"SQL(
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                verified BOOLEAN DEFAULT FALSE,
                verification_code TEXT,
                verification_expires TIMESTAMPTZ,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        )SQL");

        // Ensure 2FA/TOTP columns exist on users (for existing DBs)
        txn.exec(R"SQL(
            ALTER TABLE users
                ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN DEFAULT FALSE,
                ADD COLUMN IF NOT EXISTS totp_secret_cipher TEXT,
                ADD COLUMN IF NOT EXISTS totp_secret_iv TEXT;
        )SQL");

        // SESSIONS TABLE (refresh tokens)
        txn.exec(R"SQL(
            CREATE TABLE IF NOT EXISTS sessions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                refresh_token TEXT UNIQUE NOT NULL,
                expires_at TIMESTAMPTZ NOT NULL
            );
        )SQL");

        // BACKUP CODES TABLE
        txn.exec(R"SQL(
            CREATE TABLE IF NOT EXISTS user_backup_codes (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                code_hash TEXT NOT NULL,
                used BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        )SQL");

        // PASSWORD RESETS TABLE
        txn.exec(R"SQL(
            CREATE TABLE IF NOT EXISTS password_resets (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                token TEXT UNIQUE NOT NULL,
                expires_at TIMESTAMPTZ NOT NULL,
                used BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        )SQL");

        txn.commit();
        std::cout << "[DB] Schema initialized successfully." << std::endl;
        return true;
    }
    catch (const std::exception &e) {
        std::cerr << "[DB] Schema initialization failed: " << e.what() << std::endl;
        return false;
    }
}

