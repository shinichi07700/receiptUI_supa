-- ============================================================
-- SQL Script for Supabase Storage RLS
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. Allow authenticated users to READ (SELECT) from the 'receipts' bucket
CREATE POLICY "Allow authenticated read from receipts"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'receipts');

-- 2. Allow authenticated users to UPLOAD (INSERT) to the 'receipts' bucket
CREATE POLICY "Allow authenticated upload to receipts"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'receipts');

-- 3. Allow authenticated users to UPDATE their own uploads (optional)
CREATE POLICY "Allow authenticated update in receipts"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'receipts');

-- 4. Allow authenticated users to DELETE from the 'receipts' bucket
CREATE POLICY "Allow authenticated delete from receipts"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'receipts');
