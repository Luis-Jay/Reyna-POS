-- Allow authenticated users to upload product images to the storage bucket
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Authenticated upload product images'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Authenticated upload product images"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'product-images')
    $policy$;
  END IF;
END $$;

-- Allow authenticated users to overwrite (upsert) their product images
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Authenticated update product images'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Authenticated update product images"
      ON storage.objects FOR UPDATE TO authenticated
      USING (bucket_id = 'product-images')
    $policy$;
  END IF;
END $$;

-- Allow authenticated users to delete their product images
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Authenticated delete product images'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Authenticated delete product images"
      ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = 'product-images')
    $policy$;
  END IF;
END $$;
