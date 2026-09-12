export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// NOTE: this file is normally auto-generated from the live Supabase schema.
// The tables/columns below marked "manually added" reflect
// supabase/migrations/0001_translation_pipeline_and_hardening.sql, which has
// not been applied to the live project yet (see that file's header). Once
// applied, regenerate this file from Supabase and this block can be removed.
export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      book_chunks: {
        Row: {
          book_id: string
          chunk_index: number
          content: string
          language: string
          // manually added (migration 0001)
          status: string
          source_version: number
          job_id: string | null
          model: string | null
          prompt_version: string | null
          updated_at: string
          // manually added (migration 0003)
          provider: string | null
        }
        Insert: {
          book_id: string
          chunk_index: number
          content: string
          language: string
          status?: string
          source_version?: number
          job_id?: string | null
          model?: string | null
          prompt_version?: string | null
          updated_at?: string
          provider?: string | null
        }
        Update: {
          book_id?: string
          chunk_index?: number
          content?: string
          language?: string
          status?: string
          source_version?: number
          job_id?: string | null
          model?: string | null
          prompt_version?: string | null
          updated_at?: string
          provider?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "book_chunks_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      // manually added (migration 0001)
      book_translation_jobs: {
        Row: {
          id: string
          book_id: string
          language: string
          source_version: number
          status: string
          model: string | null
          prompt_version: string
          total_sections: number
          completed_sections: number
          failed_sections: number
          attempts: number
          last_error: string | null
          next_attempt_at: string | null
          requested_by: string | null
          human_reviewed: boolean
          reviewed_by: string | null
          reviewed_at: string | null
          created_at: string
          updated_at: string
          // manually added (migration 0003)
          provider: string
          total_prompt_tokens: number
          total_output_tokens: number
        }
        Insert: {
          id?: string
          book_id: string
          language: string
          source_version?: number
          status?: string
          model?: string | null
          prompt_version?: string
          total_sections?: number
          completed_sections?: number
          failed_sections?: number
          attempts?: number
          last_error?: string | null
          next_attempt_at?: string | null
          requested_by?: string | null
          human_reviewed?: boolean
          reviewed_by?: string | null
          reviewed_at?: string | null
          created_at?: string
          updated_at?: string
          provider?: string
          total_prompt_tokens?: number
          total_output_tokens?: number
        }
        Update: {
          id?: string
          book_id?: string
          language?: string
          source_version?: number
          status?: string
          model?: string | null
          prompt_version?: string
          total_sections?: number
          completed_sections?: number
          failed_sections?: number
          attempts?: number
          last_error?: string | null
          next_attempt_at?: string | null
          requested_by?: string | null
          human_reviewed?: boolean
          reviewed_by?: string | null
          reviewed_at?: string | null
          created_at?: string
          updated_at?: string
          provider?: string
          total_prompt_tokens?: number
          total_output_tokens?: number
        }
        Relationships: [
          {
            foreignKeyName: "book_translation_jobs_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      // manually added (migration 0001)
      book_translation_sections: {
        Row: {
          id: string
          job_id: string
          chunk_index: number
          status: string
          attempts: number
          last_error: string | null
          next_attempt_at: string | null
          updated_at: string
          // manually added (migration 0003)
          prompt_tokens: number | null
          output_tokens: number | null
        }
        Insert: {
          id?: string
          job_id: string
          chunk_index: number
          status?: string
          attempts?: number
          last_error?: string | null
          next_attempt_at?: string | null
          updated_at?: string
          prompt_tokens?: number | null
          output_tokens?: number | null
        }
        Update: {
          id?: string
          job_id?: string
          chunk_index?: number
          status?: string
          attempts?: number
          last_error?: string | null
          next_attempt_at?: string | null
          updated_at?: string
          prompt_tokens?: number | null
          output_tokens?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "book_translation_sections_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "book_translation_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      // manually added (migration 0001)
      book_translation_guides: {
        Row: {
          book_id: string
          voice_and_register: string | null
          character_notes: string | null
          terminology: Json
          setting_context: string | null
          target_conventions: string | null
          tone_instructions: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          book_id: string
          voice_and_register?: string | null
          character_notes?: string | null
          terminology?: Json
          setting_context?: string | null
          target_conventions?: string | null
          tone_instructions?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          book_id?: string
          voice_and_register?: string | null
          character_notes?: string | null
          terminology?: Json
          setting_context?: string | null
          target_conventions?: string | null
          tone_instructions?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "book_translation_guides_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: true
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      // manually added (migration 0001)
      author_profiles: {
        Row: {
          user_id: string
          pen_name: string | null
          bio: string | null
          avatar_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          pen_name?: string | null
          bio?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          pen_name?: string | null
          bio?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      // manually added (migration 0001)
      translation_reports: {
        Row: {
          id: string
          book_id: string
          language: string
          chunk_index: number
          reporter_id: string
          reason: string
          status: string
          created_at: string
        }
        Insert: {
          id?: string
          book_id: string
          language: string
          chunk_index: number
          reporter_id: string
          reason: string
          status?: string
          created_at?: string
        }
        Update: {
          id?: string
          book_id?: string
          language?: string
          chunk_index?: number
          reporter_id?: string
          reason?: string
          status?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "translation_reports_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      book_highlights: {
        Row: {
          book_id: string
          chunk_index: number
          created_at: string
          highlight_text: string
          id: string
          language: string
          user_id: string
          note: string | null
        }
        Insert: {
          book_id: string
          chunk_index: number
          created_at?: string
          highlight_text: string
          id?: string
          language: string
          user_id: string
          note?: string | null
        }
        Update: {
          book_id?: string
          chunk_index?: number
          created_at?: string
          highlight_text?: string
          id?: string
          language?: string
          user_id?: string
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "book_highlights_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      book_shelves: {
        Row: {
          book_id: string
          created_at: string
          id: string
          shelf: string
          updated_at: string
          user_id: string
        }
        Insert: {
          book_id: string
          created_at?: string
          id?: string
          shelf: string
          updated_at?: string
          user_id: string
        }
        Update: {
          book_id?: string
          created_at?: string
          id?: string
          shelf?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_shelves_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      books: {
        Row: {
          access_type: string
          author: string
          author_id: string | null
          available_languages: string[]
          cover_url: string | null
          created_at: string
          description: string
          genre: string
          id: string
          source_language: string
          status: string
          subscription_price_usd: number | null
          title: string
          total_chunks: number
          source_version: number
        }
        Insert: {
          access_type?: string
          author: string
          author_id?: string | null
          available_languages?: string[]
          cover_url?: string | null
          created_at?: string
          description?: string
          genre?: string
          id?: string
          source_language?: string
          status?: string
          subscription_price_usd?: number | null
          title: string
          total_chunks?: number
          source_version?: number
        }
        Update: {
          access_type?: string
          author?: string
          author_id?: string | null
          available_languages?: string[]
          cover_url?: string | null
          created_at?: string
          description?: string
          genre?: string
          id?: string
          source_language?: string
          status?: string
          subscription_price_usd?: number | null
          title?: string
          total_chunks?: number
          source_version?: number
        }
        Relationships: []
      }
      reading_progress: {
        Row: {
          book_id: string
          language: string
          last_chunk_index: number
          updated_at: string
          user_id: string
        }
        Insert: {
          book_id: string
          language: string
          last_chunk_index?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          book_id?: string
          language?: string
          last_chunk_index?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reading_progress_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      user_subscriptions: {
        Row: {
          book_id: string
          created_at: string
          expires_at: string | null
          id: string
          monthly_price_usd: number
          renewed_at: string | null
          starts_at: string
          status: string
          user_id: string
        }
        Insert: {
          book_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          monthly_price_usd?: number
          renewed_at?: string | null
          starts_at?: string
          status?: string
          user_id: string
        }
        Update: {
          book_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          monthly_price_usd?: number
          renewed_at?: string | null
          starts_at?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_subscriptions_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
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
      [_ in never]: never
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
    Enums: {},
  },
} as const
