export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          created_at: string
          description: string | null
          id: string
          key: string
          label: string | null
          updated_at: string
          value: Json
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          key: string
          label?: string | null
          updated_at?: string
          value?: Json
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          label?: string | null
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      attachments: {
        Row: {
          bucket: string
          created_at: string
          file_name: string
          id: string
          mime_type: string | null
          path: string
          size_bytes: number | null
          uploaded_by: string | null
        }
        Insert: {
          bucket?: string
          created_at?: string
          file_name: string
          id?: string
          mime_type?: string | null
          path: string
          size_bytes?: number | null
          uploaded_by?: string | null
        }
        Update: {
          bucket?: string
          created_at?: string
          file_name?: string
          id?: string
          mime_type?: string | null
          path?: string
          size_bytes?: number | null
          uploaded_by?: string | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          new_values: Json | null
          old_values: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      bank_hours: {
        Row: {
          adjustment_direction: string | null
          adjustment_reason: string | null
          balance_minutes: number
          created_at: string
          created_by: string | null
          employee_id: string
          entry_date: string
          id: string
          is_demo: boolean
          justification: string | null
          kind: Database["public"]["Enums"]["bank_hours_kind"]
          launch_group_id: string | null
          minutes: number
          period_id: string | null
          previous_balance_minutes: number
          updated_at: string
        }
        Insert: {
          adjustment_direction?: string | null
          adjustment_reason?: string | null
          balance_minutes?: number
          created_at?: string
          created_by?: string | null
          employee_id: string
          entry_date: string
          id?: string
          is_demo?: boolean
          justification?: string | null
          kind: Database["public"]["Enums"]["bank_hours_kind"]
          launch_group_id?: string | null
          minutes: number
          period_id?: string | null
          previous_balance_minutes?: number
          updated_at?: string
        }
        Update: {
          adjustment_direction?: string | null
          adjustment_reason?: string | null
          balance_minutes?: number
          created_at?: string
          created_by?: string | null
          employee_id?: string
          entry_date?: string
          id?: string
          is_demo?: boolean
          justification?: string | null
          kind?: Database["public"]["Enums"]["bank_hours_kind"]
          launch_group_id?: string | null
          minutes?: number
          period_id?: string | null
          previous_balance_minutes?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_hours_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_hours_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "time_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      company_settings: {
        Row: {
          address: string
          cnpj: string
          company_name: string
          email: string
          id: string
          logo_url: string | null
          phone: string
          primary_color: string | null
          trade_name: string
          updated_at: string
        }
        Insert: {
          address?: string
          cnpj?: string
          company_name?: string
          email?: string
          id?: string
          logo_url?: string | null
          phone?: string
          primary_color?: string | null
          trade_name?: string
          updated_at?: string
        }
        Update: {
          address?: string
          cnpj?: string
          company_name?: string
          email?: string
          id?: string
          logo_url?: string | null
          phone?: string
          primary_color?: string | null
          trade_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      departments: {
        Row: {
          active: boolean
          code: string | null
          created_at: string
          id: string
          is_demo: boolean
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code?: string | null
          created_at?: string
          id?: string
          is_demo?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string | null
          created_at?: string
          id?: string
          is_demo?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      employees: {
        Row: {
          birth_date: string | null
          cpf: string | null
          created_at: string
          department_id: string | null
          email: string | null
          full_name: string
          hire_date: string | null
          id: string
          is_demo: boolean
          manager_id: string | null
          notes: string | null
          phone: string | null
          position_id: string | null
          registration: string | null
          salary: number | null
          status: Database["public"]["Enums"]["employee_status"]
          termination_date: string | null
          updated_at: string
          work_schedule_id: string | null
        }
        Insert: {
          birth_date?: string | null
          cpf?: string | null
          created_at?: string
          department_id?: string | null
          email?: string | null
          full_name: string
          hire_date?: string | null
          id?: string
          is_demo?: boolean
          manager_id?: string | null
          notes?: string | null
          phone?: string | null
          position_id?: string | null
          registration?: string | null
          salary?: number | null
          status?: Database["public"]["Enums"]["employee_status"]
          termination_date?: string | null
          updated_at?: string
          work_schedule_id?: string | null
        }
        Update: {
          birth_date?: string | null
          cpf?: string | null
          created_at?: string
          department_id?: string | null
          email?: string | null
          full_name?: string
          hire_date?: string | null
          id?: string
          is_demo?: boolean
          manager_id?: string | null
          notes?: string | null
          phone?: string | null
          position_id?: string | null
          registration?: string | null
          salary?: number | null
          status?: Database["public"]["Enums"]["employee_status"]
          termination_date?: string | null
          updated_at?: string
          work_schedule_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_work_schedule_id_fkey"
            columns: ["work_schedule_id"]
            isOneToOne: false
            referencedRelation: "work_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      historical_import_batches: {
        Row: {
          created_at: string
          file_name: string
          id: string
          imported_by: string | null
          row_count: number
          source_sheet: string
          status: string
        }
        Insert: {
          created_at?: string
          file_name: string
          id?: string
          imported_by?: string | null
          row_count?: number
          source_sheet?: string
          status?: string
        }
        Update: {
          created_at?: string
          file_name?: string
          id?: string
          imported_by?: string | null
          row_count?: number
          source_sheet?: string
          status?: string
        }
        Relationships: []
      }
      historical_kpi_data: {
        Row: {
          absence_quantity: number
          allowance_minutes: number
          certificate_minutes: number
          created_at: string
          debit_minutes: number
          declaration_minutes: number
          department_name: string | null
          employee_id: string | null
          employee_name: string
          expected_minutes: number
          he_100_minutes: number
          he_20_minutes: number
          he_60_minutes: number
          he_60_night_minutes: number
          id: string
          import_batch_id: string | null
          interjornada_minutes: number
          period_end: string
          period_id: string | null
          period_start: string
          position_name: string | null
          reference_month: number
          reference_year: number
          registration: string | null
          source: string
          updated_at: string
          worked_minutes: number
        }
        Insert: {
          absence_quantity?: number
          allowance_minutes?: number
          certificate_minutes?: number
          created_at?: string
          debit_minutes?: number
          declaration_minutes?: number
          department_name?: string | null
          employee_id?: string | null
          employee_name: string
          expected_minutes?: number
          he_100_minutes?: number
          he_20_minutes?: number
          he_60_minutes?: number
          he_60_night_minutes?: number
          id?: string
          import_batch_id?: string | null
          interjornada_minutes?: number
          period_end: string
          period_id?: string | null
          period_start: string
          position_name?: string | null
          reference_month: number
          reference_year: number
          registration?: string | null
          source?: string
          updated_at?: string
          worked_minutes?: number
        }
        Update: {
          absence_quantity?: number
          allowance_minutes?: number
          certificate_minutes?: number
          created_at?: string
          debit_minutes?: number
          declaration_minutes?: number
          department_name?: string | null
          employee_id?: string | null
          employee_name?: string
          expected_minutes?: number
          he_100_minutes?: number
          he_20_minutes?: number
          he_60_minutes?: number
          he_60_night_minutes?: number
          id?: string
          import_batch_id?: string | null
          interjornada_minutes?: number
          period_end?: string
          period_id?: string | null
          period_start?: string
          position_name?: string | null
          reference_month?: number
          reference_year?: number
          registration?: string | null
          source?: string
          updated_at?: string
          worked_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "historical_kpi_data_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historical_kpi_data_import_batch_fk"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "historical_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historical_kpi_data_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "time_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      holidays: {
        Row: {
          created_at: string
          holiday_date: string
          id: string
          is_demo: boolean
          name: string
          scope: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          holiday_date: string
          id?: string
          is_demo?: boolean
          name: string
          scope?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          holiday_date?: string
          id?: string
          is_demo?: boolean
          name?: string
          scope?: string
          updated_at?: string
        }
        Relationships: []
      }
      medical_certificates: {
        Row: {
          attachment_id: string | null
          certificate_type: string
          cid: string | null
          created_at: string
          created_by: string | null
          days: number
          employee_id: string
          end_date: string
          id: string
          is_demo: boolean
          notes: string | null
          start_date: string
          updated_at: string
        }
        Insert: {
          attachment_id?: string | null
          certificate_type?: string
          cid?: string | null
          created_at?: string
          created_by?: string | null
          days?: number
          employee_id: string
          end_date: string
          id?: string
          is_demo?: boolean
          notes?: string | null
          start_date: string
          updated_at?: string
        }
        Update: {
          attachment_id?: string | null
          certificate_type?: string
          cid?: string | null
          created_at?: string
          created_by?: string | null
          days?: number
          employee_id?: string
          end_date?: string
          id?: string
          is_demo?: boolean
          notes?: string | null
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medical_certificates_attachment_id_fkey"
            columns: ["attachment_id"]
            isOneToOne: false
            referencedRelation: "attachments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_certificates_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      occurrence_types: {
        Row: {
          active: boolean
          affects_balance: boolean
          code: string
          created_at: string
          id: string
          name: string
          requires_justification: boolean
          unit: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          affects_balance?: boolean
          code: string
          created_at?: string
          id?: string
          name: string
          requires_justification?: boolean
          unit?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          affects_balance?: boolean
          code?: string
          created_at?: string
          id?: string
          name?: string
          requires_justification?: boolean
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      occurrences: {
        Row: {
          attachment_id: string | null
          cid: string | null
          created_at: string
          created_by: string | null
          employee_id: string
          end_date: string | null
          id: string
          is_demo: boolean
          justification: string | null
          notes: string | null
          occurrence_date: string
          occurrence_type_id: string
          period_id: string | null
          quantity: number | null
          unit: string
          updated_at: string
        }
        Insert: {
          attachment_id?: string | null
          cid?: string | null
          created_at?: string
          created_by?: string | null
          employee_id: string
          end_date?: string | null
          id?: string
          is_demo?: boolean
          justification?: string | null
          notes?: string | null
          occurrence_date: string
          occurrence_type_id: string
          period_id?: string | null
          quantity?: number | null
          unit?: string
          updated_at?: string
        }
        Update: {
          attachment_id?: string | null
          cid?: string | null
          created_at?: string
          created_by?: string | null
          employee_id?: string
          end_date?: string | null
          id?: string
          is_demo?: boolean
          justification?: string | null
          notes?: string | null
          occurrence_date?: string
          occurrence_type_id?: string
          period_id?: string | null
          quantity?: number | null
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "occurrences_attachment_id_fkey"
            columns: ["attachment_id"]
            isOneToOne: false
            referencedRelation: "attachments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "occurrences_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "occurrences_occurrence_type_id_fkey"
            columns: ["occurrence_type_id"]
            isOneToOne: false
            referencedRelation: "occurrence_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "occurrences_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "time_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      overtime_records: {
        Row: {
          created_at: string
          employee_id: string
          estimated_value: number | null
          id: string
          is_demo: boolean
          launch_group_id: string | null
          launch_type: string
          minutes: number
          notes: string | null
          period_id: string | null
          rate_percent: number | null
          reference_date: string
          time_record_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          estimated_value?: number | null
          id?: string
          is_demo?: boolean
          launch_group_id?: string | null
          launch_type?: string
          minutes?: number
          notes?: string | null
          period_id?: string | null
          rate_percent?: number | null
          reference_date: string
          time_record_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          estimated_value?: number | null
          id?: string
          is_demo?: boolean
          launch_group_id?: string | null
          launch_type?: string
          minutes?: number
          notes?: string | null
          period_id?: string | null
          rate_percent?: number | null
          reference_date?: string
          time_record_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "overtime_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overtime_records_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "time_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overtime_records_time_record_id_fkey"
            columns: ["time_record_id"]
            isOneToOne: false
            referencedRelation: "time_records"
            referencedColumns: ["id"]
          },
        ]
      }
      point_closing_overrides: {
        Row: {
          absence_quantity: number
          allowance_minutes: number
          certificate_minutes: number
          created_at: string
          debit_minutes: number
          declaration_minutes: number
          employee_id: string
          expected_minutes: number
          he_100_minutes: number
          he_20_minutes: number
          he_60_minutes: number
          he_60_night_minutes: number
          id: string
          interjornada_minutes: number
          justification: string | null
          period_id: string
          updated_at: string
          worked_minutes: number
        }
        Insert: {
          absence_quantity?: number
          allowance_minutes?: number
          certificate_minutes?: number
          created_at?: string
          debit_minutes?: number
          declaration_minutes?: number
          employee_id: string
          expected_minutes?: number
          he_100_minutes?: number
          he_20_minutes?: number
          he_60_minutes?: number
          he_60_night_minutes?: number
          id?: string
          interjornada_minutes?: number
          justification?: string | null
          period_id: string
          updated_at?: string
          worked_minutes?: number
        }
        Update: {
          absence_quantity?: number
          allowance_minutes?: number
          certificate_minutes?: number
          created_at?: string
          debit_minutes?: number
          declaration_minutes?: number
          employee_id?: string
          expected_minutes?: number
          he_100_minutes?: number
          he_20_minutes?: number
          he_60_minutes?: number
          he_60_night_minutes?: number
          id?: string
          interjornada_minutes?: number
          justification?: string | null
          period_id?: string
          updated_at?: string
          worked_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "point_closing_overrides_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "point_closing_overrides_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "time_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      positions: {
        Row: {
          active: boolean
          created_at: string
          department_id: string | null
          id: string
          is_demo: boolean
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          department_id?: string | null
          id?: string
          is_demo?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          department_id?: string | null
          id?: string
          is_demo?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "positions_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          role: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          role?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          description: string | null
          id: string
          label: string
          setting_group: string
          setting_key: string
          setting_value: string
          updated_at: string
        }
        Insert: {
          description?: string | null
          id?: string
          label?: string
          setting_group: string
          setting_key: string
          setting_value?: string
          updated_at?: string
        }
        Update: {
          description?: string | null
          id?: string
          label?: string
          setting_group?: string
          setting_key?: string
          setting_value?: string
          updated_at?: string
        }
        Relationships: []
      }
      task_checklist_items: {
        Row: {
          completed: boolean
          created_at: string
          id: string
          position: number
          task_id: string
          title: string
        }
        Insert: {
          completed?: boolean
          created_at?: string
          id?: string
          position?: number
          task_id: string
          title: string
        }
        Update: {
          completed?: boolean
          created_at?: string
          id?: string
          position?: number
          task_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_checklist_items_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_reminders: {
        Row: {
          completed: boolean
          created_at: string
          id: string
          reminder_at: string
          task_id: string
        }
        Insert: {
          completed?: boolean
          created_at?: string
          id?: string
          reminder_at: string
          task_id: string
        }
        Update: {
          completed?: boolean
          created_at?: string
          id?: string
          reminder_at?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_reminders_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee_id: string | null
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          due_time: string | null
          employee_id: string | null
          id: string
          priority: string
          recurrence: string
          recurrence_until: string | null
          reminder_at: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          due_time?: string | null
          employee_id?: string | null
          id?: string
          priority?: string
          recurrence?: string
          recurrence_until?: string | null
          reminder_at?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          due_time?: string | null
          employee_id?: string | null
          id?: string
          priority?: string
          recurrence?: string
          recurrence_until?: string | null
          reminder_at?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      time_adjustments: {
        Row: {
          created_at: string
          created_by: string | null
          employee_id: string
          field_name: string
          id: string
          new_value: string | null
          old_value: string | null
          reason: string | null
          time_record_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          employee_id: string
          field_name: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          reason?: string | null
          time_record_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          employee_id?: string
          field_name?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          reason?: string | null
          time_record_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_adjustments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_adjustments_time_record_id_fkey"
            columns: ["time_record_id"]
            isOneToOne: false
            referencedRelation: "time_records"
            referencedColumns: ["id"]
          },
        ]
      }
      time_periods: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          created_at: string
          end_date: string
          id: string
          notes: string | null
          reference_month: number
          reference_year: number
          reopened_at: string | null
          reopened_by: string | null
          start_date: string
          status: Database["public"]["Enums"]["period_status"]
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          end_date: string
          id?: string
          notes?: string | null
          reference_month: number
          reference_year: number
          reopened_at?: string | null
          reopened_by?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["period_status"]
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          end_date?: string
          id?: string
          notes?: string | null
          reference_month?: number
          reference_year?: number
          reopened_at?: string | null
          reopened_by?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["period_status"]
          updated_at?: string
        }
        Relationships: []
      }
      time_records: {
        Row: {
          balance_minutes: number
          break_in_at: string | null
          break_out_at: string | null
          created_at: string
          employee_id: string
          entry_at: string | null
          exit_at: string | null
          expected_minutes: number
          id: string
          import_batch_id: string | null
          is_demo: boolean
          negative_minutes: number
          notes: string | null
          overtime_minutes: number
          period_id: string | null
          source: string
          status: Database["public"]["Enums"]["time_record_status"]
          updated_at: string
          work_date: string
          worked_minutes: number
        }
        Insert: {
          balance_minutes?: number
          break_in_at?: string | null
          break_out_at?: string | null
          created_at?: string
          employee_id: string
          entry_at?: string | null
          exit_at?: string | null
          expected_minutes?: number
          id?: string
          import_batch_id?: string | null
          is_demo?: boolean
          negative_minutes?: number
          notes?: string | null
          overtime_minutes?: number
          period_id?: string | null
          source?: string
          status?: Database["public"]["Enums"]["time_record_status"]
          updated_at?: string
          work_date: string
          worked_minutes?: number
        }
        Update: {
          balance_minutes?: number
          break_in_at?: string | null
          break_out_at?: string | null
          created_at?: string
          employee_id?: string
          entry_at?: string | null
          exit_at?: string | null
          expected_minutes?: number
          id?: string
          import_batch_id?: string | null
          is_demo?: boolean
          negative_minutes?: number
          notes?: string | null
          overtime_minutes?: number
          period_id?: string | null
          source?: string
          status?: Database["public"]["Enums"]["time_record_status"]
          updated_at?: string
          work_date?: string
          worked_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "time_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_records_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "time_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      work_schedules: {
        Row: {
          active: boolean
          break_end: string | null
          break_start: string | null
          created_at: string
          daily_minutes: number
          entry_time: string | null
          exit_time: string | null
          id: string
          is_demo: boolean
          name: string
          schedule_type: string
          updated_at: string
          weekly_minutes: number
        }
        Insert: {
          active?: boolean
          break_end?: string | null
          break_start?: string | null
          created_at?: string
          daily_minutes?: number
          entry_time?: string | null
          exit_time?: string | null
          id?: string
          is_demo?: boolean
          name: string
          schedule_type?: string
          updated_at?: string
          weekly_minutes?: number
        }
        Update: {
          active?: boolean
          break_end?: string | null
          break_start?: string | null
          created_at?: string
          daily_minutes?: number
          entry_time?: string | null
          exit_time?: string | null
          id?: string
          is_demo?: boolean
          name?: string
          schedule_type?: string
          updated_at?: string
          weekly_minutes?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_manage: { Args: { _user_id: string }; Returns: boolean }
      certificate_cid: { Args: { _certificate_id: string }; Returns: string }
      current_roles: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"][]
      }
      ensure_user_setup: {
        Args: { _email?: string; _full_name?: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_app_access: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_rh_user: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "administrador" | "rh" | "gestor" | "consulta"
      bank_hours_kind:
        | "credito"
        | "debito"
        | "compensacao"
        | "ajuste"
        | "pagamento_he"
      employee_status: "ativo" | "inativo"
      period_status: "aberto" | "em_conferencia" | "fechado"
      time_record_status:
        | "normal"
        | "incompleto"
        | "falta"
        | "atraso"
        | "saida_antecipada"
        | "folga"
        | "feriado"
        | "ferias"
        | "atestado"
        | "ajustado"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["administrador", "rh", "gestor", "consulta"],
      bank_hours_kind: [
        "credito",
        "debito",
        "compensacao",
        "ajuste",
        "pagamento_he",
      ],
      employee_status: ["ativo", "inativo"],
      period_status: ["aberto", "em_conferencia", "fechado"],
      time_record_status: [
        "normal",
        "incompleto",
        "falta",
        "atraso",
        "saida_antecipada",
        "folga",
        "feriado",
        "ferias",
        "atestado",
        "ajustado",
      ],
    },
  },
} as const
