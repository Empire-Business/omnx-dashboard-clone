-- =============================================================================
-- Migration: Drop AI Assistant Infrastructure
-- Removes all tables, functions, triggers, and indexes created for the
-- RAG-based AI assistant feature (feature was abandoned).
-- Apply this to database qzesffnkqgelmtfblzkr to clean up.
-- =============================================================================

-- Drop triggers first (they depend on tables and functions)
DROP TRIGGER IF EXISTS trigger_ai_doc_chunks_updated_at ON ai_doc_chunks;
DROP TRIGGER IF EXISTS trigger_ai_conversations_updated_at ON ai_conversations;

-- Drop functions
DROP FUNCTION IF EXISTS match_ai_docs(VECTOR(384), FLOAT, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS update_ai_doc_chunks_updated_at() CASCADE;
DROP FUNCTION IF EXISTS update_ai_conversations_updated_at() CASCADE;
DROP FUNCTION IF EXISTS get_or_create_conversation(UUID, TEXT) CASCADE;

-- Drop tables in dependency order (messages before conversations, chunks before index)
DROP TABLE IF EXISTS ai_messages CASCADE;
DROP TABLE IF EXISTS ai_conversations CASCADE;
DROP TABLE IF EXISTS ai_doc_chunks CASCADE;
DROP TABLE IF EXISTS ai_doc_index_status CASCADE;

-- Note: We do NOT drop the pgvector extension as it may be used by other features
-- DROP EXTENSION IF EXISTS vector;
