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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      assets: {
        Row: {
          character_id: string | null
          created_at: string
          id: string
          is_default: boolean | null
          kind: string
          label: string
          layer_order: number
          offset_x: number | null
          offset_y: number | null
          room_id: string
          scale: number | null
          tag: string | null
          url: string
        }
        Insert: {
          character_id?: string | null
          created_at?: string
          id?: string
          is_default?: boolean | null
          kind: string
          label: string
          layer_order?: number
          offset_x?: number | null
          offset_y?: number | null
          room_id: string
          scale?: number | null
          tag?: string | null
          url: string
        }
        Update: {
          character_id?: string | null
          created_at?: string
          id?: string
          is_default?: boolean | null
          kind?: string
          label?: string
          layer_order?: number
          offset_x?: number | null
          offset_y?: number | null
          room_id?: string
          scale?: number | null
          tag?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "assets_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      characters: {
        Row: {
          avatar_offset_x: number | null
          avatar_offset_y: number | null
          avatar_scale: number | null
          avatar_url: string | null
          created_at: string
          derived: Json
          id: string
          is_npc: boolean
          items: string[] | null
          memo: string | null
          name: string
          owner_participant_id: string | null
          owner_user_id: string | null
          room_id: string
          skills: Json
          stats: Json
        }
        Insert: {
          avatar_offset_x?: number | null
          avatar_offset_y?: number | null
          avatar_scale?: number | null
          avatar_url?: string | null
          created_at?: string
          derived?: Json
          id?: string
          is_npc?: boolean
          items?: string[] | null
          memo?: string | null
          name: string
          owner_participant_id?: string | null
          owner_user_id?: string | null
          room_id: string
          skills?: Json
          stats?: Json
        }
        Update: {
          avatar_offset_x?: number | null
          avatar_offset_y?: number | null
          avatar_scale?: number | null
          avatar_url?: string | null
          created_at?: string
          derived?: Json
          id?: string
          is_npc?: boolean
          items?: string[] | null
          memo?: string | null
          name?: string
          owner_participant_id?: string | null
          owner_user_id?: string | null
          room_id?: string
          skills?: Json
          stats?: Json
        }
        Relationships: [
          {
            foreignKeyName: "characters_owner_participant_id_fkey"
            columns: ["owner_participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "characters_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      macros: {
        Row: {
          created_at: string
          id: string
          room_id: string
          scope: string
          text: string
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          room_id: string
          scope?: string
          text: string
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          room_id?: string
          scope?: string
          text?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "macros_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          channel: string
          created_at: string
          dice_payload: Json | null
          id: string
          room_id: string
          secret_allow_list: string[] | null
          speaker_name: string
          speaker_portrait_url: string | null
          text: string
          type: string
        }
        Insert: {
          channel?: string
          created_at?: string
          dice_payload?: Json | null
          id?: string
          room_id: string
          secret_allow_list?: string[] | null
          speaker_name: string
          speaker_portrait_url?: string | null
          text: string
          type?: string
        }
        Update: {
          channel?: string
          created_at?: string
          dice_payload?: Json | null
          id?: string
          room_id?: string
          secret_allow_list?: string[] | null
          speaker_name?: string
          speaker_portrait_url?: string | null
          text?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      participants: {
        Row: {
          created_at: string
          id: string
          name: string
          role: string
          room_id: string
          session_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          role?: string
          room_id: string
          session_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          role?: string
          room_id?: string
          session_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "participants_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          created_at: string
          current_background_url: string | null
          gm_key_hash: string
          house_rules: string | null
          id: string
          name: string
          owner_user_id: string | null
          theme: Json | null
        }
        Insert: {
          created_at?: string
          current_background_url?: string | null
          gm_key_hash: string
          house_rules?: string | null
          id?: string
          name: string
          owner_user_id?: string | null
          theme?: Json | null
        }
        Update: {
          created_at?: string
          current_background_url?: string | null
          gm_key_hash?: string
          house_rules?: string | null
          id?: string
          name?: string
          owner_user_id?: string | null
          theme?: Json | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
        }
        Relationships: []
      }
      room_members: {
        Row: {
          created_at: string
          role: string
          room_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          role?: string
          room_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          role?: string
          room_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_members_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_states: {
        Row: {
          active_portraits: Json
          background_url: string | null
          id: string
          is_secret: boolean
          room_id: string
          secret_allow_list: string[] | null
          updated_at: string
        }
        Insert: {
          active_portraits?: Json
          background_url?: string | null
          id?: string
          is_secret?: boolean
          room_id: string
          secret_allow_list?: string[] | null
          updated_at?: string
        }
        Update: {
          active_portraits?: Json
          background_url?: string | null
          id?: string
          is_secret?: boolean
          room_id?: string
          secret_allow_list?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage_states_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: true
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_events: {
        Row: {
          created_at: string
          data: Json
          id: string
          kind: string
          room_id: string
        }
        Insert: {
          created_at?: string
          data?: Json
          id?: string
          kind: string
          room_id: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          kind?: string
          room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage_events_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
