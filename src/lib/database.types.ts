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
        ComputedFields: never
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
        ComputedFields: never
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
      claim_sends: {
        Row: {
          claim_count: number
          id: string
          sent_at: string
          sent_by: string
          sent_to: string
          total_cents: number
        }
        ComputedFields: never
        Insert: {
          claim_count: number
          id?: string
          sent_at?: string
          sent_by: string
          sent_to: string
          total_cents: number
        }
        Update: {
          claim_count?: number
          id?: string
          sent_at?: string
          sent_by?: string
          sent_to?: string
          total_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: 'claim_sends_sent_by_fkey'
            columns: ['sent_by']
            isOneToOne: false
            referencedRelation: 'profiles'
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
        ComputedFields: never
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
        ComputedFields: never
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
        ComputedFields: never
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
            referencedRelation: 'insights_items'
            referencedColumns: ['item_id']
          },
          {
            foreignKeyName: 'purchase_lines_item_id_fkey'
            columns: ['item_id']
            isOneToOne: false
            referencedRelation: 'insights_low_margin_items'
            referencedColumns: ['item_id']
          },
          {
            foreignKeyName: 'purchase_lines_item_id_fkey'
            columns: ['item_id']
            isOneToOne: false
            referencedRelation: 'insights_slowest_item'
            referencedColumns: ['item_id']
          },
          {
            foreignKeyName: 'purchase_lines_item_id_fkey'
            columns: ['item_id']
            isOneToOne: false
            referencedRelation: 'item_counts'
            referencedColumns: ['item_id']
          },
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
        ComputedFields: never
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
          payment_note: string | null
          purchased_on: string
          receipt_path: string
          status: Database['public']['Enums']['claim_status']
          store: string
        }
        ComputedFields: never
        Insert: {
          buyer_id: string
          claim_no?: never
          created_at?: string
          created_by?: string | null
          id?: string
          paid_at?: string | null
          paid_by?: string | null
          payment_note?: string | null
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
          payment_note?: string | null
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
        ComputedFields: never
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
        ComputedFields: never
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
          seq: number
        }
        ComputedFields: never
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
          seq?: never
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
          seq?: never
        }
        Relationships: [
          {
            foreignKeyName: 'stock_movements_item_id_fkey'
            columns: ['item_id']
            isOneToOne: false
            referencedRelation: 'insights_items'
            referencedColumns: ['item_id']
          },
          {
            foreignKeyName: 'stock_movements_item_id_fkey'
            columns: ['item_id']
            isOneToOne: false
            referencedRelation: 'insights_low_margin_items'
            referencedColumns: ['item_id']
          },
          {
            foreignKeyName: 'stock_movements_item_id_fkey'
            columns: ['item_id']
            isOneToOne: false
            referencedRelation: 'insights_slowest_item'
            referencedColumns: ['item_id']
          },
          {
            foreignKeyName: 'stock_movements_item_id_fkey'
            columns: ['item_id']
            isOneToOne: false
            referencedRelation: 'item_counts'
            referencedColumns: ['item_id']
          },
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
        ComputedFields: never
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
        ComputedFields: never
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
        ComputedFields: never
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
        ComputedFields: never
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
          buyer_full_name: string | null
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
          payment_note: string | null
          purchased_on: string | null
          receipt_path: string | null
          refunded_cents: number | null
          status: Database['public']['Enums']['claim_status'] | null
          store: string | null
          total_cents: number | null
        }
        ComputedFields: never
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
      insights_best_month: {
        Row: {
          claims_cents: number | null
          difference_cents: number | null
          month: string | null
          revenue_cents: number | null
        }
        ComputedFields: never
        Relationships: []
      }
      insights_items: {
        Row: {
          bundle_size: number | null
          item_id: string | null
          last_counted_at: string | null
          margin: number | null
          name: string | null
          pieces_gone: number | null
          price_cents: number | null
          revenue_estimate_cents: number | null
          unit_cost_cents: number | null
        }
        ComputedFields: never
        Relationships: []
      }
      insights_low_margin_items: {
        Row: {
          bought_since: number | null
          item_id: string | null
          margin: number | null
          name: string | null
        }
        ComputedFields: never
        Relationships: []
      }
      insights_months: {
        Row: {
          claims_cents: number | null
          difference_cents: number | null
          month: string | null
          revenue_cents: number | null
        }
        ComputedFields: never
        Relationships: []
      }
      insights_open_count_off: {
        Row: {
          sale_days: number | null
        }
        ComputedFields: never
        Relationships: []
      }
      insights_revenue_trend: {
        Row: {
          difference_cents: number | null
          revenue_cents: number | null
          sale_date: string | null
          usual_cents: number | null
        }
        ComputedFields: never
        Relationships: []
      }
      insights_slowest_item: {
        Row: {
          item_id: string | null
          name: string | null
          pieces_gone: number | null
        }
        ComputedFields: never
        Relationships: []
      }
      insights_term: {
        Row: {
          claims_cents: number | null
          difference_cents: number | null
          revenue_cents: number | null
          revenue_per_day_cents: number | null
          sale_days: number | null
        }
        ComputedFields: never
        Relationships: []
      }
      item_counts: {
        Row: {
          bought_since: number | null
          item_id: string | null
          last_counted_at: string | null
          last_counted_pieces: number | null
          pieces_gone: number | null
        }
        ComputedFields: never
        Relationships: []
      }
      item_overview: {
        Row: {
          archived: boolean | null
          bought_since: number | null
          bundle_size: number | null
          created_at: string | null
          created_by: string | null
          id: string | null
          is_new: boolean | null
          last_bought_by: string | null
          last_bought_on: string | null
          last_counted_at: string | null
          last_counted_pieces: number | null
          name: string | null
          on_hand: number | null
          pieces_gone: number | null
          price_cents: number | null
          storage: Database['public']['Enums']['storage_kind'] | null
          type: Database['public']['Enums']['item_type'] | null
          unit_cost_cents: number | null
          updated_at: string | null
          updated_by: string | null
          updated_by_name: string | null
          version: number | null
        }
        ComputedFields: never
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
        ComputedFields: never
        Relationships: []
      }
      last_claims_send: {
        Row: {
          claim_count: number | null
          id: string | null
          sent_at: string | null
          sent_by_name: string | null
          sent_to: string | null
          total_cents: number | null
        }
        ComputedFields: never
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
        ComputedFields: never
        Relationships: []
      }
      type_benchmarks: {
        Row: {
          type: Database['public']['Enums']['item_type'] | null
          usual_cost_cents: number | null
        }
        ComputedFields: never
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
      claims_report: { Args: Record<PropertyKey, never>; Returns: Json }
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
      is_member: { Args: Record<PropertyKey, never>; Returns: boolean }
      local_today: { Args: Record<PropertyKey, never>; Returns: string }
      log_purchase: { Args: { p: Json }; Returns: string }
      mark_claim_unpaid: { Args: { p_purchase_id: string }; Returns: undefined }
      mark_claims_paid: {
        Args: {
          p_expected_cents: number
          p_note?: string
          p_paid_on: string
          p_purchase_ids: string[]
        }
        Returns: number
      }
      open_sale_day: { Args: { p_date?: string }; Returns: string }
      record_claims_send: {
        Args: {
          p_claim_count: number
          p_sent_to: string
          p_total_cents: number
        }
        Returns: string
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
      require_coordinator: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      require_member: { Args: Record<PropertyKey, never>; Returns: undefined }
      save_stock_count: { Args: { p_counts: Json }; Returns: number }
      set_member_active: {
        Args: { p_active: boolean; p_id: string }
        Returns: undefined
      }
      start_selling: {
        Args: { p_note?: string; p_sale_day: string }
        Returns: undefined
      }
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
        | 'count'
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
        'count',
      ],
      sale_phase: ['open', 'closed'],
      storage_kind: ['shelf', 'freezer'],
      user_role: ['volunteer', 'treasurer', 'admin'],
    },
  },
} as const
