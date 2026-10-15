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
      action_tokens: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          issued_to: string
          payload: NonNullable<Json>
          purpose: string
          token_hash: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          issued_to: string
          payload: NonNullable<Json>
          purpose: string
          token_hash: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          issued_to?: string
          payload?: NonNullable<Json>
          purpose?: string
          token_hash?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'action_tokens_issued_to_fkey'
            columns: ['issued_to']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor: string | null
          at: string
          id: number
          new_data: Json | null
          old_data: Json | null
          row_pk: string
          table_name: string
        }
        Insert: {
          action: string
          actor?: string | null
          at?: string
          id?: never
          new_data?: Json | null
          old_data?: Json | null
          row_pk: string
          table_name: string
        }
        Update: {
          action?: string
          actor?: string | null
          at?: string
          id?: never
          new_data?: Json | null
          old_data?: Json | null
          row_pk?: string
          table_name?: string
        }
        Relationships: []
      }
      cash_counts: {
        Row: {
          denom_cents: number
          kind: Database['public']['Enums']['cash_count_kind']
          qty: number
          sale_day_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          denom_cents: number
          kind: Database['public']['Enums']['cash_count_kind']
          qty?: number
          sale_day_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          denom_cents?: number
          kind?: Database['public']['Enums']['cash_count_kind']
          qty?: number
          sale_day_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'cash_counts_sale_day_id_fkey'
            columns: ['sale_day_id']
            isOneToOne: false
            referencedRelation: 'sale_day_cash'
            referencedColumns: ['sale_day_id']
          },
          {
            foreignKeyName: 'cash_counts_sale_day_id_fkey'
            columns: ['sale_day_id']
            isOneToOne: false
            referencedRelation: 'sale_days'
            referencedColumns: ['id']
          },
        ]
      }
      items: {
        Row: {
          archived: boolean
          bundle_size: number
          created_at: string
          created_by: string | null
          id: string
          name: string
          price_cents: number | null
          storage: Database['public']['Enums']['storage_kind']
          type: Database['public']['Enums']['item_type']
          unit_cost_cents: number
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          archived?: boolean
          bundle_size?: number
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          price_cents?: number | null
          storage?: Database['public']['Enums']['storage_kind']
          type: Database['public']['Enums']['item_type']
          unit_cost_cents?: number
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          archived?: boolean
          bundle_size?: number
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          price_cents?: number | null
          storage?: Database['public']['Enums']['storage_kind']
          type?: Database['public']['Enums']['item_type']
          unit_cost_cents?: number
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          display_name: string
          email: string | null
          full_name: string | null
          id: string
          role: Database['public']['Enums']['user_role']
        }
        Insert: {
          active?: boolean
          created_at?: string
          display_name: string
          email?: string | null
          full_name?: string | null
          id: string
          role?: Database['public']['Enums']['user_role']
        }
        Update: {
          active?: boolean
          created_at?: string
          display_name?: string
          email?: string | null
          full_name?: string | null
          id?: string
          role?: Database['public']['Enums']['user_role']
        }
        Relationships: []
      }
      purchase_lines: {
        Row: {
          cost_cents: number
          id: string
          item_id: string
          line_no: number
          pieces: number
          purchase_id: string
        }
        Insert: {
          cost_cents: number
          id?: string
          item_id: string
          line_no: number
          pieces: number
          purchase_id: string
        }
        Update: {
          cost_cents?: number
          id?: string
          item_id?: string
          line_no?: number
          pieces?: number
          purchase_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'purchase_lines_item_id_fkey'
            columns: ['item_id']
            isOneToOne: false
            referencedRelation: 'item_overview'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'purchase_lines_item_id_fkey'
            columns: ['item_id']
            isOneToOne: false
            referencedRelation: 'item_stock'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'purchase_lines_item_id_fkey'
            columns: ['item_id']
            isOneToOne: false
            referencedRelation: 'items'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'purchase_lines_purchase_id_fkey'
            columns: ['purchase_id']
            isOneToOne: false
            referencedRelation: 'claims'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'purchase_lines_purchase_id_fkey'
            columns: ['purchase_id']
            isOneToOne: false
            referencedRelation: 'purchases'
            referencedColumns: ['id']
          },
        ]
      }
      purchase_refunds: {
        Row: {
          amount_cents: number
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          pieces: number
          purchase_line_id: string
          refunded_on: string
          slip_path: string | null
        }
        Insert: {
          amount_cents: number
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          pieces: number
          purchase_line_id: string
          refunded_on: string
          slip_path?: string | null
        }
        Update: {
          amount_cents?: number
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          pieces?: number
          purchase_line_id?: string
          refunded_on?: string
          slip_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'purchase_refunds_purchase_line_id_fkey'
            columns: ['purchase_line_id']
            isOneToOne: false
            referencedRelation: 'claim_lines'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'purchase_refunds_purchase_line_id_fkey'
            columns: ['purchase_line_id']
            isOneToOne: false
            referencedRelation: 'purchase_lines'
            referencedColumns: ['id']
          },
        ]
      }
      purchases: {
        Row: {
          buyer_id: string
          claim_no: number
          created_at: string
          created_by: string | null
          id: string
          paid_at: string | null
          paid_by: string | null
          payment_ref: string | null
          purchased_on: string
          receipt_path: string
          status: Database['public']['Enums']['claim_status']
          store: string
        }
        Insert: {
          buyer_id: string
          claim_no?: never
          created_at?: string
          created_by?: string | null
          id?: string
          paid_at?: string | null
          paid_by?: string | null
          payment_ref?: string | null
          purchased_on: string
          receipt_path: string
          status?: Database['public']['Enums']['claim_status']
          store: string
        }
        Update: {
          buyer_id?: string
          claim_no?: never
          created_at?: string
          created_by?: string | null
          id?: string
          paid_at?: string | null
          paid_by?: string | null
          payment_ref?: string | null
          purchased_on?: string
          receipt_path?: string
          status?: Database['public']['Enums']['claim_status']
          store?: string
        }
        Relationships: [
          {
            foreignKeyName: 'purchases_buyer_id_fkey'
            columns: ['buyer_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'purchases_paid_by_fkey'
            columns: ['paid_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      sale_days: {
        Row: {
          close_note: string | null
          closed_at: string | null
          closed_by: string | null
          created_at: string
          created_by: string | null
          id: string
          left_in_box_cents: number | null
          open_note: string | null
          phase: Database['public']['Enums']['sale_phase']
          sale_date: string
          selling_at: string | null
          selling_by: string | null
        }
        Insert: {
          close_note?: string | null
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          left_in_box_cents?: number | null
          open_note?: string | null
          phase?: Database['public']['Enums']['sale_phase']
          sale_date: string
          selling_at?: string | null
          selling_by?: string | null
        }
        Update: {
          close_note?: string | null
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          left_in_box_cents?: number | null
          open_note?: string | null
          phase?: Database['public']['Enums']['sale_phase']
          sale_date?: string
          selling_at?: string | null
          selling_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'sale_days_closed_by_fkey'
            columns: ['closed_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'sale_days_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'sale_days_selling_by_fkey'
            columns: ['selling_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      settings: {
        Row: {
          float_cents: number
          gst_rate: number
          id: boolean
          treasurer_email: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          float_cents?: number
          gst_rate?: number
          id?: boolean
          treasurer_email?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          float_cents?: number
          gst_rate?: number
          id?: boolean
          treasurer_email?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          item_id: string
          note: string | null
          purchase_line_id: string | null
          qty: number
          reason: Database['public']['Enums']['movement_reason']
          refund_id: string | null
          sale_day_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          item_id: string
          note?: string | null
          purchase_line_id?: string | null
          qty: number
          reason: Database['public']['Enums']['movement_reason']
          refund_id?: string | null
          sale_day_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          item_id?: string
          note?: string | null
          purchase_line_id?: string | null
          qty?: number
          reason?: Database['public']['Enums']['movement_reason']
          refund_id?: string | null
          sale_day_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'stock_movements_item_id_fkey'
            columns: ['item_id']
            isOneToOne: false
            referencedRelation: 'item_overview'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'stock_movements_item_id_fkey'
            columns: ['item_id']
            isOneToOne: false
            referencedRelation: 'item_stock'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'stock_movements_item_id_fkey'
            columns: ['item_id']
            isOneToOne: false
            referencedRelation: 'items'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'stock_movements_purchase_line_id_fkey'
            columns: ['purchase_line_id']
            isOneToOne: false
            referencedRelation: 'claim_lines'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'stock_movements_purchase_line_id_fkey'
            columns: ['purchase_line_id']
            isOneToOne: false
            referencedRelation: 'purchase_lines'
            referencedColumns: ['id']
          },
        ]
      }
      volunteer_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          created_by: string | null
          display_name: string
          email: string
          full_name: string | null
          id: string
          role: Database['public']['Enums']['user_role']
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by?: string | null
          display_name: string
          email: string
          full_name?: string | null
          id?: string
          role?: Database['public']['Enums']['user_role']
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by?: string | null
          display_name?: string
          email?: string
          full_name?: string | null
          id?: string
          role?: Database['public']['Enums']['user_role']
        }
        Relationships: [
          {
            foreignKeyName: 'volunteer_invites_accepted_by_fkey'
            columns: ['accepted_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      change_history: {
        Row: {
          actor_id: string | null
          actor_name: string | null
          at: string | null
          field: string | null
          id: number | null
          item_id: string | null
          item_name: string | null
          new_value: string | null
          old_value: string | null
          sale_day_id: string | null
        }
        Relationships: []
      }
      claim_lines: {
        Row: {
          cents_left: number | null
          cost_cents: number | null
          id: string | null
          item_name: string | null
          line_no: number | null
          pieces: number | null
          pieces_left: number | null
          purchase_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'purchase_lines_purchase_id_fkey'
            columns: ['purchase_id']
            isOneToOne: false
            referencedRelation: 'claims'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'purchase_lines_purchase_id_fkey'
            columns: ['purchase_id']
            isOneToOne: false
            referencedRelation: 'purchases'
            referencedColumns: ['id']
          },
        ]
      }
      claim_refunds: {
        Row: {
          amount_cents: number | null
          created_at: string | null
          created_by_name: string | null
          id: string | null
          note: string | null
          pieces: number | null
          purchase_id: string | null
          purchase_line_id: string | null
          refunded_on: string | null
          slip_path: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'purchase_lines_purchase_id_fkey'
            columns: ['purchase_id']
            isOneToOne: false
            referencedRelation: 'claims'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'purchase_lines_purchase_id_fkey'
            columns: ['purchase_id']
            isOneToOne: false
            referencedRelation: 'purchases'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'purchase_refunds_purchase_line_id_fkey'
            columns: ['purchase_line_id']
            isOneToOne: false
            referencedRelation: 'claim_lines'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'purchase_refunds_purchase_line_id_fkey'
            columns: ['purchase_line_id']
            isOneToOne: false
            referencedRelation: 'purchase_lines'
            referencedColumns: ['id']
          },
        ]
      }
      claims: {
        Row: {
          buyer_id: string | null
          buyer_name: string | null
          claim_label: string | null
          claim_no: number | null
          created_at: string | null
          created_by: string | null
          id: string | null
          net_cents: number | null
          paid_at: string | null
          paid_by: string | null
          payment_ref: string | null
          purchased_on: string | null
          receipt_path: string | null
          refunded_cents: number | null
          status: Database['public']['Enums']['claim_status'] | null
          store: string | null
          total_cents: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'purchases_buyer_id_fkey'
            columns: ['buyer_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'purchases_paid_by_fkey'
            columns: ['paid_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      item_overview: {
        Row: {
          archived: boolean | null
          bundle_size: number | null
          created_at: string | null
          created_by: string | null
          id: string | null
          is_new: boolean | null
          last_bought_by: string | null
          last_bought_on: string | null
          name: string | null
          on_hand: number | null
          price_cents: number | null
          storage: Database['public']['Enums']['storage_kind'] | null
          type: Database['public']['Enums']['item_type'] | null
          unit_cost_cents: number | null
          updated_at: string | null
          updated_by: string | null
          updated_by_name: string | null
          version: number | null
        }
        Relationships: []
      }
      item_stock: {
        Row: {
          archived: boolean | null
          bundle_size: number | null
          created_at: string | null
          created_by: string | null
          id: string | null
          name: string | null
          on_hand: number | null
          price_cents: number | null
          storage: Database['public']['Enums']['storage_kind'] | null
          type: Database['public']['Enums']['item_type'] | null
          unit_cost_cents: number | null
          updated_at: string | null
          updated_by: string | null
          version: number | null
        }
        Relationships: []
      }
      sale_day_cash: {
        Row: {
          close_cents: number | null
          close_note: string | null
          closed_at: string | null
          closed_by_name: string | null
          deposit_cents: number | null
          expected_open_cents: number | null
          left_in_box_cents: number | null
          open_cents: number | null
          open_diff_cents: number | null
          open_note: string | null
          opened_by_name: string | null
          phase: Database['public']['Enums']['sale_phase'] | null
          revenue_cents: number | null
          sale_date: string | null
          sale_day_id: string | null
          selling_at: string | null
        }
        Relationships: []
      }
      type_benchmarks: {
        Row: {
          type: Database['public']['Enums']['item_type'] | null
          usual_cost_cents: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      actor: { Args: Record<PropertyKey, never>; Returns: string }
      add_volunteer: {
        Args: {
          p_email: string
          p_full_name?: string
          p_name: string
          p_role?: Database['public']['Enums']['user_role']
        }
        Returns: Json
      }
      cancel_sale_day: { Args: { p_sale_day: string }; Returns: undefined }
      cents_text: { Args: { p_cents: number }; Returns: string }
      close_sale_day: {
        Args: {
          p_left_in_box_cents: number
          p_note?: string
          p_sale_day: string
        }
        Returns: undefined
      }
      display_name_check: {
        Args: { p_invite: string; p_name: string; p_profile: string }
        Returns: undefined
      }
      full_name_check: { Args: { p_full_name: string }; Returns: undefined }
      has_role: {
        Args: { r: Database['public']['Enums']['user_role'] }
        Returns: boolean
      }
      in_fn: { Args: Record<PropertyKey, never>; Returns: boolean }
      invoke_weekly_treasurer_email: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      is_member: { Args: Record<PropertyKey, never>; Returns: boolean }
      issue_mark_paid_tokens: {
        Args: { p_valid?: string }
        Returns: {
          buyer_id: string
          buyer_name: string
          purchase_ids: string[]
          token: string
          total_cents: number
        }[]
      }
      local_today: { Args: Record<PropertyKey, never>; Returns: string }
      log_purchase: { Args: { p: Json }; Returns: string }
      open_sale_day: { Args: { p_date?: string }; Returns: string }
      redeem_action_token: {
        Args: { p_payment_ref?: string; p_token: string }
        Returns: Json
      }
      refund_purchase_line: {
        Args: {
          p_amount_cents: number
          p_id: string
          p_line: string
          p_note?: string
          p_pieces: number
          p_refunded_on: string
          p_slip_path?: string
        }
        Returns: string
      }
      require_member: { Args: Record<PropertyKey, never>; Returns: undefined }
      set_member_active: {
        Args: { p_active: boolean; p_id: string }
        Returns: undefined
      }
      start_selling: {
        Args: { p_note?: string; p_sale_day: string }
        Returns: undefined
      }
      treasurer_report_week: { Args: { p_now?: string }; Returns: string }
      undo_refund: { Args: { p_id: string }; Returns: undefined }
      update_invite: {
        Args: {
          p_display_name: string
          p_full_name: string
          p_id: string
          p_role: Database['public']['Enums']['user_role']
        }
        Returns: undefined
      }
      update_my_profile: {
        Args: { p_display_name: string; p_full_name?: string }
        Returns: undefined
      }
      update_team_member: {
        Args: {
          p_display_name: string
          p_full_name: string
          p_id: string
          p_role: Database['public']['Enums']['user_role']
        }
        Returns: undefined
      }
      weekly_treasurer_report: {
        Args: { p_week_start?: string }
        Returns: Json
      }
    }
    Enums: {
      cash_count_kind: 'open' | 'close'
      check_reason: 'missing' | 'damaged'
      claim_status: 'to_pay' | 'paid'
      item_type: 'snack' | 'treat'
      movement_reason:
        | 'purchase'
        | 'sold'
        | 'out'
        | 'missing'
        | 'damaged'
        | 'found'
        | 'donated'
        | 'correction'
        | 'returned'
      sale_phase: 'open' | 'closed'
      storage_kind: 'shelf' | 'freezer'
      user_role: 'volunteer' | 'treasurer' | 'admin'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
        DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] &
        DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      cash_count_kind: ['open', 'close'],
      check_reason: ['missing', 'damaged'],
      claim_status: ['to_pay', 'paid'],
      item_type: ['snack', 'treat'],
      movement_reason: [
        'purchase',
        'sold',
        'out',
        'missing',
        'damaged',
        'found',
        'donated',
        'correction',
        'returned',
      ],
      sale_phase: ['open', 'closed'],
      storage_kind: ['shelf', 'freezer'],
      user_role: ['volunteer', 'treasurer', 'admin'],
    },
  },
} as const
