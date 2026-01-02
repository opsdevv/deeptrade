-- Add last_analyzed_at column to watchlist_signals if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'watchlist_signals' 
    AND column_name = 'last_analyzed_at'
  ) THEN
    ALTER TABLE watchlist_signals 
    ADD COLUMN last_analyzed_at TIMESTAMPTZ;
    
    -- Update existing records that have analysis_data with timestamp
    UPDATE watchlist_signals
    SET last_analyzed_at = (
      CASE 
        WHEN analysis_data->>'timestamp' IS NOT NULL 
        THEN to_timestamp((analysis_data->>'timestamp')::bigint / 1000)
        ELSE NULL
      END
    )
    WHERE last_analyzed_at IS NULL 
    AND analysis_data IS NOT NULL 
    AND analysis_data != '{}'::jsonb;
  END IF;
END $$;
