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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      clearances: {
        Row: {
          component: string
          confirmed_at: string
          confirmed_by: string
          id: string
          semester_id: string
          student_id: string
        }
        Insert: {
          component: string
          confirmed_at: string
          confirmed_by: string
          id?: string
          semester_id: string
          student_id: string
        }
        Update: {
          component?: string
          confirmed_at?: string
          confirmed_by?: string
          id?: string
          semester_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clearances_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clearances_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clearances_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      council_memberships: {
        Row: {
          access_role: Database["public"]["Enums"]["council_access_role"]
          assigned_at: string
          assigned_by: string
          id: string
          position_label: string
          profile_id: string
          removed_at: string | null
          removed_by: string | null
        }
        Insert: {
          access_role: Database["public"]["Enums"]["council_access_role"]
          assigned_at: string
          assigned_by: string
          id?: string
          position_label: string
          profile_id: string
          removed_at?: string | null
          removed_by?: string | null
        }
        Update: {
          access_role?: Database["public"]["Enums"]["council_access_role"]
          assigned_at?: string
          assigned_by?: string
          id?: string
          position_label?: string
          profile_id?: string
          removed_at?: string | null
          removed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "council_memberships_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "council_memberships_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "council_memberships_removed_by_fkey"
            columns: ["removed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      demerits: {
        Row: {
          bucket: Database["public"]["Enums"]["bucket"]
          consequence_outcome: string | null
          created_at: string
          description: string
          event_attendance_id: string | null
          external_source_name: string | null
          id: string
          incident_group_id: string
          incident_on: string
          incident_unit_index: number
          issued_by: string
          misconduct_id: string | null
          semester_id: string
          source: string
          source_unit_index: number | null
          student_id: string
          waived_at: string | null
          waived_by: string | null
          waiver_reason: string | null
        }
        Insert: {
          bucket: Database["public"]["Enums"]["bucket"]
          consequence_outcome?: string | null
          created_at?: string
          description: string
          event_attendance_id?: string | null
          external_source_name?: string | null
          id?: string
          incident_group_id: string
          incident_on: string
          incident_unit_index: number
          issued_by: string
          misconduct_id?: string | null
          semester_id: string
          source: string
          source_unit_index?: number | null
          student_id: string
          waived_at?: string | null
          waived_by?: string | null
          waiver_reason?: string | null
        }
        Update: {
          bucket?: Database["public"]["Enums"]["bucket"]
          consequence_outcome?: string | null
          created_at?: string
          description?: string
          event_attendance_id?: string | null
          external_source_name?: string | null
          id?: string
          incident_group_id?: string
          incident_on?: string
          incident_unit_index?: number
          issued_by?: string
          misconduct_id?: string | null
          semester_id?: string
          source?: string
          source_unit_index?: number | null
          student_id?: string
          waived_at?: string | null
          waived_by?: string | null
          waiver_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "demerits_event_attendance_id_student_id_semester_id_fkey"
            columns: ["event_attendance_id", "student_id", "semester_id"]
            isOneToOne: false
            referencedRelation: "event_attendance"
            referencedColumns: ["id", "student_id", "semester_id"]
          },
          {
            foreignKeyName: "demerits_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demerits_misconduct_id_fkey"
            columns: ["misconduct_id"]
            isOneToOne: false
            referencedRelation: "misconduct_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demerits_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demerits_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demerits_waived_by_fkey"
            columns: ["waived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollments: {
        Row: {
          academic_status: Database["public"]["Enums"]["academic_status"]
          created_at: string
          id: string
          semester_id: string
          student_id: string
          updated_at: string
          year_level: number
        }
        Insert: {
          academic_status: Database["public"]["Enums"]["academic_status"]
          created_at?: string
          id?: string
          semester_id: string
          student_id: string
          updated_at: string
          year_level: number
        }
        Update: {
          academic_status?: Database["public"]["Enums"]["academic_status"]
          created_at?: string
          id?: string
          semester_id?: string
          student_id?: string
          updated_at?: string
          year_level?: number
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_attendance: {
        Row: {
          academic_status_snapshot: Database["public"]["Enums"]["academic_status"]
          created_at: string
          event_id: string
          id: string
          semester_id: string
          student_id: string
          time_in: string | null
          time_in_method: string | null
          time_in_recorded_by: string | null
          time_out: string | null
          time_out_method: string | null
          time_out_recorded_by: string | null
          updated_at: string
          year_level_snapshot: number
        }
        Insert: {
          academic_status_snapshot: Database["public"]["Enums"]["academic_status"]
          created_at?: string
          event_id: string
          id?: string
          semester_id: string
          student_id: string
          time_in?: string | null
          time_in_method?: string | null
          time_in_recorded_by?: string | null
          time_out?: string | null
          time_out_method?: string | null
          time_out_recorded_by?: string | null
          updated_at: string
          year_level_snapshot: number
        }
        Update: {
          academic_status_snapshot?: Database["public"]["Enums"]["academic_status"]
          created_at?: string
          event_id?: string
          id?: string
          semester_id?: string
          student_id?: string
          time_in?: string | null
          time_in_method?: string | null
          time_in_recorded_by?: string | null
          time_out?: string | null
          time_out_method?: string | null
          time_out_recorded_by?: string | null
          updated_at?: string
          year_level_snapshot?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_attendance_event_id_semester_id_fkey"
            columns: ["event_id", "semester_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id", "semester_id"]
          },
          {
            foreignKeyName: "event_attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_attendance_time_in_recorded_by_fkey"
            columns: ["time_in_recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_attendance_time_out_recorded_by_fkey"
            columns: ["time_out_recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_consequence_rules: {
        Row: {
          absence_demerit_days: number
          absence_fine_amount: number | null
          absence_fine_definition_id: string | null
          event_id: string
          id: string
          late_demerit_days: number
          late_fine_amount: number | null
          late_fine_definition_id: string | null
          requires_time_in: boolean
          requires_time_out: boolean
        }
        Insert: {
          absence_demerit_days: number
          absence_fine_amount?: number | null
          absence_fine_definition_id?: string | null
          event_id: string
          id?: string
          late_demerit_days: number
          late_fine_amount?: number | null
          late_fine_definition_id?: string | null
          requires_time_in: boolean
          requires_time_out: boolean
        }
        Update: {
          absence_demerit_days?: number
          absence_fine_amount?: number | null
          absence_fine_definition_id?: string | null
          event_id?: string
          id?: string
          late_demerit_days?: number
          late_fine_amount?: number | null
          late_fine_definition_id?: string | null
          requires_time_in?: boolean
          requires_time_out?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "event_consequence_rules_absence_fine_definition_id_fkey"
            columns: ["absence_fine_definition_id"]
            isOneToOne: false
            referencedRelation: "fine_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_consequence_rules_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_consequence_rules_late_fine_definition_id_fkey"
            columns: ["late_fine_definition_id"]
            isOneToOne: false
            referencedRelation: "fine_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      event_feedback: {
        Row: {
          event_id: string
          id: string
          responses: Json
          student_id: string
          submitted_at: string
        }
        Insert: {
          event_id: string
          id?: string
          responses: Json
          student_id: string
          submitted_at: string
        }
        Update: {
          event_id?: string
          id?: string
          responses?: Json
          student_id?: string
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_feedback_event_id_student_id_fkey"
            columns: ["event_id", "student_id"]
            isOneToOne: true
            referencedRelation: "event_attendance"
            referencedColumns: ["event_id", "student_id"]
          },
        ]
      }
      events: {
        Row: {
          academic_statuses: string[]
          archived_at: string | null
          attendance_locked_at: string | null
          audience_frozen_at: string | null
          consequence_bucket: Database["public"]["Enums"]["bucket"] | null
          created_at: string
          created_by: string
          ends_at: string
          id: string
          late_after_minutes: number
          name: string
          semester_id: string
          starts_at: string
          time_in_from: string | null
          time_in_until: string | null
          time_out_from: string | null
          time_out_until: string | null
          updated_at: string
          venue: string | null
          year_levels: number[]
        }
        Insert: {
          academic_statuses: string[]
          archived_at?: string | null
          attendance_locked_at?: string | null
          audience_frozen_at?: string | null
          consequence_bucket?: Database["public"]["Enums"]["bucket"] | null
          created_at?: string
          created_by: string
          ends_at: string
          id?: string
          late_after_minutes: number
          name: string
          semester_id: string
          starts_at: string
          time_in_from?: string | null
          time_in_until?: string | null
          time_out_from?: string | null
          time_out_until?: string | null
          updated_at: string
          venue?: string | null
          year_levels: number[]
        }
        Update: {
          academic_statuses?: string[]
          archived_at?: string | null
          attendance_locked_at?: string | null
          audience_frozen_at?: string | null
          consequence_bucket?: Database["public"]["Enums"]["bucket"] | null
          created_at?: string
          created_by?: string
          ends_at?: string
          id?: string
          late_after_minutes?: number
          name?: string
          semester_id?: string
          starts_at?: string
          time_in_from?: string | null
          time_in_until?: string | null
          time_out_from?: string | null
          time_out_until?: string | null
          updated_at?: string
          venue?: string | null
          year_levels?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_definitions: {
        Row: {
          amount: number
          archived_at: string | null
          created_at: string
          created_by: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          amount: number
          archived_at?: string | null
          created_at?: string
          created_by: string
          id?: string
          name: string
          updated_at: string
        }
        Update: {
          amount?: number
          archived_at?: string | null
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_definitions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_publications: {
        Row: {
          academic_statuses: string[]
          amount: number
          description: string
          fee_definition_id: string
          id: string
          published_at: string
          published_by: string
          request_key: string
          semester_id: string
          year_levels: number[]
        }
        Insert: {
          academic_statuses: string[]
          amount: number
          description: string
          fee_definition_id: string
          id?: string
          published_at: string
          published_by: string
          request_key: string
          semester_id: string
          year_levels: number[]
        }
        Update: {
          academic_statuses?: string[]
          amount?: number
          description?: string
          fee_definition_id?: string
          id?: string
          published_at?: string
          published_by?: string
          request_key?: string
          semester_id?: string
          year_levels?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "fee_publications_fee_definition_id_fkey"
            columns: ["fee_definition_id"]
            isOneToOne: false
            referencedRelation: "fee_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_publications_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_publications_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
        ]
      }
      files: {
        Row: {
          byte_size: number
          created_at: string
          id: string
          media_type: string
          purpose: string
          storage_key: string
          uploader_id: string
        }
        Insert: {
          byte_size: number
          created_at?: string
          id?: string
          media_type: string
          purpose: string
          storage_key: string
          uploader_id: string
        }
        Update: {
          byte_size?: number
          created_at?: string
          id?: string
          media_type?: string
          purpose?: string
          storage_key?: string
          uploader_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "files_uploader_id_fkey"
            columns: ["uploader_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fine_definitions: {
        Row: {
          amount: number
          archived_at: string | null
          created_at: string
          created_by: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          amount: number
          archived_at?: string | null
          created_at?: string
          created_by: string
          id?: string
          name: string
          updated_at: string
        }
        Update: {
          amount?: number
          archived_at?: string | null
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fine_definitions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          cancelled_at: string | null
          created_at: string
          created_by: string
          email: string
          expires_at: string
          id: string
          profile_id: string
          purpose: string
          status: string
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          cancelled_at?: string | null
          created_at?: string
          created_by: string
          email: string
          expires_at: string
          id?: string
          profile_id: string
          purpose: string
          status: string
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          cancelled_at?: string | null
          created_at?: string
          created_by?: string
          email?: string
          expires_at?: string
          id?: string
          profile_id?: string
          purpose?: string
          status?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      merit_applications: {
        Row: {
          application_group_id: string
          applied_at: string
          bucket: Database["public"]["Enums"]["bucket"]
          id: string
          merit_id: string
          student_id: string
        }
        Insert: {
          application_group_id: string
          applied_at: string
          bucket: Database["public"]["Enums"]["bucket"]
          id?: string
          merit_id: string
          student_id: string
        }
        Update: {
          application_group_id?: string
          applied_at?: string
          bucket?: Database["public"]["Enums"]["bucket"]
          id?: string
          merit_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "merit_applications_merit_id_student_id_fkey"
            columns: ["merit_id", "student_id"]
            isOneToOne: false
            referencedRelation: "merits"
            referencedColumns: ["id", "student_id"]
          },
        ]
      }
      merit_endorsements: {
        Row: {
          assigned_instructor_id: string
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          description: string
          id: string
          requested_days: number
          semester_id: string
          status: string
          student_id: string
          submitted_at: string
          submitted_by: string
        }
        Insert: {
          assigned_instructor_id: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          description: string
          id?: string
          requested_days: number
          semester_id: string
          status: string
          student_id: string
          submitted_at: string
          submitted_by: string
        }
        Update: {
          assigned_instructor_id?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          description?: string
          id?: string
          requested_days?: number
          semester_id?: string
          status?: string
          student_id?: string
          submitted_at?: string
          submitted_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "merit_endorsements_assigned_instructor_id_fkey"
            columns: ["assigned_instructor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merit_endorsements_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merit_endorsements_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merit_endorsements_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merit_endorsements_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      merits: {
        Row: {
          award_request_key: string | null
          award_unit_index: number | null
          awarded_by: string
          awarded_on: string
          created_at: string
          description: string
          endorsement_id: string | null
          endorsement_unit_index: number | null
          expires_on: string
          external_source_name: string | null
          id: string
          semester_id: string
          source: string
          student_id: string
        }
        Insert: {
          award_request_key?: string | null
          award_unit_index?: number | null
          awarded_by: string
          awarded_on: string
          created_at?: string
          description: string
          endorsement_id?: string | null
          endorsement_unit_index?: number | null
          expires_on: string
          external_source_name?: string | null
          id?: string
          semester_id: string
          source: string
          student_id: string
        }
        Update: {
          award_request_key?: string | null
          award_unit_index?: number | null
          awarded_by?: string
          awarded_on?: string
          created_at?: string
          description?: string
          endorsement_id?: string | null
          endorsement_unit_index?: number | null
          expires_on?: string
          external_source_name?: string | null
          id?: string
          semester_id?: string
          source?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "merits_awarded_by_fkey"
            columns: ["awarded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merits_endorsement_id_student_id_semester_id_fkey"
            columns: ["endorsement_id", "student_id", "semester_id"]
            isOneToOne: false
            referencedRelation: "merit_endorsements"
            referencedColumns: ["id", "student_id", "semester_id"]
          },
          {
            foreignKeyName: "merits_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merits_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      misconduct_catalog: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string
          id: string
          is_other: boolean
          label: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by: string
          id?: string
          is_other: boolean
          label: string
          updated_at: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string
          id?: string
          is_other?: boolean
          label?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "misconduct_catalog_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          kind: string
          message: string
          read_at: string | null
          recipient_id: string
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          message: string
          read_at?: string | null
          recipient_id: string
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          message?: string
          read_at?: string | null
          recipient_id?: string
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      obligations: {
        Row: {
          amount: number
          consequence_outcome: string | null
          created_at: string
          description: string
          event_attendance_id: string | null
          fee_definition_id: string | null
          fee_publication_id: string | null
          id: string
          kind: string
          semester_id: string
          student_id: string
          waived_at: string | null
          waived_by: string | null
          waiver_reason: string | null
        }
        Insert: {
          amount: number
          consequence_outcome?: string | null
          created_at?: string
          description: string
          event_attendance_id?: string | null
          fee_definition_id?: string | null
          fee_publication_id?: string | null
          id?: string
          kind: string
          semester_id: string
          student_id: string
          waived_at?: string | null
          waived_by?: string | null
          waiver_reason?: string | null
        }
        Update: {
          amount?: number
          consequence_outcome?: string | null
          created_at?: string
          description?: string
          event_attendance_id?: string | null
          fee_definition_id?: string | null
          fee_publication_id?: string | null
          id?: string
          kind?: string
          semester_id?: string
          student_id?: string
          waived_at?: string | null
          waived_by?: string | null
          waiver_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "obligations_event_attendance_id_student_id_semester_id_fkey"
            columns: ["event_attendance_id", "student_id", "semester_id"]
            isOneToOne: false
            referencedRelation: "event_attendance"
            referencedColumns: ["id", "student_id", "semester_id"]
          },
          {
            foreignKeyName: "obligations_fee_publication_id_fee_definition_id_semester__fkey"
            columns: ["fee_publication_id", "fee_definition_id", "semester_id"]
            isOneToOne: false
            referencedRelation: "fee_publications"
            referencedColumns: ["id", "fee_definition_id", "semester_id"]
          },
          {
            foreignKeyName: "obligations_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obligations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obligations_waived_by_fkey"
            columns: ["waived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_accounts: {
        Row: {
          account_name: string
          account_reference: string
          archived_at: string | null
          created_at: string
          created_by: string
          id: string
          instructions: string | null
          label: string
          qr_file_id: string | null
          updated_at: string
        }
        Insert: {
          account_name: string
          account_reference: string
          archived_at?: string | null
          created_at?: string
          created_by: string
          id?: string
          instructions?: string | null
          label: string
          qr_file_id?: string | null
          updated_at: string
        }
        Update: {
          account_name?: string
          account_reference?: string
          archived_at?: string | null
          created_at?: string
          created_by?: string
          id?: string
          instructions?: string | null
          label?: string
          qr_file_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_accounts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_accounts_qr_file_id_fkey"
            columns: ["qr_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_items: {
        Row: {
          amount: number
          id: string
          obligation_id: string
          payment_id: string
          semester_id: string
          student_id: string
        }
        Insert: {
          amount: number
          id?: string
          obligation_id: string
          payment_id: string
          semester_id: string
          student_id: string
        }
        Update: {
          amount?: number
          id?: string
          obligation_id?: string
          payment_id?: string
          semester_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_items_obligation_id_student_id_semester_id_fkey"
            columns: ["obligation_id", "student_id", "semester_id"]
            isOneToOne: false
            referencedRelation: "obligations"
            referencedColumns: ["id", "student_id", "semester_id"]
          },
          {
            foreignKeyName: "payment_items_payment_id_student_id_semester_id_fkey"
            columns: ["payment_id", "student_id", "semester_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id", "student_id", "semester_id"]
          },
        ]
      }
      payment_receipts: {
        Row: {
          created_at: string
          id: string
          received_at: string
          recognized_by: string
          request_key: string
        }
        Insert: {
          created_at?: string
          id?: string
          received_at: string
          recognized_by: string
          request_key: string
        }
        Update: {
          created_at?: string
          id?: string
          received_at?: string
          recognized_by?: string
          request_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_receipts_recognized_by_fkey"
            columns: ["recognized_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_refunds: {
        Row: {
          amount: number
          created_at: string
          id: string
          payment_id: string
          reason: string
          receipt_id: string
          recorded_by: string
          refunded_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          payment_id: string
          reason: string
          receipt_id: string
          recorded_by: string
          refunded_at: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          payment_id?: string
          reason?: string
          receipt_id?: string
          recorded_by?: string
          refunded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_refunds_payment_id_receipt_id_fkey"
            columns: ["payment_id", "receipt_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id", "receipt_id"]
          },
          {
            foreignKeyName: "payment_refunds_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: true
            referencedRelation: "payment_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_refunds_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          destination_account_name: string | null
          destination_account_reference: string | null
          destination_label: string | null
          id: string
          is_receipt_record: boolean
          method: string
          payment_account_id: string | null
          proof_file_id: string | null
          receipt_id: string | null
          record_status: string
          reference_number: string | null
          request_key: string
          semester_id: string
          status: string
          student_id: string
          submitted_at: string
          submitted_by: string
          supersedes_payment_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          destination_account_name?: string | null
          destination_account_reference?: string | null
          destination_label?: string | null
          id?: string
          is_receipt_record: boolean
          method: string
          payment_account_id?: string | null
          proof_file_id?: string | null
          receipt_id?: string | null
          record_status: string
          reference_number?: string | null
          request_key: string
          semester_id: string
          status: string
          student_id: string
          submitted_at: string
          submitted_by: string
          supersedes_payment_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          destination_account_name?: string | null
          destination_account_reference?: string | null
          destination_label?: string | null
          id?: string
          is_receipt_record?: boolean
          method?: string
          payment_account_id?: string | null
          proof_file_id?: string | null
          receipt_id?: string | null
          record_status?: string
          reference_number?: string | null
          request_key?: string
          semester_id?: string
          status?: string
          student_id?: string
          submitted_at?: string
          submitted_by?: string
          supersedes_payment_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_payment_account_id_fkey"
            columns: ["payment_account_id"]
            isOneToOne: false
            referencedRelation: "payment_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_proof_file_id_fkey"
            columns: ["proof_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "payment_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_supersedes_payment_id_receipt_id_student_id_semes_fkey"
            columns: [
              "supersedes_payment_id",
              "receipt_id",
              "student_id",
              "semester_id",
            ]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id", "receipt_id", "student_id", "semester_id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_status: string
          auth_user_id: string | null
          created_at: string
          email: string | null
          first_name: string
          id: string
          last_name: string
          middle_name: string | null
          suffix: string | null
          university_id: string | null
          updated_at: string
        }
        Insert: {
          account_status: string
          auth_user_id?: string | null
          created_at?: string
          email?: string | null
          first_name: string
          id?: string
          last_name: string
          middle_name?: string | null
          suffix?: string | null
          university_id?: string | null
          updated_at: string
        }
        Update: {
          account_status?: string
          auth_user_id?: string | null
          created_at?: string
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string
          middle_name?: string | null
          suffix?: string | null
          university_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      role_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string
          id: string
          profile_id: string
          removed_at: string | null
          removed_by: string | null
          role: string
        }
        Insert: {
          assigned_at: string
          assigned_by: string
          id?: string
          profile_id: string
          removed_at?: string | null
          removed_by?: string | null
          role: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string
          id?: string
          profile_id?: string
          removed_at?: string | null
          removed_by?: string | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_assignments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_assignments_removed_by_fkey"
            columns: ["removed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      roster_imports: {
        Row: {
          applied_at: string | null
          created_at: string
          created_by: string
          file_id: string
          id: string
          request_key: string
          semester_id: string
          status: string
          summary: Json | null
        }
        Insert: {
          applied_at?: string | null
          created_at?: string
          created_by: string
          file_id: string
          id?: string
          request_key: string
          semester_id: string
          status: string
          summary?: Json | null
        }
        Update: {
          applied_at?: string | null
          created_at?: string
          created_by?: string
          file_id?: string
          id?: string
          request_key?: string
          semester_id?: string
          status?: string
          summary?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "roster_imports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_imports_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_imports_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
        ]
      }
      semesters: {
        Row: {
          academic_year_start: number
          created_at: string
          created_by: string
          ends_on: string
          id: string
          is_current: boolean
          starts_on: string
          term: string
        }
        Insert: {
          academic_year_start: number
          created_at?: string
          created_by: string
          ends_on: string
          id?: string
          is_current: boolean
          starts_on: string
          term: string
        }
        Update: {
          academic_year_start?: number
          created_at?: string
          created_by?: string
          ends_on?: string
          id?: string
          is_current?: boolean
          starts_on?: string
          term?: string
        }
        Relationships: [
          {
            foreignKeyName: "semesters_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_credits: {
        Row: {
          bucket: Database["public"]["Enums"]["bucket"]
          id: string
          issued_at: string
          issued_by: string
          revocation_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          semester_id: string
          service_participant_id: string
          session_id: string
          student_id: string
        }
        Insert: {
          bucket: Database["public"]["Enums"]["bucket"]
          id?: string
          issued_at: string
          issued_by: string
          revocation_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          semester_id: string
          service_participant_id: string
          session_id: string
          student_id: string
        }
        Update: {
          bucket?: Database["public"]["Enums"]["bucket"]
          id?: string
          issued_at?: string
          issued_by?: string
          revocation_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          semester_id?: string
          service_participant_id?: string
          session_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_credits_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_credits_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_credits_service_participant_id_student_id_session__fkey"
            columns: [
              "service_participant_id",
              "student_id",
              "session_id",
              "semester_id",
              "bucket",
            ]
            isOneToOne: false
            referencedRelation: "service_participants"
            referencedColumns: [
              "id",
              "student_id",
              "session_id",
              "semester_id",
              "bucket",
            ]
          },
        ]
      }
      service_participants: {
        Row: {
          bucket: Database["public"]["Enums"]["bucket"]
          created_at: string
          excluded_at: string | null
          excluded_by: string | null
          id: string
          recorded_by: string | null
          semester_id: string
          session_id: string
          student_id: string
          time_in: string | null
          time_out: string | null
          updated_at: string
        }
        Insert: {
          bucket: Database["public"]["Enums"]["bucket"]
          created_at?: string
          excluded_at?: string | null
          excluded_by?: string | null
          id?: string
          recorded_by?: string | null
          semester_id: string
          session_id: string
          student_id: string
          time_in?: string | null
          time_out?: string | null
          updated_at: string
        }
        Update: {
          bucket?: Database["public"]["Enums"]["bucket"]
          created_at?: string
          excluded_at?: string | null
          excluded_by?: string | null
          id?: string
          recorded_by?: string | null
          semester_id?: string
          session_id?: string
          student_id?: string
          time_in?: string | null
          time_out?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_participants_excluded_by_fkey"
            columns: ["excluded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_participants_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_participants_session_id_semester_id_bucket_fkey"
            columns: ["session_id", "semester_id", "bucket"]
            isOneToOne: false
            referencedRelation: "service_sessions"
            referencedColumns: ["id", "semester_id", "bucket"]
          },
          {
            foreignKeyName: "service_participants_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_sessions: {
        Row: {
          bucket: Database["public"]["Enums"]["bucket"]
          created_at: string
          created_by: string
          duty_on: string
          ended_at: string | null
          ended_by: string | null
          id: string
          late_after_minutes: number
          location: string | null
          scheduled_end: string
          scheduled_start: string
          semester_id: string
          time_in_from: string
          time_in_until: string
          time_out_from: string
          time_out_until: string
          updated_at: string
        }
        Insert: {
          bucket: Database["public"]["Enums"]["bucket"]
          created_at?: string
          created_by: string
          duty_on: string
          ended_at?: string | null
          ended_by?: string | null
          id?: string
          late_after_minutes: number
          location?: string | null
          scheduled_end: string
          scheduled_start: string
          semester_id: string
          time_in_from: string
          time_in_until: string
          time_out_from: string
          time_out_until: string
          updated_at: string
        }
        Update: {
          bucket?: Database["public"]["Enums"]["bucket"]
          created_at?: string
          created_by?: string
          duty_on?: string
          ended_at?: string | null
          ended_by?: string | null
          id?: string
          late_after_minutes?: number
          location?: string | null
          scheduled_end?: string
          scheduled_start?: string
          semester_id?: string
          time_in_from?: string
          time_in_until?: string
          time_out_from?: string
          time_out_until?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_sessions_ended_by_fkey"
            columns: ["ended_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_sessions_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invitation: {
        Args: { p_auth_user_id: string; p_token_hash: string }
        Returns: Json
      }
      apply_merits: {
        Args: {
          p_actor: string
          p_bucket: Database["public"]["Enums"]["bucket"]
          p_days: number
          p_key: string
        }
        Returns: Json
      }
      archive_faculty: {
        Args: { p_actor: string; p_key: string; p_profile: string }
        Returns: Json
      }
      archive_misconduct_option: {
        Args: { p_actor: string; p_key: string; p_option: string }
        Returns: Json
      }
      award_merits: {
        Args: {
          p_actor: string
          p_awarded_on: string
          p_days: number
          p_description: string
          p_external_source?: string
          p_key: string
          p_student: string
        }
        Returns: Json
      }
      cancel_invitation: {
        Args: { p_actor: string; p_invitation: string; p_key: string }
        Returns: Json
      }
      capture_event_attendance: {
        Args: {
          p_actor: string
          p_event: string
          p_key: string
          p_method: string
          p_rows: Json
        }
        Returns: Json
      }
      change_faculty_assignments: {
        Args: {
          p_actor: string
          p_coordinator: boolean
          p_instructor_role: string
          p_key: string
          p_profile: string
        }
        Returns: Json
      }
      check_invitation: { Args: { p_token_hash: string }; Returns: Json }
      confirm_clearance: {
        Args: {
          p_actor: string
          p_component: string
          p_key: string
          p_semester: string
          p_student: string
        }
        Returns: Json
      }
      correct_payment: {
        Args: {
          p_actor: string
          p_key: string
          p_obligations: string[]
          p_payment: string
          p_reason: string
        }
        Returns: Json
      }
      council_add_member: {
        Args: {
          p_actor: string
          p_key: string
          p_label: string
          p_role: string
          p_university_id: string
        }
        Returns: Json
      }
      council_change_member: {
        Args: {
          p_actor: string
          p_key: string
          p_label: string
          p_membership: string
          p_role: string
        }
        Returns: Json
      }
      council_remove_member: {
        Args: { p_actor: string; p_key: string; p_membership: string }
        Returns: Json
      }
      create_service_session: {
        Args: {
          p_actor: string
          p_bucket: Database["public"]["Enums"]["bucket"]
          p_duty_on: string
          p_end: string
          p_key: string
          p_late_after_minutes: number
          p_location: string
          p_start: string
          p_time_in_from: string
          p_time_in_until: string
          p_time_out_from: string
          p_time_out_until: string
        }
        Returns: Json
      }
      decide_merit_endorsement: {
        Args: {
          p_actor: string
          p_decision: string
          p_endorsement: string
          p_key: string
          p_reason?: string
        }
        Returns: Json
      }
      end_service_session: {
        Args: { p_actor: string; p_key: string; p_session: string }
        Returns: Json
      }
      endorse_merit: {
        Args: {
          p_actor: string
          p_days: number
          p_description: string
          p_instructor: string
          p_key: string
          p_student: string
        }
        Returns: Json
      }
      f_cmd_actor: { Args: { p_actor: string }; Returns: undefined }
      f_cmd_archive_blockers: { Args: { p_profile: string }; Returns: Json }
      f_cmd_balance: {
        Args: {
          p_bucket: Database["public"]["Enums"]["bucket"]
          p_student: string
        }
        Returns: number
      }
      f_cmd_balance_key: {
        Args: {
          p_bucket: Database["public"]["Enums"]["bucket"]
          p_student: string
        }
        Returns: number
      }
      f_cmd_begin: {
        Args: {
          p_actor: string
          p_command: string
          p_key: string
          p_payload: Json
        }
        Returns: Json
      }
      f_cmd_check_items: {
        Args: { p_payable: boolean; p_payment: string }
        Returns: string[]
      }
      f_cmd_close_pending_invitation: {
        Args: { p_profile: string }
        Returns: boolean
      }
      f_cmd_council: {
        Args: { p_actor: string; p_capture?: boolean; p_executive?: boolean }
        Returns: undefined
      }
      f_cmd_council_notice: {
        Args: { p_message: string; p_student: string }
        Returns: undefined
      }
      f_cmd_council_role: {
        Args: { p_label: string; p_role: string }
        Returns: undefined
      }
      f_cmd_council_target: {
        Args: { p_membership: string }
        Returns: {
          access_role: Database["public"]["Enums"]["council_access_role"]
          assigned_at: string
          assigned_by: string
          id: string
          position_label: string
          profile_id: string
          removed_at: string | null
          removed_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "council_memberships"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      f_cmd_current_semester: { Args: never; Returns: string }
      f_cmd_email: { Args: { p_email: string }; Returns: string }
      f_cmd_email_free: {
        Args: { p_email: string; p_except: string }
        Returns: undefined
      }
      f_cmd_event_closes: {
        Args: { e: Database["public"]["Tables"]["events"]["Row"] }
        Returns: string
      }
      f_cmd_event_outcome: {
        Args: {
          e: Database["public"]["Tables"]["events"]["Row"]
          p_time_in: string
          p_time_out: string
          r: Database["public"]["Tables"]["event_consequence_rules"]["Row"]
        }
        Returns: string
      }
      f_cmd_faculty_target: {
        Args: { p_profile: string }
        Returns: {
          account_status: string
          auth_user_id: string | null
          created_at: string
          email: string | null
          first_name: string
          id: string
          last_name: string
          middle_name: string | null
          suffix: string | null
          university_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      f_cmd_finish: { Args: { p_key: string; p_result: Json }; Returns: Json }
      f_cmd_freeze_event: { Args: { p_event: string }; Returns: undefined }
      f_cmd_instructor: {
        Args: {
          p_actor: string
          p_bucket?: Database["public"]["Enums"]["bucket"]
        }
        Returns: undefined
      }
      f_cmd_item_total: {
        Args: {
          p_except?: string
          p_ids: string[]
          p_payable: boolean
          p_semester: string
          p_student: string
        }
        Returns: number
      }
      f_cmd_lock_obligations: { Args: { p_ids: string[] }; Returns: undefined }
      f_cmd_misconduct_label: { Args: { p_label: string }; Returns: string }
      f_cmd_names: {
        Args: {
          p_first: string
          p_last: string
          p_middle: string
          p_suffix: string
        }
        Returns: Json
      }
      f_cmd_notice: {
        Args: { p_kind: string; p_student: string }
        Returns: undefined
      }
      f_cmd_platform_admin: { Args: { p_actor: string }; Returns: undefined }
      f_cmd_record_attendance: {
        Args: {
          p_actor: string
          p_event: string
          p_kind: string
          p_method: string
          p_student: string
        }
        Returns: string
      }
      f_cmd_role: {
        Args: { p_actor: string; p_role: string }
        Returns: boolean
      }
      f_cmd_roster_enrollment: {
        Args: { p_status: string; p_year: number }
        Returns: undefined
      }
      f_cmd_roster_identity: {
        Args: {
          p_email: string
          p_first: string
          p_last: string
          p_middle: string
          p_suffix: string
        }
        Returns: Json
      }
      f_cmd_settled: {
        Args: { p_except?: string; p_obligation: string }
        Returns: boolean
      }
      f_cmd_student: {
        Args: { p_semester: string; p_student: string }
        Returns: undefined
      }
      f_cmd_student_target: {
        Args: { p_profile: string }
        Returns: {
          account_status: string
          auth_user_id: string | null
          created_at: string
          email: string | null
          first_name: string
          id: string
          last_name: string
          middle_name: string | null
          suffix: string | null
          university_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      f_cmd_timezone: { Args: never; Returns: string }
      f_cmd_token: {
        Args: { p_expires_at: string; p_token_hash: string }
        Returns: undefined
      }
      faculty_archive_preview: {
        Args: { p_actor: string; p_profile: string }
        Returns: Json
      }
      file_download_key: {
        Args: { p_actor: string; p_file: string }
        Returns: {
          media_type: string
          purpose: string
          storage_key: string
        }[]
      }
      florence_attendance_lookup: {
        Args: { p_event: string; p_limit?: number; p_query: string }
        Returns: {
          academic_status: Database["public"]["Enums"]["academic_status"]
          first_name: string
          last_name: string
          student_id: string
          university_id: string
          year_level: number
        }[]
      }
      florence_council_candidate: {
        Args: { p_university_id: string }
        Returns: {
          academic_status: Database["public"]["Enums"]["academic_status"]
          account_linked: boolean
          account_status: string
          council_role: Database["public"]["Enums"]["council_access_role"]
          enrollment_is_current: boolean
          enrollment_term: string
          enrollment_year_start: number
          first_name: string
          id: string
          last_name: string
          middle_name: string
          position_label: string
          suffix: string
          university_id: string
          year_level: number
        }[]
      }
      florence_council_members: {
        Args: never
        Returns: {
          access_role: Database["public"]["Enums"]["council_access_role"]
          account_status: string
          assigned_at: string
          assigned_by_name: string
          first_name: string
          last_name: string
          membership_id: string
          middle_name: string
          position_label: string
          profile_id: string
          suffix: string
          university_id: string
        }[]
      }
      florence_event_attendance: {
        Args: { p_event: string }
        Returns: {
          academic_status: Database["public"]["Enums"]["academic_status"]
          first_name: string
          last_name: string
          status: string
          student_id: string
          time_in: string
          time_in_method: string
          time_in_recorded_by: string
          time_out: string
          time_out_method: string
          time_out_recorded_by: string
          university_id: string
          year_level: number
        }[]
      }
      florence_event_consequence_preview: {
        Args: { p_event: string }
        Returns: {
          academic_status: Database["public"]["Enums"]["academic_status"]
          demerit_days: number
          fine_amount: number
          first_name: string
          last_name: string
          outcome: string
          student_id: string
          time_in: string
          time_out: string
          university_id: string
          year_level: number
        }[]
      }
      florence_event_feedback: {
        Args: { p_event: string }
        Returns: {
          first_name: string
          last_name: string
          responses: Json
          student_id: string
          submitted_at: string
          university_id: string
        }[]
      }
      florence_executive_candidate: {
        Args: { p_university_id: string }
        Returns: {
          academic_status: Database["public"]["Enums"]["academic_status"]
          account_status: string
          council_role: Database["public"]["Enums"]["council_access_role"]
          enrollment_is_current: boolean
          enrollment_term: string
          enrollment_year_start: number
          first_name: string
          id: string
          last_name: string
          middle_name: string
          position_label: string
          suffix: string
          university_id: string
          year_level: number
        }[]
      }
      florence_fee_definitions: {
        Args: never
        Returns: {
          amount: number
          archived_at: string
          created_at: string
          created_by: string
          creator_name: string
          id: string
          name: string
          updated_at: string
        }[]
      }
      florence_fine_definitions: {
        Args: never
        Returns: {
          amount: number
          archived_at: string
          created_at: string
          created_by: string
          creator_name: string
          id: string
          name: string
          updated_at: string
        }[]
      }
      florence_instructor_choices: {
        Args: never
        Returns: {
          first_name: string
          id: string
          instructor_role: string
          last_name: string
        }[]
      }
      florence_invitation_statuses: {
        Args: { p_profile: string }
        Returns: {
          accepted_at: string
          cancelled_at: string
          created_at: string
          email: string
          expires_at: string
          id: string
          status: string
        }[]
      }
      florence_my_events: {
        Args: { p_semester: string }
        Returns: {
          attendance_locked_at: string
          consequence_bucket: Database["public"]["Enums"]["bucket"]
          demerit_days: number
          event_id: string
          feedback_closes_at: string
          feedback_eligible: boolean
          feedback_opens_at: string
          feedback_submitted_at: string
          fine_amount: number
          fine_waived: boolean
          late_after_minutes: number
          name: string
          status: string
          time_in: string
          time_in_from: string
          time_in_until: string
          time_out: string
          time_out_from: string
          time_out_until: string
          venue: string
        }[]
      }
      florence_provisioning_accounts: {
        Args: never
        Returns: {
          account_linked: boolean
          account_status: string
          council_role: Database["public"]["Enums"]["council_access_role"]
          email: string
          first_name: string
          id: string
          invitation_expires_at: string
          invitation_state: string
          last_name: string
          middle_name: string
          pending_invitation_id: string
          position_label: string
          roles: string[]
          suffix: string
          university_id: string
        }[]
      }
      florence_provisioning_directory: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          account_status: string
          email: string
          first_name: string
          id: string
          last_name: string
          university_id: string
        }[]
      }
      florence_roster: {
        Args: { p_semester: string }
        Returns: {
          academic_status: Database["public"]["Enums"]["academic_status"]
          account_status: string
          email: string
          enrollment_id: string
          first_name: string
          has_account: boolean
          invitation_expires_at: string
          invitation_state: string
          last_name: string
          middle_name: string
          pending_invitation_id: string
          semester_id: string
          student_id: string
          suffix: string
          university_id: string
          year_level: number
        }[]
      }
      florence_roster_candidate: {
        Args: { p_university_id: string }
        Returns: {
          account_status: string
          email: string
          enrolled_in_current: boolean
          first_name: string
          id: string
          last_name: string
          middle_name: string
          suffix: string
          university_id: string
        }[]
      }
      florence_student_directory: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          first_name: string
          id: string
          last_name: string
          middle_name: string
          suffix: string
          university_id: string
        }[]
      }
      freeze_event: {
        Args: { p_actor: string; p_event: string; p_key: string }
        Returns: Json
      }
      generate_event_consequences: {
        Args: {
          p_actor: string
          p_bucket: Database["public"]["Enums"]["bucket"]
          p_event: string
          p_key: string
        }
        Returns: Json
      }
      grant_executive: {
        Args: {
          p_actor: string
          p_key: string
          p_label: string
          p_university_id: string
        }
        Returns: Json
      }
      import_event_attendance: {
        Args: {
          p_actor: string
          p_apply: boolean
          p_event: string
          p_key: string
          p_rows: Json
        }
        Returns: Json
      }
      log_demerits: {
        Args: {
          p_actor: string
          p_bucket: Database["public"]["Enums"]["bucket"]
          p_days: number
          p_description: string
          p_external_source?: string
          p_incident_on: string
          p_key: string
          p_misconduct: string
          p_student: string
        }
        Returns: Json
      }
      prepare_event_capture: {
        Args: { p_actor: string; p_event: string }
        Returns: Json
      }
      provision_faculty: {
        Args: {
          p_actor: string
          p_coordinator: boolean
          p_email: string
          p_expires_at: string
          p_first_name: string
          p_instructor_role: string
          p_key: string
          p_last_name: string
          p_middle_name: string
          p_suffix: string
          p_token_hash: string
        }
        Returns: Json
      }
      publish_fee_obligations: {
        Args: {
          p_academic_statuses: string[]
          p_actor: string
          p_fee: string
          p_key: string
          p_semester: string
          p_year_levels: number[]
        }
        Returns: Json
      }
      record_cash_payment: {
        Args: {
          p_actor: string
          p_key: string
          p_obligations: string[]
          p_received_at: string
          p_semester: string
          p_student: string
        }
        Returns: Json
      }
      record_event_attendance: {
        Args: {
          p_actor: string
          p_event: string
          p_key: string
          p_kind: string
          p_student: string
        }
        Returns: Json
      }
      record_event_attendance_qr: {
        Args: {
          p_actor: string
          p_event: string
          p_key: string
          p_kind: string
          p_university_id: string
        }
        Returns: Json
      }
      record_refund: {
        Args: {
          p_actor: string
          p_facts_confirmed: boolean
          p_key: string
          p_reason: string
          p_receipt: string
          p_refunded_at: string
        }
        Returns: Json
      }
      register_file: {
        Args: {
          p_actor: string
          p_byte_size: number
          p_key: string
          p_media_type: string
          p_purpose: string
          p_storage_key: string
        }
        Returns: Json
      }
      reissue_invitation: {
        Args: {
          p_actor: string
          p_expires_at: string
          p_key: string
          p_profile: string
          p_token_hash: string
        }
        Returns: Json
      }
      remove_executive: {
        Args: { p_actor: string; p_key: string; p_profile: string }
        Returns: Json
      }
      replace_executive: {
        Args: {
          p_access_role: string
          p_actor: string
          p_key: string
          p_label: string
          p_profile: string
        }
        Returns: Json
      }
      revoke_service_credit: {
        Args: {
          p_actor: string
          p_credit: string
          p_key: string
          p_reason: string
        }
        Returns: Json
      }
      roster_add_student: {
        Args: {
          p_academic_status: string
          p_actor: string
          p_email: string
          p_first_name: string
          p_key: string
          p_last_name: string
          p_middle_name: string
          p_suffix: string
          p_university_id: string
          p_year_level: number
        }
        Returns: Json
      }
      roster_cancel_invitation: {
        Args: { p_actor: string; p_invitation: string; p_key: string }
        Returns: Json
      }
      roster_invite_student: {
        Args: {
          p_actor: string
          p_expires_at: string
          p_key: string
          p_student: string
          p_token_hash: string
        }
        Returns: Json
      }
      roster_update_student: {
        Args: {
          p_academic_status: string
          p_actor: string
          p_email: string
          p_first_name: string
          p_key: string
          p_last_name: string
          p_middle_name: string
          p_student: string
          p_suffix: string
          p_year_level: number
        }
        Returns: Json
      }
      save_event: {
        Args: {
          p_absence_demerit_days: number
          p_absence_fine: string
          p_academic_statuses: string[]
          p_actor: string
          p_ends_at: string
          p_event: string
          p_late_after_minutes: number
          p_late_demerit_days: number
          p_late_fine: string
          p_name: string
          p_requires_time_out: boolean
          p_semester: string
          p_starts_at: string
          p_time_in_from: string
          p_time_in_until: string
          p_time_out_from: string
          p_time_out_until: string
          p_venue: string
          p_year_levels: number[]
        }
        Returns: string
      }
      save_misconduct_option: {
        Args: {
          p_actor: string
          p_key: string
          p_label: string
          p_option: string
        }
        Returns: Json
      }
      set_service_participants: {
        Args: {
          p_actor: string
          p_key: string
          p_rows: Json
          p_session: string
        }
        Returns: Json
      }
      submit_event_feedback: {
        Args: {
          p_actor: string
          p_event: string
          p_key: string
          p_responses: Json
        }
        Returns: Json
      }
      update_faculty_identity: {
        Args: {
          p_actor: string
          p_email: string
          p_first_name: string
          p_key: string
          p_last_name: string
          p_middle_name: string
          p_profile: string
          p_suffix: string
        }
        Returns: Json
      }
      verify_payment: {
        Args: {
          p_actor: string
          p_existing_receipt: string
          p_facts_confirmed: boolean
          p_key: string
          p_mode: string
          p_payment: string
          p_reason: string
          p_received_at: string
          p_refunded_at: string
        }
        Returns: Json
      }
      waive_demerit: {
        Args: {
          p_actor: string
          p_demerit: string
          p_key: string
          p_reason: string
        }
        Returns: Json
      }
      waive_obligation: {
        Args: {
          p_actor: string
          p_key: string
          p_obligation: string
          p_reason: string
        }
        Returns: Json
      }
    }
    Enums: {
      academic_status: "regular" | "irregular"
      bucket: "office" | "rle"
      council_access_role: "executive" | "operations" | "representative"
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
      academic_status: ["regular", "irregular"],
      bucket: ["office", "rle"],
      council_access_role: ["executive", "operations", "representative"],
    },
  },
} as const
