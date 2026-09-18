/**
 * Supabase database types — generated from the live schema.
 * Regenerate with: supabase gen types typescript --project-id bistwpzpfrtlmsegoggu
 */

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
      timetable_entries: {
        Row: {
          id: string
          school_id: string
          class_arm_id: string
          day_of_week: number
          period: number
          start_time: string | null
          end_time: string | null
          subject_id: string | null
          staff_id: string | null
          note: string | null
          created_at: string
        }
        Insert: {
          id?: string
          school_id: string
          class_arm_id: string
          day_of_week: number
          period: number
          start_time?: string | null
          end_time?: string | null
          subject_id?: string | null
          staff_id?: string | null
          note?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          class_arm_id?: string
          day_of_week?: number
          period?: number
          start_time?: string | null
          end_time?: string | null
          subject_id?: string | null
          staff_id?: string | null
          note?: string | null
          created_at?: string
        }
        Relationships: []
      }
      assignments: {
        Row: {
          id: string
          school_id: string
          class_arm_id: string
          subject_id: string | null
          term_id: string | null
          title: string
          description: string | null
          due_date: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          school_id: string
          class_arm_id: string
          subject_id?: string | null
          term_id?: string | null
          title: string
          description?: string | null
          due_date?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          school_id?: string
          class_arm_id?: string
          subject_id?: string | null
          term_id?: string | null
          title?: string
          description?: string | null
          due_date?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      staff_subjects: {
        Row: { id: string; school_id: string; staff_id: string; subject_id: string }
        Insert: { id?: string; school_id: string; staff_id: string; subject_id: string }
        Update: { id?: string; school_id?: string; staff_id?: string; subject_id?: string }
        Relationships: []
      }
      student_subjects: {
        Row: { id: string; school_id: string; student_id: string; subject_id: string; session_id: string; created_at: string }
        Insert: { id?: string; school_id: string; student_id: string; subject_id: string; session_id: string; created_at?: string }
        Update: { id?: string; school_id?: string; student_id?: string; subject_id?: string; session_id?: string; created_at?: string }
        Relationships: []
      }
      ledger_categories: {
        Row: { id: string; school_id: string; name: string; kind: 'income' | 'expense'; created_at: string }
        Insert: { id?: string; school_id: string; name: string; kind: 'income' | 'expense'; created_at?: string }
        Update: { id?: string; school_id?: string; name?: string; kind?: 'income' | 'expense'; created_at?: string }
        Relationships: []
      }
      ledger_entries: {
        Row: { id: string; school_id: string; date: string; kind: 'income' | 'expense'; category_id: string | null; party: string | null; description: string | null; amount: number; session_id: string | null; term_id: string | null; created_by: string | null; created_at: string }
        Insert: { id?: string; school_id: string; date?: string; kind: 'income' | 'expense'; category_id?: string | null; party?: string | null; description?: string | null; amount?: number; session_id?: string | null; term_id?: string | null; created_by?: string | null; created_at?: string }
        Update: { id?: string; school_id?: string; date?: string; kind?: 'income' | 'expense'; category_id?: string | null; party?: string | null; description?: string | null; amount?: number; session_id?: string | null; term_id?: string | null; created_by?: string | null; created_at?: string }
        Relationships: []
      }
      academic_sessions: {
        Row: {
          created_at: string
          end_date: string | null
          id: string
          is_current: boolean
          name: string
          school_id: string
          start_date: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          id?: string
          is_current?: boolean
          name: string
          school_id: string
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string | null
          id?: string
          is_current?: boolean
          name?: string
          school_id?: string
          start_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_sessions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      admins: {
        Row: {
          added_at: string
          email: string
        }
        Insert: {
          added_at?: string
          email: string
        }
        Update: {
          added_at?: string
          email?: string
        }
        Relationships: []
      }
      announcements: {
        Row: {
          audience: Json
          body: string | null
          channels: string[]
          created_at: string
          created_by: string | null
          id: string
          published_at: string | null
          school_id: string
          title: string
        }
        Insert: {
          audience?: Json
          body?: string | null
          channels?: string[]
          created_at?: string
          created_by?: string | null
          id?: string
          published_at?: string | null
          school_id: string
          title: string
        }
        Update: {
          audience?: Json
          body?: string | null
          channels?: string[]
          created_at?: string
          created_by?: string | null
          id?: string
          published_at?: string | null
          school_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      assessments: {
        Row: {
          class_arm_id: string
          created_at: string
          id: string
          max_score: number
          name: string
          school_id: string
          subject_id: string
          term_id: string
          updated_at: string
          weight: number
        }
        Insert: {
          class_arm_id: string
          created_at?: string
          id?: string
          max_score?: number
          name: string
          school_id: string
          subject_id: string
          term_id: string
          updated_at?: string
          weight?: number
        }
        Update: {
          class_arm_id?: string
          created_at?: string
          id?: string
          max_score?: number
          name?: string
          school_id?: string
          subject_id?: string
          term_id?: string
          updated_at?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "assessments_class_arm_id_fkey"
            columns: ["class_arm_id"]
            isOneToOne: false
            referencedRelation: "class_arms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          created_at: string
          date: string
          enrollment_id: string
          id: string
          marked_by: string | null
          school_id: string
          status: Database["public"]["Enums"]["attendance_status"]
          term_id: string | null
        }
        Insert: {
          created_at?: string
          date: string
          enrollment_id: string
          id?: string
          marked_by?: string | null
          school_id: string
          status?: Database["public"]["Enums"]["attendance_status"]
          term_id?: string | null
        }
        Update: {
          created_at?: string
          date?: string
          enrollment_id?: string
          id?: string
          marked_by?: string | null
          school_id?: string
          status?: Database["public"]["Enums"]["attendance_status"]
          term_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          entity: string | null
          entity_id: string | null
          id: string
          school_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          school_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          school_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      class_arms: {
        Row: {
          capacity: number | null
          class_level_id: string
          class_teacher_id: string | null
          created_at: string
          id: string
          name: string
          school_id: string
        }
        Insert: {
          capacity?: number | null
          class_level_id: string
          class_teacher_id?: string | null
          created_at?: string
          id?: string
          name: string
          school_id: string
        }
        Update: {
          capacity?: number | null
          class_level_id?: string
          class_teacher_id?: string | null
          created_at?: string
          id?: string
          name?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_arms_class_level_id_fkey"
            columns: ["class_level_id"]
            isOneToOne: false
            referencedRelation: "class_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_arms_class_teacher_fk"
            columns: ["class_teacher_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_arms_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      class_levels: {
        Row: {
          created_at: string
          id: string
          name: string
          school_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          school_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          school_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "class_levels_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollments: {
        Row: {
          class_arm_id: string
          created_at: string
          id: string
          school_id: string
          session_id: string
          status: Database["public"]["Enums"]["enrollment_status"]
          student_id: string
        }
        Insert: {
          class_arm_id: string
          created_at?: string
          id?: string
          school_id: string
          session_id: string
          status?: Database["public"]["Enums"]["enrollment_status"]
          student_id: string
        }
        Update: {
          class_arm_id?: string
          created_at?: string
          id?: string
          school_id?: string
          session_id?: string
          status?: Database["public"]["Enums"]["enrollment_status"]
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_class_arm_id_fkey"
            columns: ["class_arm_id"]
            isOneToOne: false
            referencedRelation: "class_arms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "academic_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_structures: {
        Row: {
          amount: number
          class_level_id: string | null
          created_at: string
          id: string
          is_recurring: boolean
          name: string
          school_id: string
          session_id: string | null
          term_id: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          class_level_id?: string | null
          created_at?: string
          id?: string
          is_recurring?: boolean
          name: string
          school_id: string
          session_id?: string | null
          term_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          class_level_id?: string | null
          created_at?: string
          id?: string
          is_recurring?: boolean
          name?: string
          school_id?: string
          session_id?: string | null
          term_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_structures_class_level_id_fkey"
            columns: ["class_level_id"]
            isOneToOne: false
            referencedRelation: "class_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_structures_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_structures_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "academic_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_structures_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      grading_schemes: {
        Row: {
          bands: Json
          created_at: string
          id: string
          is_default: boolean
          name: string
          school_id: string
          updated_at: string
        }
        Insert: {
          bands?: Json
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          school_id: string
          updated_at?: string
        }
        Update: {
          bands?: Json
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grading_schemes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      guardians: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          relationship: string | null
          school_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          phone?: string | null
          relationship?: string | null
          school_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          relationship?: string | null
          school_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guardians_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      households: {
        Row: {
          address: string | null
          community: string | null
          created_at: string
          envelope_no: string | null
          home_phone: string | null
          household_name: string
          id: string
          notes: string | null
          parish: string
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          community?: string | null
          created_at?: string
          envelope_no?: string | null
          home_phone?: string | null
          household_name: string
          id?: string
          notes?: string | null
          parish: string
          source?: string
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          community?: string | null
          created_at?: string
          envelope_no?: string | null
          home_phone?: string | null
          household_name?: string
          id?: string
          notes?: string | null
          parish?: string
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      invoice_items: {
        Row: {
          amount: number
          description: string
          fee_structure_id: string | null
          id: string
          invoice_id: string
          school_id: string
        }
        Insert: {
          amount?: number
          description: string
          fee_structure_id?: string | null
          id?: string
          invoice_id: string
          school_id: string
        }
        Update: {
          amount?: number
          description?: string
          fee_structure_id?: string | null
          id?: string
          invoice_id?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_fee_structure_id_fkey"
            columns: ["fee_structure_id"]
            isOneToOne: false
            referencedRelation: "fee_structures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_paid: number
          created_at: string
          due_date: string | null
          id: string
          reference: string | null
          school_id: string
          session_id: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          student_id: string
          term_id: string | null
          total: number
          updated_at: string
        }
        Insert: {
          amount_paid?: number
          created_at?: string
          due_date?: string | null
          id?: string
          reference?: string | null
          school_id: string
          session_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          student_id: string
          term_id?: string | null
          total?: number
          updated_at?: string
        }
        Update: {
          amount_paid?: number
          created_at?: string
          due_date?: string | null
          id?: string
          reference?: string | null
          school_id?: string
          session_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          student_id?: string
          term_id?: string | null
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "academic_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          created_at: string
          date_of_birth: string | null
          email: string | null
          faith_participation: string | null
          first_name: string
          household_id: string
          id: string
          is_head: boolean
          last_name: string
          marital_status: string | null
          ministries: string[]
          mobile: string | null
          notes: string | null
          record_status: string
          relationship: string | null
          sac_baptism: boolean
          sac_baptism_year: number | null
          sac_communion: boolean
          sac_communion_year: number | null
          sac_confirmation: boolean
          sac_confirmation_year: number | null
          sac_marriage: boolean
          sac_marriage_year: number | null
          sex: string | null
          spouse_name: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          faith_participation?: string | null
          first_name: string
          household_id: string
          id?: string
          is_head?: boolean
          last_name: string
          marital_status?: string | null
          ministries?: string[]
          mobile?: string | null
          notes?: string | null
          record_status?: string
          relationship?: string | null
          sac_baptism?: boolean
          sac_baptism_year?: number | null
          sac_communion?: boolean
          sac_communion_year?: number | null
          sac_confirmation?: boolean
          sac_confirmation_year?: number | null
          sac_marriage?: boolean
          sac_marriage_year?: number | null
          sex?: string | null
          spouse_name?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          faith_participation?: string | null
          first_name?: string
          household_id?: string
          id?: string
          is_head?: boolean
          last_name?: string
          marital_status?: string | null
          ministries?: string[]
          mobile?: string | null
          notes?: string | null
          record_status?: string
          relationship?: string | null
          sac_baptism?: boolean
          sac_baptism_year?: number | null
          sac_communion?: boolean
          sac_communion_year?: number | null
          sac_confirmation?: boolean
          sac_confirmation_year?: number | null
          sac_marriage?: boolean
          sac_marriage_year?: number | null
          sex?: string | null
          spouse_name?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "members_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          read_at: string | null
          school_id: string
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          read_at?: string | null
          school_id: string
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          read_at?: string | null
          school_id?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          bank_name: string | null
          created_at: string
          id: string
          invoice_id: string
          method: Database["public"]["Enums"]["payment_method"]
          paid_at: string
          receipt_image_url: string | null
          recorded_by: string | null
          reference: string | null
          school_id: string
          status: string
          teller_no: string | null
        }
        Insert: {
          amount: number
          bank_name?: string | null
          created_at?: string
          id?: string
          invoice_id: string
          method?: Database["public"]["Enums"]["payment_method"]
          paid_at?: string
          receipt_image_url?: string | null
          recorded_by?: string | null
          reference?: string | null
          school_id: string
          status?: string
          teller_no?: string | null
        }
        Update: {
          amount?: number
          bank_name?: string | null
          created_at?: string
          id?: string
          invoice_id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          paid_at?: string
          receipt_image_url?: string | null
          recorded_by?: string | null
          reference?: string | null
          school_id?: string
          status?: string
          teller_no?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      report_cards: {
        Row: {
          average: number | null
          class_teacher_comment: string | null
          created_at: string
          data: Json
          id: string
          overall_grade: string | null
          position: number | null
          principal_comment: string | null
          published_at: string | null
          school_id: string
          student_id: string
          term_id: string
          total_score: number | null
          updated_at: string
        }
        Insert: {
          average?: number | null
          class_teacher_comment?: string | null
          created_at?: string
          data?: Json
          id?: string
          overall_grade?: string | null
          position?: number | null
          principal_comment?: string | null
          published_at?: string | null
          school_id: string
          student_id: string
          term_id: string
          total_score?: number | null
          updated_at?: string
        }
        Update: {
          average?: number | null
          class_teacher_comment?: string | null
          created_at?: string
          data?: Json
          id?: string
          overall_grade?: string | null
          position?: number | null
          principal_comment?: string | null
          published_at?: string | null
          school_id?: string
          student_id?: string
          term_id?: string
          total_score?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_cards_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_cards_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_cards_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      schools: {
        Row: {
          address: string | null
          created_at: string
          created_by: string | null
          currency: string
          email: string | null
          id: string
          logo_url: string | null
          motto: string | null
          name: string
          phone: string | null
          primary_color: string | null
          settings: Json
          slug: string | null
          subscription_status: string
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          motto?: string | null
          name: string
          phone?: string | null
          primary_color?: string | null
          settings?: Json
          slug?: string | null
          subscription_status?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          motto?: string | null
          name?: string
          phone?: string | null
          primary_color?: string | null
          settings?: Json
          slug?: string | null
          subscription_status?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      scores: {
        Row: {
          assessment_id: string
          created_at: string
          id: string
          recorded_by: string | null
          remark: string | null
          school_id: string
          score: number | null
          student_id: string
          updated_at: string
        }
        Insert: {
          assessment_id: string
          created_at?: string
          id?: string
          recorded_by?: string | null
          remark?: string | null
          school_id: string
          score?: number | null
          student_id: string
          updated_at?: string
        }
        Update: {
          assessment_id?: string
          created_at?: string
          id?: string
          recorded_by?: string | null
          remark?: string | null
          school_id?: string
          score?: number | null
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scores_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scores_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scores_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          created_at: string
          department: string | null
          email: string | null
          employment_date: string | null
          employment_status: string
          first_name: string
          id: string
          last_name: string
          phone: string | null
          photo_url: string | null
          qualification: string | null
          school_id: string
          staff_no: string | null
          title: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          department?: string | null
          email?: string | null
          employment_date?: string | null
          employment_status?: string
          first_name: string
          id?: string
          last_name: string
          phone?: string | null
          photo_url?: string | null
          qualification?: string | null
          school_id: string
          staff_no?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          department?: string | null
          email?: string | null
          employment_date?: string | null
          employment_status?: string
          first_name?: string
          id?: string
          last_name?: string
          phone?: string | null
          photo_url?: string | null
          qualification?: string | null
          school_id?: string
          staff_no?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      student_guardians: {
        Row: {
          can_pickup: boolean
          guardian_id: string
          id: string
          is_primary: boolean
          school_id: string
          student_id: string
        }
        Insert: {
          can_pickup?: boolean
          guardian_id: string
          id?: string
          is_primary?: boolean
          school_id: string
          student_id: string
        }
        Update: {
          can_pickup?: boolean
          guardian_id?: string
          id?: string
          is_primary?: boolean
          school_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_guardians_guardian_id_fkey"
            columns: ["guardian_id"]
            isOneToOne: false
            referencedRelation: "guardians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_guardians_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_guardians_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          admission_no: string | null
          created_at: string
          dob: string | null
          first_name: string
          gender: string | null
          id: string
          last_name: string
          middle_name: string | null
          photo_url: string | null
          school_id: string
          status: Database["public"]["Enums"]["student_status"]
          updated_at: string
        }
        Insert: {
          admission_no?: string | null
          created_at?: string
          dob?: string | null
          first_name: string
          gender?: string | null
          id?: string
          last_name: string
          middle_name?: string | null
          photo_url?: string | null
          school_id: string
          status?: Database["public"]["Enums"]["student_status"]
          updated_at?: string
        }
        Update: {
          admission_no?: string | null
          created_at?: string
          dob?: string | null
          first_name?: string
          gender?: string | null
          id?: string
          last_name?: string
          middle_name?: string | null
          photo_url?: string | null
          school_id?: string
          status?: Database["public"]["Enums"]["student_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      subject_teachers: {
        Row: {
          class_arm_id: string
          id: string
          school_id: string
          session_id: string
          staff_id: string
          subject_id: string
        }
        Insert: {
          class_arm_id: string
          id?: string
          school_id: string
          session_id: string
          staff_id: string
          subject_id: string
        }
        Update: {
          class_arm_id?: string
          id?: string
          school_id?: string
          session_id?: string
          staff_id?: string
          subject_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subject_teachers_class_arm_id_fkey"
            columns: ["class_arm_id"]
            isOneToOne: false
            referencedRelation: "class_arms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subject_teachers_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subject_teachers_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "academic_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subject_teachers_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subject_teachers_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          code: string | null
          created_at: string
          id: string
          is_core: boolean
          name: string
          school_id: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          id?: string
          is_core?: boolean
          name: string
          school_id: string
        }
        Update: {
          code?: string | null
          created_at?: string
          id?: string
          is_core?: boolean
          name?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subjects_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      terms: {
        Row: {
          created_at: string
          end_date: string | null
          id: string
          is_current: boolean
          name: Database["public"]["Enums"]["term_name"]
          resumption_date: string | null
          school_id: string
          session_id: string
          start_date: string | null
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          id?: string
          is_current?: boolean
          name: Database["public"]["Enums"]["term_name"]
          resumption_date?: string | null
          school_id: string
          session_id: string
          start_date?: string | null
        }
        Update: {
          created_at?: string
          end_date?: string | null
          id?: string
          is_current?: boolean
          name?: Database["public"]["Enums"]["term_name"]
          resumption_date?: string | null
          school_id?: string
          session_id?: string
          start_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "terms_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terms_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "academic_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_school_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          school_id: string
          status: Database["public"]["Enums"]["member_status"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          school_id: string
          status?: Database["public"]["Enums"]["member_status"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          school_id?: string
          status?: Database["public"]["Enums"]["member_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_school_roles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      next_admission_no: { Args: { p_school: string }; Returns: string }
      next_staff_no: { Args: { p_school: string }; Returns: string }
      has_role: {
        Args: {
          p_roles: Database["public"]["Enums"]["app_role"][]
          p_school: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_member_of: { Args: { p_school: string }; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      is_school_admin: { Args: { p_school: string }; Returns: boolean }
      submit_census: { Args: { payload: Json }; Returns: string }
    }
    Enums: {
      app_role: "owner" | "admin" | "bursar" | "teacher" | "parent" | "student" | "prefect"
      attendance_status: "present" | "absent" | "late" | "excused"
      enrollment_status: "active" | "promoted" | "repeated" | "transferred"
      invoice_status: "draft" | "issued" | "part_paid" | "paid" | "void"
      member_status: "active" | "invited" | "suspended"
      payment_method: "bank_transfer" | "cash" | "pos" | "online"
      student_status: "active" | "graduated" | "withdrawn" | "suspended"
      term_name: "first" | "second" | "third"
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
      app_role: ["owner", "admin", "bursar", "teacher", "parent", "student", "prefect"],
      attendance_status: ["present", "absent", "late", "excused"],
      enrollment_status: ["active", "promoted", "repeated", "transferred"],
      invoice_status: ["draft", "issued", "part_paid", "paid", "void"],
      member_status: ["active", "invited", "suspended"],
      payment_method: ["bank_transfer", "cash", "pos", "online"],
      student_status: ["active", "graduated", "withdrawn", "suspended"],
      term_name: ["first", "second", "third"],
    },
  },
} as const

// -----------------------------------------------------------------------------
// Convenience aliases used across the app (Tables<> helper is defined above)
// -----------------------------------------------------------------------------
export type AppRole = Database['public']['Enums']['app_role']
export type MemberStatus = Database['public']['Enums']['member_status']
export type SchoolRow = Tables<'schools'>
export type UserSchoolRoleRow = Tables<'user_school_roles'>
export type ProfileRow = Tables<'profiles'>
export type StudentRow = Tables<'students'>
export type StaffRow = Tables<'staff'>
