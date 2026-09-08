-- =============================================================================
-- Migration: AI Assistant Infrastructure
-- Creates tables, functions, and indexes for RAG-based AI assistant
-- =============================================================================

-- =============================================================================
-- PARTE 1: EXTENSIONS
-- =============================================================================

-- Enable pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- =============================================================================
-- PARTE 2: TABLES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. ai_doc_chunks: Stores chunks of documentation with embeddings for RAG
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_doc_chunks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    doc_path TEXT NOT NULL,                    -- Path relative to docs/ folder (e.g., "ARQUITETURA.md")
    chunk_index INTEGER NOT NULL,              -- Order of chunk within document
    content TEXT NOT NULL,                     -- The actual text content
    embedding VECTOR(384),                     -- Embedding vector (gte-small model via Supabase AI)
    token_count INTEGER,                       -- Approximate token count for the chunk
    metadata JSONB DEFAULT '{}'::jsonb,        -- Additional metadata (title, section, etc.)
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    
    -- Ensure unique chunks per document
    UNIQUE(doc_path, chunk_index)
);

-- Indexes for ai_doc_chunks
CREATE INDEX IF NOT EXISTS idx_ai_doc_chunks_embedding ON ai_doc_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_ai_doc_chunks_path ON ai_doc_chunks(doc_path);
CREATE INDEX IF NOT EXISTS idx_ai_doc_chunks_created ON ai_doc_chunks(created_at DESC);

-- Comment on table
COMMENT ON TABLE ai_doc_chunks IS 'Stores document chunks with embeddings for RAG-based AI assistant';

-- -----------------------------------------------------------------------------
-- 2. ai_doc_index_status: Tracks document indexing status and change detection
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_doc_index_status (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    doc_path TEXT NOT NULL UNIQUE,             -- Path relative to docs/ folder
    file_hash TEXT NOT NULL,                   -- SHA-256 hash of file content for change detection
    last_indexed_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    chunk_count INTEGER DEFAULT 0,             -- Number of chunks created from this document
    status TEXT DEFAULT 'indexed' CHECK (status IN ('indexed', 'error', 'pending', 'processing')),
    error_message TEXT,                        -- Error details if status is 'error'
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Indexes for ai_doc_index_status
CREATE INDEX IF NOT EXISTS idx_ai_doc_index_status_path ON ai_doc_index_status(doc_path);
CREATE INDEX IF NOT EXISTS idx_ai_doc_index_status_status ON ai_doc_index_status(status);
CREATE INDEX IF NOT EXISTS idx_ai_doc_index_status_indexed ON ai_doc_index_status(last_indexed_at DESC);

-- Comment on table
COMMENT ON TABLE ai_doc_index_status IS 'Tracks which documents have been indexed and their hash for change detection';

-- -----------------------------------------------------------------------------
-- 3. ai_conversations: Stores chat conversations
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_conversations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,  -- Link to Supabase auth
    title TEXT,                                -- Auto-generated from first message or user-defined
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Indexes for ai_conversations
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user ON ai_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_created ON ai_conversations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_updated ON ai_conversations(updated_at DESC);

-- Comment on table
COMMENT ON TABLE ai_conversations IS 'Stores chat conversations for AI assistant';

-- -----------------------------------------------------------------------------
-- 4. ai_messages: Stores individual messages in conversations
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id UUID REFERENCES ai_conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    tokens_used INTEGER,                       -- Token count for this message
    model_used TEXT,                           -- e.g., "anthropic/claude-sonnet-4.6"
    relevant_docs JSONB DEFAULT '[]'::jsonb,   -- List of doc paths used for context
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Indexes for ai_messages
CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation ON ai_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_messages_created ON ai_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_messages_role ON ai_messages(role);

-- Comment on table
COMMENT ON TABLE ai_messages IS 'Stores individual messages in AI assistant conversations';

-- =============================================================================
-- PARTE 3: FUNCTIONS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Vector similarity search function for document chunks
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS match_ai_docs(VECTOR(384), FLOAT, INTEGER);

CREATE OR REPLACE FUNCTION match_ai_docs(
    p_query_embedding VECTOR(384),
    p_match_threshold FLOAT DEFAULT 0.7,
    p_match_count INTEGER DEFAULT 5
)
RETURNS TABLE (
    id UUID,
    doc_path TEXT,
    chunk_index INTEGER,
    content TEXT,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        adc.id,
        adc.doc_path,
        adc.chunk_index,
        adc.content,
        (1 - (adc.embedding <=> p_query_embedding))::FLOAT as similarity
    FROM ai_doc_chunks adc
    WHERE (1 - (adc.embedding <=> p_query_embedding)) > p_match_threshold
    ORDER BY adc.embedding <=> p_query_embedding
    LIMIT p_match_count;
END;
$$;

COMMENT ON FUNCTION match_ai_docs IS 'Performs vector similarity search on document chunks for RAG';

-- -----------------------------------------------------------------------------
-- Function to update timestamps automatically
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS update_ai_doc_chunks_updated_at();
DROP FUNCTION IF EXISTS update_ai_conversations_updated_at();

CREATE OR REPLACE FUNCTION update_ai_doc_chunks_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION update_ai_conversations_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- Create triggers for automatic timestamp updates
DROP TRIGGER IF EXISTS trigger_ai_doc_chunks_updated_at ON ai_doc_chunks;
CREATE TRIGGER trigger_ai_doc_chunks_updated_at
    BEFORE UPDATE ON ai_doc_chunks
    FOR EACH ROW
    EXECUTE FUNCTION update_ai_doc_chunks_updated_at();

DROP TRIGGER IF EXISTS trigger_ai_conversations_updated_at ON ai_conversations;
CREATE TRIGGER trigger_ai_conversations_updated_at
    BEFORE UPDATE ON ai_conversations
    FOR EACH ROW
    EXECUTE FUNCTION update_ai_conversations_updated_at();

-- -----------------------------------------------------------------------------
-- Function to get or create conversation
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS get_or_create_conversation(UUID, TEXT);

CREATE OR REPLACE FUNCTION get_or_create_conversation(
    p_user_id UUID,
    p_title TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    v_conversation_id UUID;
BEGIN
    -- Try to get the most recent conversation for the user
    SELECT id INTO v_conversation_id
    FROM ai_conversations
    WHERE user_id = p_user_id
    ORDER BY updated_at DESC
    LIMIT 1;
    
    -- If no conversation exists, create a new one
    IF v_conversation_id IS NULL THEN
        INSERT INTO ai_conversations (user_id, title)
        VALUES (p_user_id, p_title)
        RETURNING id INTO v_conversation_id;
    END IF;
    
    RETURN v_conversation_id;
END;
$$;

COMMENT ON FUNCTION get_or_create_conversation IS 'Gets the most recent conversation or creates a new one for the user';

-- -----------------------------------------------------------------------------
-- Function to update conversation title from first message
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS update_conversation_title();

CREATE OR REPLACE FUNCTION update_conversation_title()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_message_count INTEGER;
    v_current_title TEXT;
BEGIN
    -- Only process user messages
    IF NEW.role = 'user' THEN
        -- Check if this is the first message in the conversation
        SELECT COUNT(*) INTO v_message_count
        FROM ai_messages
        WHERE conversation_id = NEW.conversation_id;
        
        -- Get current conversation title
        SELECT title INTO v_current_title
        FROM ai_conversations
        WHERE id = NEW.conversation_id;
        
        -- If first message and no title, set title from content (truncated)
        IF v_message_count = 0 AND (v_current_title IS NULL OR v_current_title = '') THEN
            UPDATE ai_conversations
            SET title = LEFT(NEW.content, 100)
            WHERE id = NEW.conversation_id;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Create trigger for auto-title
DROP TRIGGER IF EXISTS trigger_ai_messages_update_title ON ai_messages;
CREATE TRIGGER trigger_ai_messages_update_title
    AFTER INSERT ON ai_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_conversation_title();

-- =============================================================================
-- PARTE 4: RLS (Row Level Security)
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE ai_doc_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_doc_index_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_messages ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- RLS Policies for ai_doc_chunks
-- -----------------------------------------------------------------------------

-- Service role has full access
CREATE POLICY "Service role full access on ai_doc_chunks"
    ON ai_doc_chunks FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Authenticated users can read (for RAG queries)
CREATE POLICY "Authenticated users can read ai_doc_chunks"
    ON ai_doc_chunks FOR SELECT
    TO authenticated
    USING (true);

-- -----------------------------------------------------------------------------
-- RLS Policies for ai_doc_index_status
-- -----------------------------------------------------------------------------

-- Service role has full access
CREATE POLICY "Service role full access on ai_doc_index_status"
    ON ai_doc_index_status FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Authenticated users can read
CREATE POLICY "Authenticated users can read ai_doc_index_status"
    ON ai_doc_index_status FOR SELECT
    TO authenticated
    USING (true);

-- -----------------------------------------------------------------------------
-- RLS Policies for ai_conversations
-- -----------------------------------------------------------------------------

-- Service role has full access
CREATE POLICY "Service role full access on ai_conversations"
    ON ai_conversations FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Users can only see their own conversations
CREATE POLICY "Users can view own conversations"
    ON ai_conversations FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- Users can create their own conversations
CREATE POLICY "Users can create own conversations"
    ON ai_conversations FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

-- Users can update their own conversations
CREATE POLICY "Users can update own conversations"
    ON ai_conversations FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Users can delete their own conversations
CREATE POLICY "Users can delete own conversations"
    ON ai_conversations FOR DELETE
    TO authenticated
    USING (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- RLS Policies for ai_messages
-- -----------------------------------------------------------------------------

-- Service role has full access
CREATE POLICY "Service role full access on ai_messages"
    ON ai_messages FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Users can only see messages from their conversations
CREATE POLICY "Users can view own messages"
    ON ai_messages FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM ai_conversations
            WHERE ai_conversations.id = ai_messages.conversation_id
            AND ai_conversations.user_id = auth.uid()
        )
    );

-- Users can create messages in their conversations
CREATE POLICY "Users can create messages in own conversations"
    ON ai_messages FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM ai_conversations
            WHERE ai_conversations.id = ai_messages.conversation_id
            AND ai_conversations.user_id = auth.uid()
        )
    );

-- Users cannot update or delete messages (immutable for audit purposes)
-- No UPDATE or DELETE policies for authenticated users

-- =============================================================================
-- PARTE 5: GRANTS
-- =============================================================================

-- Tables use UUID primary keys (gen_random_uuid()), no sequences to grant

-- =============================================================================
-- PARTE 6: UTILITY VIEWS (Optional)
-- =============================================================================

-- View for conversation statistics
CREATE OR REPLACE VIEW ai_conversation_stats AS
SELECT 
    c.id AS conversation_id,
    c.user_id,
    c.title,
    c.created_at,
    c.updated_at,
    COUNT(m.id) AS message_count,
    SUM(COALESCE(m.tokens_used, 0)) AS total_tokens,
    COUNT(DISTINCT m.model_used) AS models_used
FROM ai_conversations c
LEFT JOIN ai_messages m ON m.conversation_id = c.id
GROUP BY c.id, c.user_id, c.title, c.created_at, c.updated_at;

COMMENT ON VIEW ai_conversation_stats IS 'Aggregated statistics for AI conversations';

-- View for document indexing summary
CREATE OR REPLACE VIEW ai_doc_index_summary AS
SELECT 
    doc_path,
    status,
    chunk_count,
    last_indexed_at,
    error_message,
    created_at
FROM ai_doc_index_status
ORDER BY doc_path;

COMMENT ON VIEW ai_doc_index_summary IS 'Summary view of document indexing status';

-- =============================================================================
-- PARTE 7: SAMPLE DATA FOR TESTING (Optional - comment out in production)
-- =============================================================================

-- Insert a sample system message template
-- This can be used to seed initial system prompts if needed
-- INSERT INTO ai_messages (conversation_id, role, content, model_used)
-- VALUES (
--     '00000000-0000-0000-0000-000000000000'::UUID,
--     'system',
--     'You are an AI assistant for the Empire Dashboard project.',
--     'system'
-- );

-- =============================================================================
-- FINISHED
-- =============================================================================
