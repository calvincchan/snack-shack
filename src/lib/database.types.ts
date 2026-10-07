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
          qty: number
          sale_day_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          denom_cents: number
          qty?: number
          sale_day_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          denom_cents?: number
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
            referencedRelation: 'insights_sale_days'
            referencedColumns: ['sale_day_id']
          },
          {
            foreignKeyName: 'cash_counts_sale_day_id_fkey'
            columns: ['sale_day_id']
            isOneToOne: false
            referencedRelation: 'sale_day_lineup_totals'
            referencedColumns: ['sale_day_id']
          },
          {
            foreignKeyName: 'cash_counts_sale_day_id_fkey'
            columns: ['sale_day_id']
            isOneToOne: false
            referencedRelation: 'sale_day_totals'
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
          id: string
          role: Database['public']['Enums']['user_role']
        }
        Insert: {
          active?: boolean
          created_at?: string
          display_name: string
          email?: string | null
          id: string
          role?: Database['public']['Enums']['user_role']
        }
        Update: {
          active?: boolean
          created_at?: string
          display_name?: string
          email?: string | null
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
            referencedRelation: 'insights_fading_items'
            referencedColumns: ['item_id']
          },
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
            referencedRelation: 'insights_slowest_item'
            referencedColumns: ['item_id']
          },
          {
            foreignKeyName: 'purchase_lines_item_id_fkey'
            columns: ['item_id']
            isOneToOne: false
            referencedRelation: 'insights_sold_out_items'
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
            referencedRelation: 'item_sale_stats'
            referencedColumns: ['item_id']
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
      sale_day_items: {
        Row: {
          check_count: number | null
          check_reason: Database['public']['Enums']['check_reason'] | null
          item_id: string
          left_count: number | null
          locked_bundle_size: number | null
          locked_price_cents: number | null
          locked_type: Database['public']['Enums']['item_type'] | null
          out_count: number
          sale_day_id: string
          start_count: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          check_count?: number | null
          check_reason?: Database['public']['Enums']['check_reason'] | null
          item_id: string
          left_count?: number | null
          locked_bundle_size?: number | null
          locked_price_cents?: number | null
          locked_type?: Database['public']['Enums']['item_type'] | null
          out_count?: number
          sale_day_id: string
          start_count?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          check_count?: number | null
          check_reason?: Database['public']['Enums']['check_reason'] | null
          item_id?: string
          left_count?: number | null
          locked_bundle_size?: number | null
          locked_price_cents?: number | null
          locked_type?: Database['public']['Enums']['item_type'] | null
          out_count?: number
          sale_day_id?: string
          start_count?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'sale_day_items_item_id_fkey'
            columns: ['item_id']
            isOneToOne: false
            referencedRelation: 'insights_fading_items'
            referencedColumns: ['item_id']
          },
          {
            foreignKeyName: 'sale_day_items_item_id_fkey'
            columns: ['item_id']
            isOneToOne: false
            referencedRelation: 'insights_items'
            referencedColumns: ['item_id']
          },
          {
            foreignKeyName: 'sale_day_items_item_id_fkey'
            columns: ['item_id']
            isOneToOne: false
            referencedRelation: 'insights_slowest_item'
            referencedColumns: ['item_id']
          },
          {
            foreignKeyName: 'sale_day_items_item_id_fkey'
            columns: ['item_id']
            isOneToOne: false
            referencedRelation: 'insights_sold_out_items'
            referencedColumns: ['item_id']
          },
          {
            foreignKeyName: 'sale_day_items_item_id_fkey'
            columns: ['item_id']
            isOneToOne: false
            referencedRelation: 'item_overview'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'sale_day_items_item_id_fkey'
            columns: ['item_id']
            isOneToOne: false
            referencedRelation: 'item_sale_stats'
            referencedColumns: ['item_id']
          },
          {
            foreignKeyName: 'sale_day_items_item_id_fkey'
            columns: ['item_id']
            isOneToOne: false
            referencedRelation: 'item_stock'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'sale_day_items_item_id_fkey'
            columns: ['item_id']
            isOneToOne: false
            referencedRelation: 'items'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'sale_day_items_sale_day_id_fkey'
            columns: ['sale_day_id']
            isOneToOne: false
            referencedRelation: 'insights_sale_days'
            referencedColumns: ['sale_day_id']
          },
          {
            foreignKeyName: 'sale_day_items_sale_day_id_fkey'
            columns: ['sale_day_id']
            isOneToOne: false
            referencedRelation: 'sale_day_lineup_totals'
            referencedColumns: ['sale_day_id']
          },
          {
            foreignKeyName: 'sale_day_items_sale_day_id_fkey'
            columns: ['sale_day_id']
            isOneToOne: false
            referencedRelation: 'sale_day_totals'
            referencedColumns: ['sale_day_id']
          },
          {
            foreignKeyName: 'sale_day_items_sale_day_id_fkey'
            columns: ['sale_day_id']
            isOneToOne: false
            referencedRelation: 'sale_days'
            referencedColumns: ['id']
          },
        ]
      }
      sale_day_signoffs: {
        Row: {
          sale_day_id: string
          signed_at: string
          user_id: string
        }
        Insert: {
          sale_day_id: string
          signed_at?: string
          user_id?: string
        }
        Update: {
          sale_day_id?: string
          signed_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'sale_day_signoffs_sale_day_id_fkey'
            columns: ['sale_day_id']
            isOneToOne: false
            referencedRelation: 'insights_sale_days'
            referencedColumns: ['sale_day_id']
          },
          {
            foreignKeyName: 'sale_day_signoffs_sale_day_id_fkey'
            columns: ['sale_day_id']
            isOneToOne: false
            referencedRelation: 'sale_day_lineup_totals'
            referencedColumns: ['sale_day_id']
          },
          {
            foreignKeyName: 'sale_day_signoffs_sale_day_id_fkey'
            columns: ['sale_day_id']
            isOneToOne: false
            referencedRelation: 'sale_day_totals'
            referencedColumns: ['sale_day_id']
          },
          {
            foreignKeyName: 'sale_day_signoffs_sale_day_id_fkey'
            columns: ['sale_day_id']
            isOneToOne: false
            referencedRelation: 'sale_days'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'sale_day_signoffs_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      sale_days: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          count_started_at: string | null
          created_at: string
          created_by: string | null
          float_cents: number
          helper_credits: number
          id: string
          note: string | null
          phase: Database['public']['Enums']['sale_phase']
          sale_date: string
          started_at: string | null
          started_by: string | null
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          count_started_at?: string | null
          created_at?: string
          created_by?: string | null
          float_cents: number
          helper_credits?: number
          id?: string
          note?: string | null
          phase?: Database['public']['Enums']['sale_phase']
          sale_date: string
          started_at?: string | null
          started_by?: string | null
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          count_started_at?: string | null
          created_at?: string
          created_by?: string | null
          float_cents?: number
          helper_credits?: number
          id?: string
          note?: string | null
          phase?: Database['public']['Enums']['sale_phase']
          sale_date?: string
          started_at?: string | null
          started_by?: string | null
        }
        Relationships: []
      }
      settings: {
        Row: {
          float_cents: number
          gst_rate: number
          id: boolean
          max_items_per_kid: number
          max_treats_per_kid: number
          over_short_ok_cents: number
          over_short_warn_cents: number
          target_sale_days: number
          treasurer_email: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          float_cents?: number
          gst_rate?: number
          id?: boolean
          max_items_per_kid?: number
          max_treats_per_kid?: number
          over_short_ok_cents?: number
          over_short_warn_cents?: number
          target_sale_days?: number
          treasurer_email?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          float_cents?: number
          gst_rate?: number
          id?: boolean
          max_items_per_kid?: number
          max_treats_per_kid?: number
          over_short_ok_cents?: number
          over_short_warn_cents?: number
          target_sale_days?: number
          treasurer_email?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      shopping_trips: {
        Row: {
          created_at: string
          id: string
          planned_for: string | null
          released_at: string | null
          volunteer_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          planned_for?: string | null
          released_at?: string | null
          volunteer_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          planned_for?: string | null
          released_at?: string | null
          volunteer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'shopping_trips_volunteer_id_fkey'
            columns: ['volunteer_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
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
            referencedRelation: 'insights_fading_items'
            referencedColumns: ['item_id']
          },
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
            referencedRelation: 'insights_slowest_item'
            referencedColumns: ['item_id']
          },
          {
            foreignKeyName: 'stock_movements_item_id_fkey'
            columns: ['item_id']
            isOneToOne: false
            referencedRelation: 'insights_sold_out_items'
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
            referencedRelation: 'item_sale_stats'
            referencedColumns: ['item_id']
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
          {
            foreignKeyName: 'stock_movements_sale_day_id_fkey'
            columns: ['sale_day_id']
            isOneToOne: false
            referencedRelation: 'insights_sale_days'
            referencedColumns: ['sale_day_id']
          },
          {
            foreignKeyName: 'stock_movements_sale_day_id_fkey'
            columns: ['sale_day_id']
            isOneToOne: false
            referencedRelation: 'sale_day_lineup_totals'
            referencedColumns: ['sale_day_id']
          },
          {
            foreignKeyName: 'stock_movements_sale_day_id_fkey'
            columns: ['sale_day_id']
            isOneToOne: false
            referencedRelation: 'sale_day_totals'
            referencedColumns: ['sale_day_id']
          },
          {
            foreignKeyName: 'stock_movements_sale_day_id_fkey'
            columns: ['sale_day_id']
            isOneToOne: false
            referencedRelation: 'sale_days'
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
      insights_check_stock_losses: {
        Row: {
          cost_cents: number | null
          items: number | null
          pieces: number | null
        }
        Relationships: []
      }
      insights_fading_items: {
        Row: {
          first_date: string | null
          first_pieces: number | null
          item_id: string | null
          last_date: string | null
          last_pieces: number | null
          name: string | null
        }
        Relationships: []
      }
      insights_items: {
        Row: {
          days_out: number | null
          item_id: string | null
          name: string | null
          pieces_per_day_out: number | null
          pieces_sold: number | null
          sales_cents: number | null
          type: Database['public']['Enums']['item_type'] | null
        }
        Relationships: []
      }
      insights_sale_days: {
        Row: {
          cost_cents: number | null
          counted_cents: number | null
          helper_credits: number | null
          items_out: number | null
          note: string | null
          outside_ok: boolean | null
          over_short_cents: number | null
          pieces_sold: number | null
          profit_cents: number | null
          sale_date: string | null
          sale_day_id: string | null
          sales_cents: number | null
          volunteers: string | null
        }
        Relationships: []
      }
      insights_slowest_item: {
        Row: {
          days_out: number | null
          item_id: string | null
          name: string | null
          pieces_per_day_out: number | null
        }
        Relationships: []
      }
      insights_sold_out_items: {
        Row: {
          days_out: number | null
          item_id: string | null
          name: string | null
          sold_out_days: number | null
        }
        Relationships: []
      }
      insights_term: {
        Row: {
          cost_cents: number | null
          helper_credit_cents: number | null
          margin_pct: number | null
          over_short_cents: number | null
          over_short_ok_cents: number | null
          pieces_per_day: number | null
          pieces_sold: number | null
          profit_cents: number | null
          sale_days: number | null
          sales_cents: number | null
          sales_outside_ok: number | null
          sales_per_day_cents: number | null
        }
        Relationships: []
      }
      insights_treat_share: {
        Row: {
          pieces_sold: number | null
          treat_pct: number | null
          treat_pieces: number | null
        }
        Relationships: []
      }
      item_overview: {
        Row: {
          archived: boolean | null
          bundle_size: number | null
          created_at: string | null
          created_by: string | null
          days_out: number | null
          id: string | null
          is_new: boolean | null
          last_bought_by: string | null
          last_bought_on: string | null
          name: string | null
          on_hand: number | null
          pieces_per_day_out: number | null
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
      item_sale_stats: {
        Row: {
          days_out: number | null
          item_id: string | null
          pieces_per_day_out: number | null
          pieces_sold: number | null
          sales_since_out: number | null
          sold_out_days: number | null
          sold_out_recently: boolean | null
          type: Database['public']['Enums']['item_type'] | null
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
      lineup_options: {
        Row: {
          bundle_size: number | null
          item_id: string | null
          name: string | null
          on_hand: number | null
          price_cents: number | null
          reason: string | null
          score: number | null
          storage: Database['public']['Enums']['storage_kind'] | null
          suggested: boolean | null
          type: Database['public']['Enums']['item_type'] | null
          unit_cost_cents: number | null
        }
        Relationships: []
      }
      sale_day_item_results: {
        Row: {
          check_count: number | null
          check_reason: Database['public']['Enums']['check_reason'] | null
          item_id: string | null
          left_count: number | null
          locked_bundle_size: number | null
          locked_price_cents: number | null
          locked_type: Database['public']['Enums']['item_type'] | null
          out_count: number | null
          phase: Database['public']['Enums']['sale_phase'] | null
          sale_date: string | null
          sale_day_id: string | null
          sales_cents: number | null
          sold_pieces: number | null
          start_count: number | null
          updated_at: string | null
          updated_by: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'sale_day_items_item_id_fkey'
            columns: ['item_id']
            isOneToOne: false
            referencedRelation: 'insights_fading_items'
            referencedColumns: ['item_id']
          },
          {
            foreignKeyName: 'sale_day_items_item_id_fkey'
            columns: ['item_id']
            isOneToOne: false
            referencedRelation: 'insights_items'
            referencedColumns: ['item_id']
          },
          {
            foreignKeyName: 'sale_day_items_item_id_fkey'
            columns: ['item_id']
            isOneToOne: false
            referencedRelation: 'insights_slowest_item'
            referencedColumns: ['item_id']
          },
          {
            foreignKeyName: 'sale_day_items_item_id_fkey'
            columns: ['item_id']
            isOneToOne: false
            referencedRelation: 'insights_sold_out_items'
            referencedColumns: ['item_id']
          },
          {
            foreignKeyName: 'sale_day_items_item_id_fkey'
            columns: ['item_id']
            isOneToOne: false
            referencedRelation: 'item_overview'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'sale_day_items_item_id_fkey'
            columns: ['item_id']
            isOneToOne: false
            referencedRelation: 'item_sale_stats'
            referencedColumns: ['item_id']
          },
          {
            foreignKeyName: 'sale_day_items_item_id_fkey'
            columns: ['item_id']
            isOneToOne: false
            referencedRelation: 'item_stock'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'sale_day_items_item_id_fkey'
            columns: ['item_id']
            isOneToOne: false
            referencedRelation: 'items'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'sale_day_items_sale_day_id_fkey'
            columns: ['sale_day_id']
            isOneToOne: false
            referencedRelation: 'insights_sale_days'
            referencedColumns: ['sale_day_id']
          },
          {
            foreignKeyName: 'sale_day_items_sale_day_id_fkey'
            columns: ['sale_day_id']
            isOneToOne: false
            referencedRelation: 'sale_day_lineup_totals'
            referencedColumns: ['sale_day_id']
          },
          {
            foreignKeyName: 'sale_day_items_sale_day_id_fkey'
            columns: ['sale_day_id']
            isOneToOne: false
            referencedRelation: 'sale_day_totals'
            referencedColumns: ['sale_day_id']
          },
          {
            foreignKeyName: 'sale_day_items_sale_day_id_fkey'
            columns: ['sale_day_id']
            isOneToOne: false
            referencedRelation: 'sale_days'
            referencedColumns: ['id']
          },
        ]
      }
      sale_day_lineup: {
        Row: {
          bundle_size: number | null
          check_count: number | null
          check_reason: Database['public']['Enums']['check_reason'] | null
          expected_count: number | null
          item_id: string | null
          name: string | null
          price_cents: number | null
          rate: number | null
          sale_day_id: string | null
          start_count: number | null
          storage: Database['public']['Enums']['storage_kind'] | null
          type: Database['public']['Enums']['item_type'] | null
          unit_cost_cents: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'sale_day_items_item_id_fkey'
            columns: ['item_id']
            isOneToOne: false
            referencedRelation: 'insights_fading_items'
            referencedColumns: ['item_id']
          },
          {
            foreignKeyName: 'sale_day_items_item_id_fkey'
            columns: ['item_id']
            isOneToOne: false
            referencedRelation: 'insights_items'
            referencedColumns: ['item_id']
          },
          {
            foreignKeyName: 'sale_day_items_item_id_fkey'
            columns: ['item_id']
            isOneToOne: false
            referencedRelation: 'insights_slowest_item'
            referencedColumns: ['item_id']
          },
          {
            foreignKeyName: 'sale_day_items_item_id_fkey'
            columns: ['item_id']
            isOneToOne: false
            referencedRelation: 'insights_sold_out_items'
            referencedColumns: ['item_id']
          },
          {
            foreignKeyName: 'sale_day_items_item_id_fkey'
            columns: ['item_id']
            isOneToOne: false
            referencedRelation: 'item_overview'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'sale_day_items_item_id_fkey'
            columns: ['item_id']
            isOneToOne: false
            referencedRelation: 'item_sale_stats'
            referencedColumns: ['item_id']
          },
          {
            foreignKeyName: 'sale_day_items_item_id_fkey'
            columns: ['item_id']
            isOneToOne: false
            referencedRelation: 'item_stock'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'sale_day_items_item_id_fkey'
            columns: ['item_id']
            isOneToOne: false
            referencedRelation: 'items'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'sale_day_items_sale_day_id_fkey'
            columns: ['sale_day_id']
            isOneToOne: false
            referencedRelation: 'insights_sale_days'
            referencedColumns: ['sale_day_id']
          },
          {
            foreignKeyName: 'sale_day_items_sale_day_id_fkey'
            columns: ['sale_day_id']
            isOneToOne: false
            referencedRelation: 'sale_day_lineup_totals'
            referencedColumns: ['sale_day_id']
          },
          {
            foreignKeyName: 'sale_day_items_sale_day_id_fkey'
            columns: ['sale_day_id']
            isOneToOne: false
            referencedRelation: 'sale_day_totals'
            referencedColumns: ['sale_day_id']
          },
          {
            foreignKeyName: 'sale_day_items_sale_day_id_fkey'
            columns: ['sale_day_id']
            isOneToOne: false
            referencedRelation: 'sale_days'
            referencedColumns: ['id']
          },
        ]
      }
      sale_day_lineup_totals: {
        Row: {
          day_no: number | null
          float_cents: number | null
          items_off: number | null
          margin: number | null
          phase: Database['public']['Enums']['sale_phase'] | null
          sale_date: string | null
          sale_day_id: string | null
          snacks: number | null
          treats: number | null
        }
        Relationships: []
      }
      sale_day_totals: {
        Row: {
          counted_cents: number | null
          deposit_cents: number | null
          expected_cents: number | null
          float_cents: number | null
          helper_credits: number | null
          items_over_start: number | null
          items_uncounted: number | null
          over_short_cents: number | null
          phase: Database['public']['Enums']['sale_phase'] | null
          pieces_sold: number | null
          sale_date: string | null
          sale_day_id: string | null
          sales_cents: number | null
          signoffs: number | null
          treat_pieces_sold: number | null
        }
        Relationships: []
      }
      stock_by_type: {
        Row: {
          buy_pieces: number | null
          on_hand: number | null
          sale_days_left: number | null
          sold_per_sale_day: number | null
          target_pieces: number | null
          type: Database['public']['Enums']['item_type'] | null
        }
        Relationships: []
      }
      type_benchmarks: {
        Row: {
          pieces_per_day_out: number | null
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
          p_name: string
          p_role?: Database['public']['Enums']['user_role']
        }
        Returns: Json
      }
      begin_count: { Args: { p_sale_day: string }; Returns: undefined }
      cents_text: { Args: { p_cents: number }; Returns: string }
      close_sale_day: { Args: { p_sale_day: string }; Returns: undefined }
      create_sale_day: { Args: { p_date?: string }; Returns: string }
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
      log_purchase: { Args: { p: Json }; Returns: string }
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
      sign_off: { Args: { p_sale_day: string }; Returns: undefined }
      start_sale: {
        Args: { p_float_cents?: number; p_sale_day: string }
        Returns: undefined
      }
      suggest_lineup: {
        Args: Record<PropertyKey, never>
        Returns: {
          item_id: string
          reason: string
          score: number
          suggested: boolean
          type: Database['public']['Enums']['item_type']
        }[]
      }
      treasurer_report_week: { Args: { p_now?: string }; Returns: string }
      undo_refund: { Args: { p_id: string }; Returns: undefined }
      weekly_treasurer_report: {
        Args: { p_week_start?: string }
        Returns: Json
      }
    }
    Enums: {
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
      sale_phase: 'lineup' | 'selling' | 'counting' | 'closed'
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
      sale_phase: ['lineup', 'selling', 'counting', 'closed'],
      storage_kind: ['shelf', 'freezer'],
      user_role: ['volunteer', 'treasurer', 'admin'],
    },
  },
} as const
