/**
 * Hand-maintained mirror of supabase/migrations/*.sql.
 *
 * Keyed by `compass`, not `public`. The Supabase project is shared with another
 * Refactrd product, so Compass owns its own schema (see migration 0002). The
 * clients in lib/supabase/* set `db: { schema: "compass" }` to match.
 *
 * Regenerate with `supabase gen types typescript --schema compass` once the
 * project is linked; until then keep this in step with the migrations by hand.
 */

export type UserRole = "admin" | "consultant";
export type UserStatus = "invited" | "active" | "disabled";
export type MessageRole = "user" | "assistant";
export type DocumentStatus = "active" | "deactivated";

/** Shape of conversations.pending_client_link. */
export type PendingClientLink = {
  proposed: {
    name: string;
    industry: string | null;
    size: string | null;
    notes: string | null;
  };
  existingClientId: string;
};

export type Database = {
  compass: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          role: UserRole;
          status: UserStatus;
          created_at: string;
          invited_by: string | null;
        };
        Insert: {
          id: string;
          email: string;
          role?: UserRole;
          status?: UserStatus;
          created_at?: string;
          invited_by?: string | null;
        };
        Update: {
          email?: string;
          role?: UserRole;
          status?: UserStatus;
          invited_by?: string | null;
        };
        Relationships: [];
      };
      clients: {
        Row: {
          id: string;
          name: string;
          industry: string | null;
          size: string | null;
          notes: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          industry?: string | null;
          size?: string | null;
          notes?: string | null;
          created_by?: string | null;
        };
        Update: {
          name?: string;
          industry?: string | null;
          size?: string | null;
          notes?: string | null;
        };
        Relationships: [];
      };
      conversations: {
        Row: {
          id: string;
          user_id: string;
          client_id: string | null;
          title: string | null;
          created_at: string;
          updated_at: string;
          /** Unresolved link suggestion; see migration 0004. */
          pending_client_link: PendingClientLink | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          client_id?: string | null;
          title?: string | null;
        };
        Update: {
          client_id?: string | null;
          title?: string | null;
          /** Written to bump the row; the trigger overrides it with now(). */
          updated_at?: string;
          pending_client_link?: PendingClientLink | null;
        };
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          role: MessageRole;
          content: string;
          source_chunk_ids: string[] | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          role: MessageRole;
          content: string;
          source_chunk_ids?: string[] | null;
        };
        /** Append-only: there is no update policy on this table. */
        Update: Record<string, never>;
        Relationships: [];
      };
      documents: {
        Row: {
          id: string;
          title: string;
          storage_path: string;
          uploaded_by: string | null;
          status: DocumentStatus;
          uploaded_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          storage_path: string;
          uploaded_by?: string | null;
          status?: DocumentStatus;
        };
        Update: {
          title?: string;
          status?: DocumentStatus;
        };
        Relationships: [];
      };
      document_chunks: {
        Row: {
          id: string;
          document_id: string;
          content: string;
          /** vector(1024) — serialized as number[] over PostgREST. */
          embedding: number[] | null;
          chunk_index: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          document_id: string;
          content: string;
          embedding?: number[] | string | null;
          chunk_index: number;
        };
        Update: {
          content?: string;
          embedding?: number[] | string | null;
        };
        Relationships: [];
      };
      usage_events: {
        Row: {
          id: string;
          user_id: string;
          /** UTC calendar date — the 20/day cap resets at UTC midnight. */
          date: string;
          count: number;
        };
        Insert: {
          id?: string;
          user_id: string;
          date: string;
          count?: number;
        };
        Update: {
          count?: number;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      increment_daily_usage: {
        Args: { p_user_id: string };
        Returns: number;
      };
      match_document_chunks: {
        Args: {
          /** vector(1024), sent as its bracketed string form. */
          query_embedding: string;
          match_count?: number;
          min_similarity?: number;
        };
        Returns: {
          id: string;
          document_id: string;
          document_title: string;
          content: string;
          similarity: number;
        }[];
      };
    };
    Enums: {
      user_role: UserRole;
      user_status: UserStatus;
      message_role: MessageRole;
      document_status: DocumentStatus;
    };
    CompositeTypes: { [_ in never]: never };
  };
};
