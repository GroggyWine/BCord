-- ============================================================================
-- BCord Database Schema - Direct Messages (DM) System
-- ============================================================================
-- This file creates the tables required for the DM functionality in main.cpp
-- CRITICAL: Without this, all /api/dm/* endpoints will fail with table errors
-- ============================================================================

-- -----------------------------------------------------------------------------
-- Direct Conversation Threads
-- -----------------------------------------------------------------------------
-- Stores 1-on-1 conversation threads between two users
-- Each pair of users can only have one DM thread (enforced by unique constraint)
CREATE TABLE IF NOT EXISTS direct_conversations (
    dm_id BIGSERIAL PRIMARY KEY,
    user1_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user2_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_message_at TIMESTAMPTZ,
    
    -- Ensure each user pair only has one DM thread
    CONSTRAINT unique_dm_pair UNIQUE (user1_id, user2_id),
    
    -- Prevent users from DMing themselves
    CONSTRAINT no_self_dm CHECK (user1_id <> user2_id)
);

-- Index for finding DMs by first user
CREATE INDEX IF NOT EXISTS idx_dm_conversations_user1 
    ON direct_conversations(user1_id);

-- Index for finding DMs by second user
CREATE INDEX IF NOT EXISTS idx_dm_conversations_user2 
    ON direct_conversations(user2_id);

-- Index for sorting DMs by activity
CREATE INDEX IF NOT EXISTS idx_dm_conversations_activity 
    ON direct_conversations(last_message_at DESC NULLS LAST);

-- -----------------------------------------------------------------------------
-- Direct Messages
-- -----------------------------------------------------------------------------
-- Stores individual messages within DM threads
CREATE TABLE IF NOT EXISTS direct_messages (
    dm_message_id BIGSERIAL PRIMARY KEY,
    dm_id BIGINT NOT NULL REFERENCES direct_conversations(dm_id) ON DELETE CASCADE,
    sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    edited_at TIMESTAMPTZ,
    deleted_by_admin BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Ensure content is not empty
    CONSTRAINT content_not_empty CHECK (LENGTH(TRIM(content)) > 0)
);

-- Index for fetching messages in a DM thread chronologically
CREATE INDEX IF NOT EXISTS idx_dm_messages_dm_thread 
    ON direct_messages(dm_id, created_at ASC);

-- Index for finding all messages by a sender
CREATE INDEX IF NOT EXISTS idx_dm_messages_sender 
    ON direct_messages(sender_id);

-- Index for admin queries (finding deleted messages)
CREATE INDEX IF NOT EXISTS idx_dm_messages_deleted 
    ON direct_messages(deleted_by_admin) 
    WHERE deleted_by_admin = TRUE;

-- -----------------------------------------------------------------------------
-- Comments
-- -----------------------------------------------------------------------------
-- This schema supports the following operations from main.cpp:
-- 1. get_or_create_dm() - Creates or retrieves DM thread between two users
-- 2. send_dm_message() - Inserts a new message into a DM thread
-- 3. list_dms_for_user() - Lists all DM threads for a user with last message
-- 4. fetch_dm_thread_for_user() - Retrieves all messages in a DM thread
-- 5. admin_fetch_dm_thread() - Admin version showing deleted messages
-- 
-- The unique_dm_pair constraint ensures no duplicate DM threads exist.
-- The dm_id references are set to CASCADE on delete to clean up orphaned data.
-- ============================================================================
