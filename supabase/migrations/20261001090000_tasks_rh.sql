-- ============================================================
-- CENTRAL DE TAREFAS E LEMBRETES DO RH
-- ============================================================

CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'todo'
    CHECK (status IN ('todo','in_progress','done')),
  priority text NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low','medium','high','urgent')),
  due_date date,
  due_time time,
  reminder_at timestamptz,
  category text NOT NULL DEFAULT 'RH',
  assignee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  recurrence text NOT NULL DEFAULT 'none'
    CHECK (recurrence IN ('none','daily','weekly','monthly','yearly')),
  recurrence_until date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.task_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  title text NOT NULL,
  completed boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.task_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  reminder_at timestamptz NOT NULL,
  completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON public.tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON public.tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_employee ON public.tasks(employee_id);
CREATE INDEX IF NOT EXISTS idx_task_checklist_task ON public.task_checklist_items(task_id);
CREATE INDEX IF NOT EXISTS idx_task_reminders_task ON public.task_reminders(task_id);
CREATE INDEX IF NOT EXISTS idx_task_reminders_date ON public.task_reminders(reminder_at);

CREATE OR REPLACE FUNCTION public.set_tasks_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_updated_at ON public.tasks;
CREATE TRIGGER tasks_updated_at
BEFORE UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.set_tasks_updated_at();

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tasks_select_rh" ON public.tasks;
DROP POLICY IF EXISTS "tasks_insert_rh" ON public.tasks;
DROP POLICY IF EXISTS "tasks_update_rh" ON public.tasks;
DROP POLICY IF EXISTS "tasks_delete_rh" ON public.tasks;

CREATE POLICY "tasks_select_rh" ON public.tasks
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()));

CREATE POLICY "tasks_insert_rh" ON public.tasks
FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()));

CREATE POLICY "tasks_update_rh" ON public.tasks
FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()));

CREATE POLICY "tasks_delete_rh" ON public.tasks
FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()));

DROP POLICY IF EXISTS "task_checklist_select_rh" ON public.task_checklist_items;
DROP POLICY IF EXISTS "task_checklist_insert_rh" ON public.task_checklist_items;
DROP POLICY IF EXISTS "task_checklist_update_rh" ON public.task_checklist_items;
DROP POLICY IF EXISTS "task_checklist_delete_rh" ON public.task_checklist_items;

CREATE POLICY "task_checklist_select_rh" ON public.task_checklist_items
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()));

CREATE POLICY "task_checklist_insert_rh" ON public.task_checklist_items
FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()));

CREATE POLICY "task_checklist_update_rh" ON public.task_checklist_items
FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()));

CREATE POLICY "task_checklist_delete_rh" ON public.task_checklist_items
FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()));

DROP POLICY IF EXISTS "task_reminders_select_rh" ON public.task_reminders;
DROP POLICY IF EXISTS "task_reminders_insert_rh" ON public.task_reminders;
DROP POLICY IF EXISTS "task_reminders_update_rh" ON public.task_reminders;
DROP POLICY IF EXISTS "task_reminders_delete_rh" ON public.task_reminders;

CREATE POLICY "task_reminders_select_rh" ON public.task_reminders
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()));

CREATE POLICY "task_reminders_insert_rh" ON public.task_reminders
FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()));

CREATE POLICY "task_reminders_update_rh" ON public.task_reminders
FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()));

CREATE POLICY "task_reminders_delete_rh" ON public.task_reminders
FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()));
