-- ============================================================
-- SQL Script for Supabase Row Level Security (RLS)
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. Enable RLS on the table
ALTER TABLE receipt_inter ENABLE ROW LEVEL SECURITY;

-- 2. Create a policy to allow authenticated users to SELECT (Read)
CREATE POLICY "Allow authenticated select" 
ON receipt_inter 
FOR SELECT 
TO authenticated 
USING (true);

-- 3. Create a policy to allow authenticated users to INSERT (Create)
CREATE POLICY "Allow authenticated insert" 
ON receipt_inter 
FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- 4. Create a policy to allow authenticated users to UPDATE (Edit)
CREATE POLICY "Allow authenticated update" 
ON receipt_inter 
FOR UPDATE 
TO authenticated 
USING (true)
WITH CHECK (true);

-- 5. Create a policy to allow authenticated users to DELETE
CREATE POLICY "Allow authenticated delete" 
ON receipt_inter 
FOR DELETE 
TO authenticated 
USING (true);

-- Optional: If the table was previously public, you might need to 
-- drop existing public access if it's causing conflicts.
-- DROP POLICY IF EXISTS "Public select" ON receipt_inter;
