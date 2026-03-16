// ============================================================
// Supabase Configuration
// ============================================================
// NOTE: This now uses the ANON (public) key. Row Level
// Security (RLS) should be enabled and configured on your
// tables for proper security.
// ============================================================

const SUPABASE_URL = 'https://nghtzzacizwfgutqeane.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5naHR6emFjaXp3Zmd1dHFlYW5lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTczMzQ0MDIsImV4cCI6MjA3MjkxMDQwMn0.KatppVJgQLYsrH-ZfgrpHlMq0spfrorj0t-HLuxVwtM';

// Allowed admin emails (only these Google accounts can log in)
const ALLOWED_EMAILS = [
  'shinichi07700@gmail.com',
  'brandon.suwarno@gmail.com',
];

// Supabase Storage bucket for receipt images
const STORAGE_BUCKET = 'receipts';

// Table names
const TABLE_NAME = 'receipt_inter';
const CLAIMED_TABLE_NAME = 'receipt_inter_claimed';

// Page size for pagination
const PAGE_SIZE = 50;
