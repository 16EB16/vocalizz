export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      voice_models: {
        Row: {
          audio_duration_seconds: number | null
          created_at: string
          file_count: number
          id: string
          name: string
          quality: string
          status: string
          user_id: string
          poch_value: number // POCH quality value
          is_premium_model: boolean // Flag if model used premium features
          external_job_id: string | null // New: ID from external AI service (e.g., Replicate)
          feedback_rating: number | null // New: 1 (down) or 5 (up) for quick feedback
          error_message: string | null // New: Detailed error message on failure
          score_qualite_source: number | null // New: 0-100 score from AI analysis
          cleaning_applied: boolean // New: True if premium cleaning was requested
          cost_in_credits: number // NEW: Cost of the training job in credits
        }
        Insert: {
          audio_duration_seconds?: number | null
          created_at?: string
          file_count: number
          id?: string
          name: string
          quality: string
          status?: string
          user_id: string
          poch_value: number
          is_premium_model?: boolean
          external_job_id?: string | null
          feedback_rating?: number | null
          error_message?: string | null
          score_qualite_source?: number | null
          cleaning_applied?: boolean
          cost_in_credits?: number // NEW
        }
        Update: {
          audio_duration_seconds?: number | null
          created_at?: string
          file_count?: number
          id?: string
          name?: string
          quality?: string
          status?: string
          user_id?: string
          poch_value?: number
          is_premium_model?: boolean
          external_job_id?: string | null
          feedback_rating?: number | null
          error_message?: string | null
          score_qualite_source?: number | null
          cleaning_applied?: boolean
          cost_in_credits?: number // NEW
        }
        Relationships: [
          {
            foreignKeyName: "voice_models_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: { // Renamed from user_profiles
        Row: {
          id: string
          role: "free" | "pro" | "studio" // UPDATED: New roles
          created_at: string
          stripe_customer_id: string | null // New: Stripe Customer ID
          first_name: string | null // Added
          last_name: string | null // Added
          active_trainings: number // NEW: Counter for simultaneous trainings
          credits: number // NEW: User's credit balance
        }
        Insert: {
          id: string
          role?: "free" | "pro" | "studio"
          created_at?: string
          stripe_customer_id?: string | null
          first_name?: string | null // Added
          last_name?: string | null // Added
          active_trainings?: number // NEW
          credits?: number // NEW
        }
        Update: {
          id?: string
          role?: "free" | "pro" | "studio"
          created_at?: string
          stripe_customer_id?: string | null
          first_name?: string | null // Added
          last_name?: string | null // Added
          active_trainings?: number // NEW
          credits?: number // NEW
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      user_role: "free" | "pro" | "studio" // NEW ENUM
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends keyof PublicSchema["Tables"] | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends keyof PublicSchema["Tables"] | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends keyof PublicSchema["Enums"] | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never