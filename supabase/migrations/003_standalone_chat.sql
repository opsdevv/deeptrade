-- Support standalone chat messages (not tied to analysis runs)
ALTER TABLE chat_messages 
  ALTER COLUMN analysis_run_id DROP NOT NULL;

-- Add symbol field for standalone chats
ALTER TABLE chat_messages 
  ADD COLUMN IF NOT EXISTS symbol TEXT;

-- Add index for symbol-based queries
CREATE INDEX IF NOT EXISTS idx_chat_messages_symbol ON chat_messages(symbol, created_at DESC);

-- Add session_id for grouping standalone chat sessions
ALTER TABLE chat_messages 
  ADD COLUMN IF NOT EXISTS session_id UUID;

-- Index for session-based queries
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, created_at DESC);
