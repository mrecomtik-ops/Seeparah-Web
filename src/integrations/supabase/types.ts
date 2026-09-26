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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      admin_action_events: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          target_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          target_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          target_id?: string | null
        }
        Relationships: []
      }
      admin_users: {
        Row: {
          granted_at: string
          granted_by: string | null
          revoked_at: string | null
          revoked_by: string | null
          role: string
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          role: string
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: string | null
          after: Json | null
          before: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          reason: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          reason?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          reason?: string | null
        }
        Relationships: []
      }
      author_profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          pen_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          pen_name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          pen_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      book_chunks: {
        Row: {
          book_id: string
          chunk_index: number
          content: string
          job_id: string | null
          language: string
          model: string | null
          pending_content: string | null
          pending_content_at: string | null
          pending_content_by: string | null
          prompt_version: string | null
          provider: string | null
          source_version: number
          status: string
          updated_at: string
        }
        Insert: {
          book_id: string
          chunk_index: number
          content: string
          job_id?: string | null
          language: string
          model?: string | null
          pending_content?: string | null
          pending_content_at?: string | null
          pending_content_by?: string | null
          prompt_version?: string | null
          provider?: string | null
          source_version?: number
          status?: string
          updated_at?: string
        }
        Update: {
          book_id?: string
          chunk_index?: number
          content?: string
          job_id?: string | null
          language?: string
          model?: string | null
          pending_content?: string | null
          pending_content_at?: string | null
          pending_content_by?: string | null
          prompt_version?: string | null
          provider?: string | null
          source_version?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_chunks_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_chunks_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "book_translation_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      book_editions: {
        Row: {
          access_type: string
          authenticity_notes: string | null
          book_id: string
          created_at: string
          edition_title: string | null
          language: string
          provenance_type: string
          rights_basis: string | null
          rights_evidence_url: string | null
          source_edition_id: string | null
          source_url: string | null
          translator: string | null
          typography_profile: string
          updated_at: string
        }
        Insert: {
          access_type?: string
          authenticity_notes?: string | null
          book_id: string
          created_at?: string
          edition_title?: string | null
          language: string
          provenance_type?: string
          rights_basis?: string | null
          rights_evidence_url?: string | null
          source_edition_id?: string | null
          source_url?: string | null
          translator?: string | null
          typography_profile?: string
          updated_at?: string
        }
        Update: {
          access_type?: string
          authenticity_notes?: string | null
          book_id?: string
          created_at?: string
          edition_title?: string | null
          language?: string
          provenance_type?: string
          rights_basis?: string | null
          rights_evidence_url?: string | null
          source_edition_id?: string | null
          source_url?: string | null
          translator?: string | null
          typography_profile?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_editions_book_id_fkey"
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
          start_offset: number | null
          end_offset: number | null
          id: string
          language: string
          note: string | null
          user_id: string
        }
        Insert: {
          book_id: string
          chunk_index: number
          created_at?: string
          highlight_text: string
          start_offset?: number | null
          end_offset?: number | null
          id?: string
          language: string
          note?: string | null
          user_id: string
        }
        Update: {
          book_id?: string
          chunk_index?: number
          created_at?: string
          highlight_text?: string
          start_offset?: number | null
          end_offset?: number | null
          id?: string
          language?: string
          note?: string | null
          user_id?: string
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
          user_id: string
        }
        Insert: {
          book_id: string
          created_at?: string
          id?: string
          shelf: string
          user_id: string
        }
        Update: {
          book_id?: string
          created_at?: string
          id?: string
          shelf?: string
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
      book_structure_nodes: {
        Row: {
          book_id: string
          created_at: string
          depth: number
          end_chunk_index: number
          id: string
          language: string
          metadata: Json
          node_key: string
          node_type: string
          ordinal: number
          parent_node_key: string | null
          source_version: number
          start_chunk_index: number
          title: string | null
          updated_at: string
        }
        Insert: {
          book_id: string
          created_at?: string
          depth?: number
          end_chunk_index: number
          id?: string
          language: string
          metadata?: Json
          node_key: string
          node_type: string
          ordinal: number
          parent_node_key?: string | null
          source_version?: number
          start_chunk_index: number
          title?: string | null
          updated_at?: string
        }
        Update: {
          book_id?: string
          created_at?: string
          depth?: number
          end_chunk_index?: number
          id?: string
          language?: string
          metadata?: Json
          node_key?: string
          node_type?: string
          ordinal?: number
          parent_node_key?: string | null
          source_version?: number
          start_chunk_index?: number
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_structure_nodes_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      book_translation_guides: {
        Row: {
          book_id: string
          character_notes: string | null
          setting_context: string | null
          target_conventions: string | null
          terminology: Json
          tone_instructions: string | null
          updated_at: string
          updated_by: string | null
          voice_and_register: string | null
        }
        Insert: {
          book_id: string
          character_notes?: string | null
          setting_context?: string | null
          target_conventions?: string | null
          terminology?: Json
          tone_instructions?: string | null
          updated_at?: string
          updated_by?: string | null
          voice_and_register?: string | null
        }
        Update: {
          book_id?: string
          character_notes?: string | null
          setting_context?: string | null
          target_conventions?: string | null
          terminology?: Json
          tone_instructions?: string | null
          updated_at?: string
          updated_by?: string | null
          voice_and_register?: string | null
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
      book_translation_jobs: {
        Row: {
          attempts: number
          book_id: string
          completed_sections: number
          created_at: string
          failed_sections: number
          human_reviewed: boolean
          id: string
          language: string
          last_error: string | null
          model: string | null
          next_attempt_at: string | null
          prompt_version: string
          provider: string
          requested_by: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source_version: number
          status: string
          total_output_tokens: number
          total_prompt_tokens: number
          total_sections: number
          updated_at: string
        }
        Insert: {
          attempts?: number
          book_id: string
          completed_sections?: number
          created_at?: string
          failed_sections?: number
          human_reviewed?: boolean
          id?: string
          language: string
          last_error?: string | null
          model?: string | null
          next_attempt_at?: string | null
          prompt_version?: string
          provider?: string
          requested_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_version?: number
          status?: string
          total_output_tokens?: number
          total_prompt_tokens?: number
          total_sections?: number
          updated_at?: string
        }
        Update: {
          attempts?: number
          book_id?: string
          completed_sections?: number
          created_at?: string
          failed_sections?: number
          human_reviewed?: boolean
          id?: string
          language?: string
          last_error?: string | null
          model?: string | null
          next_attempt_at?: string | null
          prompt_version?: string
          provider?: string
          requested_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_version?: number
          status?: string
          total_output_tokens?: number
          total_prompt_tokens?: number
          total_sections?: number
          updated_at?: string
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
      book_translation_sections: {
        Row: {
          attempts: number
          chunk_index: number
          id: string
          job_id: string
          last_error: string | null
          next_attempt_at: string | null
          output_tokens: number | null
          prompt_tokens: number | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          chunk_index: number
          id?: string
          job_id: string
          last_error?: string | null
          next_attempt_at?: string | null
          output_tokens?: number | null
          prompt_tokens?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          chunk_index?: number
          id?: string
          job_id?: string
          last_error?: string | null
          next_attempt_at?: string | null
          output_tokens?: number | null
          prompt_tokens?: number | null
          status?: string
          updated_at?: string
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
      books: {
        Row: {
          access_type: string
          attribution: string | null
          author: string
          author_id: string | null
          available_languages: string[]
          categories: string[]
          checksum: string | null
          cover_url: string | null
          created_at: string
          description: string
          edition_review_status: string
          edition_title: string | null
          edition_year: number | null
          estimated_reading_minutes: number | null
          genre: string | null
          isbn: string | null
          id: string
          import_key: string | null
          original_publication_year: number | null
          permitted_territories: string[]
          publisher: string | null
          rejection_reason: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          rights_basis: string | null
          rights_evidence_url: string | null
          rights_risk_acknowledged_at: string | null
          rights_risk_acknowledged_by: string | null
          rights_status: string
          source_edition_id: string | null
          source_language: string
          source_scan_id: string | null
          source_url: string | null
          source_version: number
          status: string
          structure_review_status: string
          subscription_price_usd: number | null
          title: string
          total_chunks: number
          translation_permission: boolean
          translator: string | null
          cleanup_review_status: string
          content_classification: string
          translation_generation_policy: string
          typography_profile: string
          authenticity_notes: string | null
          word_count: number | null
        }
        Insert: {
          access_type?: string
          attribution?: string | null
          author: string
          author_id?: string | null
          available_languages?: string[]
          categories?: string[]
          checksum?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string
          edition_review_status?: string
          edition_title?: string | null
          edition_year?: number | null
          estimated_reading_minutes?: number | null
          genre?: string | null
          isbn?: string | null
          id?: string
          import_key?: string | null
          original_publication_year?: number | null
          permitted_territories?: string[]
          publisher?: string | null
          rejection_reason?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          rights_basis?: string | null
          rights_evidence_url?: string | null
          rights_risk_acknowledged_at?: string | null
          rights_risk_acknowledged_by?: string | null
          rights_status?: string
          source_edition_id?: string | null
          source_language: string
          source_scan_id?: string | null
          source_url?: string | null
          source_version?: number
          status?: string
          structure_review_status?: string
          subscription_price_usd?: number | null
          title: string
          total_chunks?: number
          translation_permission?: boolean
          translator?: string | null
          cleanup_review_status?: string
          content_classification?: string
          translation_generation_policy?: string
          typography_profile?: string
          authenticity_notes?: string | null
          word_count?: number | null
        }
        Update: {
          access_type?: string
          attribution?: string | null
          author?: string
          author_id?: string | null
          available_languages?: string[]
          categories?: string[]
          checksum?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string
          edition_review_status?: string
          edition_title?: string | null
          edition_year?: number | null
          estimated_reading_minutes?: number | null
          genre?: string | null
          isbn?: string | null
          id?: string
          import_key?: string | null
          original_publication_year?: number | null
          permitted_territories?: string[]
          publisher?: string | null
          rejection_reason?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          rights_basis?: string | null
          rights_evidence_url?: string | null
          rights_risk_acknowledged_at?: string | null
          rights_risk_acknowledged_by?: string | null
          rights_status?: string
          source_edition_id?: string | null
          source_language?: string
          source_scan_id?: string | null
          source_url?: string | null
          source_version?: number
          status?: string
          structure_review_status?: string
          subscription_price_usd?: number | null
          title?: string
          total_chunks?: number
          translation_permission?: boolean
          translator?: string | null
          cleanup_review_status?: string
          content_classification?: string
          translation_generation_policy?: string
          typography_profile?: string
          authenticity_notes?: string | null
          word_count?: number | null
        }
        Relationships: []
      }
      category_suggestions: {
        Row: {
          content_id: string
          content_type: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          id: string
          status: string
          suggested_by: string
          suggested_category: string
        }
        Insert: {
          content_id: string
          content_type: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          status?: string
          suggested_by: string
          suggested_category: string
        }
        Update: {
          content_id?: string
          content_type?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          status?: string
          suggested_by?: string
          suggested_category?: string
        }
        Relationships: []
      }
      content_settings: {
        Row: {
          is_public: boolean
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
          version: number
        }
        Insert: {
          is_public?: boolean
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
          version?: number
        }
        Update: {
          is_public?: boolean
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
          version?: number
        }
        Relationships: []
      }
      content_settings_history: {
        Row: {
          action: string
          created_at: string
          id: string
          key: string
          updated_by: string | null
          value: Json
          version: number
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          key: string
          updated_by?: string | null
          value: Json
          version: number
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          key?: string
          updated_by?: string | null
          value?: Json
          version?: number
        }
        Relationships: []
      }
      error_events: {
        Row: {
          book_id: string | null
          client_version: string | null
          code: string
          context: Json
          id: string
          job_id: string | null
          message: string
          occurred_at: string
          request_id: string | null
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          retryable: boolean
          severity: string
          user_id: string | null
        }
        Insert: {
          book_id?: string | null
          client_version?: string | null
          code: string
          context?: Json
          id?: string
          job_id?: string | null
          message: string
          occurred_at?: string
          request_id?: string | null
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          retryable?: boolean
          severity?: string
          user_id?: string | null
        }
        Update: {
          book_id?: string | null
          client_version?: string | null
          code?: string
          context?: Json
          id?: string
          job_id?: string | null
          message?: string
          occurred_at?: string
          request_id?: string | null
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          retryable?: boolean
          severity?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "error_events_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "error_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "book_translation_jobs"
            referencedColumns: ["id"]
          },
        ]
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
      research_paper_versions: {
        Row: {
          abstract: string
          acknowledgments: string | null
          affiliation: string | null
          ai_assistance_disclosure: string | null
          author_name: string
          body_text: string | null
          citation_style: string | null
          coauthor_names: string[]
          conflicts_of_interest: string | null
          funding_note: string | null
          id: string
          keywords: string[]
          language: string
          orcid: string | null
          paper_id: string
          paper_type: string
          pdf_data: string | null
          pdf_filename: string | null
          pdf_size_bytes: number | null
          published_at: string
          published_by: string
          references_text: string
          title: string
          topic: string | null
          version: number
          withdrawn: boolean
          withdrawn_at: string | null
          withdrawn_by: string | null
          withdrawn_reason: string | null
        }
        Insert: {
          abstract: string
          acknowledgments?: string | null
          affiliation?: string | null
          ai_assistance_disclosure?: string | null
          author_name: string
          body_text?: string | null
          citation_style?: string | null
          coauthor_names?: string[]
          conflicts_of_interest?: string | null
          funding_note?: string | null
          id?: string
          keywords?: string[]
          language: string
          orcid?: string | null
          paper_id: string
          paper_type: string
          pdf_data?: string | null
          pdf_filename?: string | null
          pdf_size_bytes?: number | null
          published_at?: string
          published_by: string
          references_text: string
          title: string
          topic?: string | null
          version: number
          withdrawn?: boolean
          withdrawn_at?: string | null
          withdrawn_by?: string | null
          withdrawn_reason?: string | null
        }
        Update: {
          abstract?: string
          acknowledgments?: string | null
          affiliation?: string | null
          ai_assistance_disclosure?: string | null
          author_name?: string
          body_text?: string | null
          citation_style?: string | null
          coauthor_names?: string[]
          conflicts_of_interest?: string | null
          funding_note?: string | null
          id?: string
          keywords?: string[]
          language?: string
          orcid?: string | null
          paper_id?: string
          paper_type?: string
          pdf_data?: string | null
          pdf_filename?: string | null
          pdf_size_bytes?: number | null
          published_at?: string
          published_by?: string
          references_text?: string
          title?: string
          topic?: string | null
          version?: number
          withdrawn?: boolean
          withdrawn_at?: string | null
          withdrawn_by?: string | null
          withdrawn_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "research_paper_versions_paper_id_fkey"
            columns: ["paper_id"]
            isOneToOne: false
            referencedRelation: "research_papers"
            referencedColumns: ["id"]
          },
        ]
      }
      research_papers: {
        Row: {
          abstract: string
          acknowledgments: string | null
          affiliation: string | null
          ai_assistance_disclosure: string | null
          author_id: string
          author_name: string
          body_text: string | null
          citation_style: string | null
          coauthor_names: string[]
          conflicts_of_interest: string | null
          created_at: string
          funding_note: string | null
          id: string
          keywords: string[]
          language: string
          orcid: string | null
          paper_type: string
          pdf_data: string | null
          pdf_filename: string | null
          pdf_size_bytes: number | null
          published_version_id: string | null
          references_text: string
          rejection_reason: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          rights_declaration: string
          status: string
          third_party_rights_note: string | null
          title: string
          topic: string | null
          updated_at: string
        }
        Insert: {
          abstract?: string
          acknowledgments?: string | null
          affiliation?: string | null
          ai_assistance_disclosure?: string | null
          author_id: string
          author_name?: string
          body_text?: string | null
          citation_style?: string | null
          coauthor_names?: string[]
          conflicts_of_interest?: string | null
          created_at?: string
          funding_note?: string | null
          id?: string
          keywords?: string[]
          language: string
          orcid?: string | null
          paper_type: string
          pdf_data?: string | null
          pdf_filename?: string | null
          pdf_size_bytes?: number | null
          published_version_id?: string | null
          references_text?: string
          rejection_reason?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          rights_declaration?: string
          status?: string
          third_party_rights_note?: string | null
          title?: string
          topic?: string | null
          updated_at?: string
        }
        Update: {
          abstract?: string
          acknowledgments?: string | null
          affiliation?: string | null
          ai_assistance_disclosure?: string | null
          author_id?: string
          author_name?: string
          body_text?: string | null
          citation_style?: string | null
          coauthor_names?: string[]
          conflicts_of_interest?: string | null
          created_at?: string
          funding_note?: string | null
          id?: string
          keywords?: string[]
          language?: string
          orcid?: string | null
          paper_type?: string
          pdf_data?: string | null
          pdf_filename?: string | null
          pdf_size_bytes?: number | null
          published_version_id?: string | null
          references_text?: string
          rejection_reason?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          rights_declaration?: string
          status?: string
          third_party_rights_note?: string | null
          title?: string
          topic?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_papers_published_version_fkey"
            columns: ["published_version_id"]
            isOneToOne: false
            referencedRelation: "research_paper_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      support_report_rate_limit: {
        Row: {
          count: number
          day: string
          ip_hash: string
        }
        Insert: {
          count?: number
          day: string
          ip_hash: string
        }
        Update: {
          count?: number
          day?: string
          ip_hash?: string
        }
        Relationships: []
      }
      support_ticket_notes: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          delivery_status: string
          id: string
          ticket_id: string
          visibility: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          delivery_status?: string
          id?: string
          ticket_id: string
          visibility?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          delivery_status?: string
          id?: string
          ticket_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_notes_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_to: string | null
          category: string
          contact_email: string | null
          created_at: string
          description: string
          id: string
          is_anonymous: boolean
          notification_status: string
          reference_code: string | null
          related_book_id: string | null
          related_job_id: string | null
          related_paper_id: string | null
          request_kind: string
          resolution: string | null
          resolved_at: string | null
          severity: string
          status: string
          structured_data: Json | null
          subject: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          category?: string
          contact_email?: string | null
          created_at?: string
          description: string
          id?: string
          is_anonymous?: boolean
          notification_status?: string
          reference_code?: string | null
          related_book_id?: string | null
          related_job_id?: string | null
          related_paper_id?: string | null
          request_kind?: string
          resolution?: string | null
          resolved_at?: string | null
          severity?: string
          status?: string
          structured_data?: Json | null
          subject: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          category?: string
          contact_email?: string | null
          created_at?: string
          description?: string
          id?: string
          is_anonymous?: boolean
          notification_status?: string
          reference_code?: string | null
          related_book_id?: string | null
          related_job_id?: string | null
          related_paper_id?: string | null
          request_kind?: string
          resolution?: string | null
          resolved_at?: string | null
          severity?: string
          status?: string
          structured_data?: Json | null
          subject?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_related_book_id_fkey"
            columns: ["related_book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_related_job_id_fkey"
            columns: ["related_job_id"]
            isOneToOne: false
            referencedRelation: "book_translation_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_related_paper_id_fkey"
            columns: ["related_paper_id"]
            isOneToOne: false
            referencedRelation: "research_papers"
            referencedColumns: ["id"]
          },
        ]
      }
      translation_reports: {
        Row: {
          book_id: string
          chunk_index: number
          created_at: string
          id: string
          language: string
          reason: string
          reporter_id: string
          status: string
        }
        Insert: {
          book_id: string
          chunk_index: number
          created_at?: string
          id?: string
          language: string
          reason: string
          reporter_id: string
          status?: string
        }
        Update: {
          book_id?: string
          chunk_index?: number
          created_at?: string
          id?: string
          language?: string
          reason?: string
          reporter_id?: string
          status?: string
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
      translation_requests: {
        Row: {
          book_id: string
          created_at: string
          decision_reason: string | null
          id: string
          job_id: string | null
          language: string
          requester_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          book_id: string
          created_at?: string
          decision_reason?: string | null
          id?: string
          job_id?: string | null
          language: string
          requester_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          book_id?: string
          created_at?: string
          decision_reason?: string | null
          id?: string
          job_id?: string | null
          language?: string
          requester_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "translation_requests_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "translation_requests_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "book_translation_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      user_subscriptions: {
        Row: {
          book_id: string
          created_at: string
          expires_at: string | null
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
      book_chunk_readable: {
        Args: { p_book_id: string; p_chunk_index: number; p_language: string }
        Returns: boolean
      }
      current_admin_role: { Args: never; Returns: string }
      has_active_plan_subscription: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      is_admin: { Args: { min_roles: string[] }; Returns: boolean }
      is_monetization_enabled: { Args: never; Returns: boolean }
      is_paper_version_published: {
        Args: { p_paper_id: string; p_version_id: string }
        Returns: boolean
      }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
