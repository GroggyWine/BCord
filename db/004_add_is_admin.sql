-- ============================================================================
-- BCord Database Schema - Add is_admin Column
-- ============================================================================
-- This file adds the is_admin column required by main.cpp
-- CRITICAL: Without this, admin_fetch_dm_thread() will fail
-- ============================================================================

-- Add is_admin column to users table
ALTER TABLE users 
    ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- Create index for quickly finding admin users
CREATE INDEX IF NOT EXISTS idx_users_is_admin 
    ON users(is_admin) 
    WHERE is_admin = TRUE;

-- Optional: Make the first registered user an admin
-- Uncomment the line below if you want user ID 1 to be auto-promoted to admin
-- UPDATE users SET is_admin = TRUE WHERE id = 1;

-- ============================================================================
-- NOTES:
-- 
-- This column is used in main.cpp for:
-- 1. load_user_info() - Loads user admin status (line 228-239)
-- 2. require_admin() - Checks if user has admin privileges (line 242-247)
-- 3. /api/admin/dm/thread endpoint - Admin-only DM viewing (line 1249)
--
-- Default value is FALSE so all existing users are non-admin by default.
-- You can manually promote users to admin with:
--   UPDATE users SET is_admin = TRUE WHERE username = 'your_username';
-- ============================================================================
