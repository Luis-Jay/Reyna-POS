DO $$
DECLARE
  existing_constraint TEXT;
  named_constraint_exists BOOLEAN;
  activations_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'activations'
  )
  INTO activations_exists;

  IF NOT activations_exists THEN
    RETURN;
  END IF;

  SELECT tc.constraint_name
  INTO existing_constraint
  FROM information_schema.table_constraints AS tc
  JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
  WHERE tc.table_schema = 'public'
    AND tc.table_name = 'activations'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'user_id'
  LIMIT 1;

  IF existing_constraint IS NOT NULL AND existing_constraint <> 'activations_user_id_fkey' THEN
    EXECUTE format('ALTER TABLE public.activations DROP CONSTRAINT %I', existing_constraint);
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'activations_user_id_fkey'
      AND conrelid = 'public.activations'::regclass
  )
  INTO named_constraint_exists;

  IF NOT named_constraint_exists THEN
    ALTER TABLE public.activations
      ADD CONSTRAINT activations_user_id_fkey
      FOREIGN KEY (user_id)
      REFERENCES auth.users(id)
      ON DELETE CASCADE;
  END IF;
END $$;
