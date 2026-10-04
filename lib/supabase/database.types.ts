export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      categories: {
        Row: {
          default_cost_type: string
          id: number
          name: string
        }
        Insert: {
          default_cost_type?: string
          id?: never
          name: string
        }
        Update: {
          default_cost_type?: string
          id?: never
          name?: string
        }
        Relationships: []
      }
      category_breakdowns: {
        Row: {
          category_id: number
          created_at: string
          group_id: string
          id: number
          is_hidden: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          category_id: number
          created_at?: string
          group_id: string
          id?: never
          is_hidden?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category_id?: number
          created_at?: string
          group_id?: string
          id?: never
          is_hidden?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "category_breakdowns_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_breakdowns_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      category_settings: {
        Row: {
          category_id: number
          cost_type: string
          group_id: string
          updated_at: string
        }
        Insert: {
          category_id: number
          cost_type: string
          group_id: string
          updated_at?: string
        }
        Update: {
          category_id?: number
          cost_type?: string
          group_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "category_settings_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_settings_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      consumption_taxes: {
        Row: {
          id: number
          multiplier: number
          name: string
        }
        Insert: {
          id?: never
          multiplier: number
          name: string
        }
        Update: {
          id?: never
          multiplier?: number
          name?: string
        }
        Relationships: []
      }
      counterparts: {
        Row: {
          created_at: string
          group_id: string
          id: number
          is_hidden: boolean
          kind: string
          name: string | null
          sort_order: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: never
          is_hidden?: boolean
          kind: string
          name?: string | null
          sort_order?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: never
          is_hidden?: boolean
          kind?: string
          name?: string | null
          sort_order?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "counterparts_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_members: {
        Row: {
          created_at: string
          group_id: string
          id: string
          invited_display_name: string | null
          invited_email: string | null
          role: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          invited_display_name?: string | null
          invited_email?: string | null
          role?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          invited_display_name?: string | null
          invited_email?: string | null
          role?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      payee_aliases: {
        Row: {
          created_at: string
          group_id: string
          id: number
          name: string
          payee_id: number
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: never
          name: string
          payee_id: number
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: never
          name?: string
          payee_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "payee_aliases_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payee_aliases_payee_id_fkey"
            columns: ["payee_id"]
            isOneToOne: false
            referencedRelation: "payees"
            referencedColumns: ["id"]
          },
        ]
      }
      payee_default_tags: {
        Row: {
          payee_id: number
          tag_id: number
        }
        Insert: {
          payee_id: number
          tag_id: number
        }
        Update: {
          payee_id?: number
          tag_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "payee_default_tags_payee_id_fkey"
            columns: ["payee_id"]
            isOneToOne: false
            referencedRelation: "payees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payee_default_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      payees: {
        Row: {
          created_at: string
          default_breakdown_id: number | null
          default_category_id: number | null
          default_counterpart_id: number | null
          default_owner_joint: boolean
          default_owner_user_id: string | null
          group_id: string
          id: number
          is_hidden: boolean
          name: string
          owner_user_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_breakdown_id?: number | null
          default_category_id?: number | null
          default_counterpart_id?: number | null
          default_owner_joint?: boolean
          default_owner_user_id?: string | null
          group_id: string
          id?: never
          is_hidden?: boolean
          name: string
          owner_user_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_breakdown_id?: number | null
          default_category_id?: number | null
          default_counterpart_id?: number | null
          default_owner_joint?: boolean
          default_owner_user_id?: string | null
          group_id?: string
          id?: never
          is_hidden?: boolean
          name?: string
          owner_user_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payees_default_breakdown_id_fkey"
            columns: ["default_breakdown_id"]
            isOneToOne: false
            referencedRelation: "category_breakdowns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payees_default_category_id_fkey"
            columns: ["default_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payees_default_counterpart_id_fkey"
            columns: ["default_counterpart_id"]
            isOneToOne: false
            referencedRelation: "counterparts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payees_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          color: string | null
          display_name: string
          email: string | null
          id: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          display_name: string
          email?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          display_name?: string
          email?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      receipt_detail_tags: {
        Row: {
          receipt_detail_id: string
          tag_id: number
        }
        Insert: {
          receipt_detail_id: string
          tag_id: number
        }
        Update: {
          receipt_detail_id?: string
          tag_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "receipt_detail_tags_receipt_detail_id_fkey"
            columns: ["receipt_detail_id"]
            isOneToOne: false
            referencedRelation: "receipt_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_detail_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      receipt_details: {
        Row: {
          breakdown_id: number | null
          category_id: number
          counterpart_id: number
          created_at: string
          id: string
          item_name: string
          owner_user_id: string | null
          price: number
          receipt_id: string
          tax_rate_id: number | null
          tax_type: string
          updated_at: string
        }
        Insert: {
          breakdown_id?: number | null
          category_id: number
          counterpart_id: number
          created_at?: string
          id?: string
          item_name: string
          owner_user_id?: string | null
          price: number
          receipt_id: string
          tax_rate_id?: number | null
          tax_type: string
          updated_at?: string
        }
        Update: {
          breakdown_id?: number | null
          category_id?: number
          counterpart_id?: number
          created_at?: string
          id?: string
          item_name?: string
          owner_user_id?: string | null
          price?: number
          receipt_id?: string
          tax_rate_id?: number | null
          tax_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipt_details_breakdown_id_fkey"
            columns: ["breakdown_id"]
            isOneToOne: false
            referencedRelation: "category_breakdowns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_details_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_details_counterpart_id_fkey"
            columns: ["counterpart_id"]
            isOneToOne: false
            referencedRelation: "counterparts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_details_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_details_tax_rate_id_fkey"
            columns: ["tax_rate_id"]
            isOneToOne: false
            referencedRelation: "consumption_taxes"
            referencedColumns: ["id"]
          },
        ]
      }
      receipts: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          group_id: string
          id: string
          is_duplicated: boolean
          occurred_at: string
          payee_id: number | null
          payee_name: string
          payer_user_id: string
          receipt_image_path: string | null
          transaction_type_id: number
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by: string
          group_id: string
          id?: string
          is_duplicated?: boolean
          occurred_at: string
          payee_id?: number | null
          payee_name: string
          payer_user_id: string
          receipt_image_path?: string | null
          transaction_type_id: number
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          group_id?: string
          id?: string
          is_duplicated?: boolean
          occurred_at?: string
          payee_id?: number | null
          payee_name?: string
          payer_user_id?: string
          receipt_image_path?: string | null
          transaction_type_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipts_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_payee_id_fkey"
            columns: ["payee_id"]
            isOneToOne: false
            referencedRelation: "payees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_transaction_type_id_fkey"
            columns: ["transaction_type_id"]
            isOneToOne: false
            referencedRelation: "transaction_types"
            referencedColumns: ["id"]
          },
        ]
      }
      settlement_periods: {
        Row: {
          confirmed_at: string
          confirmed_by: string
          group_id: string
          id: string
          period_month: string
          reopened_at: string | null
          reopened_by: string | null
          settlement_amount: number
          settlement_from_user_id: string
          settlement_to_user_id: string
          status: string
          user_a_burden: number
          user_a_id: string
          user_a_paid: number
          user_b_burden: number
          user_b_id: string
          user_b_paid: number
        }
        Insert: {
          confirmed_at?: string
          confirmed_by: string
          group_id: string
          id?: string
          period_month: string
          reopened_at?: string | null
          reopened_by?: string | null
          settlement_amount: number
          settlement_from_user_id: string
          settlement_to_user_id: string
          status?: string
          user_a_burden: number
          user_a_id: string
          user_a_paid: number
          user_b_burden: number
          user_b_id: string
          user_b_paid: number
        }
        Update: {
          confirmed_at?: string
          confirmed_by?: string
          group_id?: string
          id?: string
          period_month?: string
          reopened_at?: string | null
          reopened_by?: string | null
          settlement_amount?: number
          settlement_from_user_id?: string
          settlement_to_user_id?: string
          status?: string
          user_a_burden?: number
          user_a_id?: string
          user_a_paid?: number
          user_b_burden?: number
          user_b_id?: string
          user_b_paid?: number
        }
        Relationships: [
          {
            foreignKeyName: "settlement_periods_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          created_at: string
          group_id: string
          id: number
          is_hidden: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: never
          is_hidden?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: never
          is_hidden?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_types: {
        Row: {
          id: number
          name: string
        }
        Insert: {
          id?: never
          name: string
        }
        Update: {
          id?: never
          name?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _link_group_membership: {
        Args: { p_email: string; p_user_id: string }
        Returns: undefined
      }
      add_payee_alias: {
        Args: { p_name: string; p_payee_id: number }
        Returns: Json
      }
      admin_manages_user: { Args: { p_user_id: string }; Returns: boolean }
      confirm_settlement: {
        Args: {
          p_group_id: string
          p_period_month: string
          p_settlement_amount: number
          p_settlement_from_user_id: string
          p_settlement_to_user_id: string
          p_user_a_burden: number
          p_user_a_id: string
          p_user_a_paid: number
          p_user_b_burden: number
          p_user_b_id: string
          p_user_b_paid: number
        }
        Returns: {
          confirmed_at: string
          confirmed_by: string
          group_id: string
          id: string
          period_month: string
          reopened_at: string | null
          reopened_by: string | null
          settlement_amount: number
          settlement_from_user_id: string
          settlement_to_user_id: string
          status: string
          user_a_burden: number
          user_a_id: string
          user_a_paid: number
          user_b_burden: number
          user_b_id: string
          user_b_paid: number
        }
        SetofOptions: {
          from: "*"
          to: "settlement_periods"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_default_counterparts: {
        Args: { p_group_id: string }
        Returns: undefined
      }
      create_group_with_admin: {
        Args: { p_name: string }
        Returns: {
          created_at: string
          created_by: string
          id: string
          name: string
        }
        SetofOptions: {
          from: "*"
          to: "groups"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      is_group_admin: { Args: { p_group_id: string }; Returns: boolean }
      is_settlement_confirmed: {
        Args: { p_group_id: string; p_occurred_at: string }
        Returns: boolean
      }
      link_pending_group_memberships: { Args: never; Returns: undefined }
      my_group_ids: { Args: never; Returns: string[] }
      normalize_payee_name: { Args: { p_name: string }; Returns: string }
      reopen_settlement: {
        Args: { p_group_id: string; p_period_month: string }
        Returns: {
          confirmed_at: string
          confirmed_by: string
          group_id: string
          id: string
          period_month: string
          reopened_at: string | null
          reopened_by: string | null
          settlement_amount: number
          settlement_from_user_id: string
          settlement_to_user_id: string
          status: string
          user_a_burden: number
          user_a_id: string
          user_a_paid: number
          user_b_burden: number
          user_b_id: string
          user_b_paid: number
        }
        SetofOptions: {
          from: "*"
          to: "settlement_periods"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      shares_group_with: { Args: { p_user_id: string }; Returns: boolean }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

