-- Add image_url column to catalog_products for Supabase Storage URLs
ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Create product-images storage bucket (public so URLs are directly accessible)
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access on the bucket
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'Public read product images'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Public read product images"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'product-images')
    $policy$;
  END IF;
END $$;
