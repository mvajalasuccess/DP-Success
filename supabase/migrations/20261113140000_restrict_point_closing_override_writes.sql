-- DP SUCCESS: only Administrador/RH may write official point-closing corrections.
-- Guests and other authenticated users retain read-only access.
-- No correction rows or historical calculations are modified.

ALTER TABLE public.point_closing_overrides ENABLE ROW LEVEL SECURITY;

-- Remove all previous policies, including legacy permissive policies that
-- could otherwise OR together and continue allowing writes.
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'point_closing_overrides'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.point_closing_overrides', p.policyname);
  END LOOP;
END $$;

-- Any active application user may read the official correction values.
CREATE POLICY point_closing_overrides_select
ON public.point_closing_overrides
FOR SELECT TO authenticated
USING (private.has_app_access((SELECT auth.uid())));

-- Only active Administrador/RH users may create or change official corrections.
CREATE POLICY point_closing_overrides_insert
ON public.point_closing_overrides
FOR INSERT TO authenticated
WITH CHECK (private.can_manage((SELECT auth.uid())));

CREATE POLICY point_closing_overrides_update
ON public.point_closing_overrides
FOR UPDATE TO authenticated
USING (private.can_manage((SELECT auth.uid())))
WITH CHECK (private.can_manage((SELECT auth.uid())));

CREATE POLICY point_closing_overrides_delete
ON public.point_closing_overrides
FOR DELETE TO authenticated
USING (private.can_manage((SELECT auth.uid())));

-- Remove the defective legacy helper once no policy depends on it.
DROP FUNCTION IF EXISTS public.is_rh_user();
