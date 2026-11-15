import type { NutritionGoals } from './goals.js'

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      food_entries: {
        Row: {
          log_method?: string | null
          confidence?: string | null
          estimate_notes?: string
          logged_via?: string
          id: string
          user_id: string
          icon: string
          icon_bg: string
          icon_color: string
          name: string
          description: string
          calories: number
          protein: number
          carbs: number
          caffeine: number
          fat: number
          fiber: number
          created_at: string
          entry_date: string
          recipe_id: string | null
          servings_logged: number | null
          portion_unit: string | null
          portion_quantity: number | null
          reference_weight_grams: number | null
        }
        Insert: {
          log_method?: string | null
          confidence?: string | null
          estimate_notes?: string
          logged_via?: string
          id?: string
          user_id: string
          icon?: string
          icon_bg?: string
          icon_color?: string
          name: string
          description?: string
          calories: number
          protein: number
          carbs?: number
          caffeine?: number
          fat?: number
          fiber?: number
          created_at?: string
          entry_date?: string
          recipe_id?: string | null
          servings_logged?: number | null
          portion_unit?: string | null
          portion_quantity?: number | null
          reference_weight_grams?: number | null
        }
        Update: {
          log_method?: string | null
          confidence?: string | null
          estimate_notes?: string
          logged_via?: string
          id?: string
          user_id?: string
          icon?: string
          icon_bg?: string
          icon_color?: string
          name?: string
          description?: string
          calories?: number
          protein?: number
          carbs?: number
          caffeine?: number
          fat?: number
          fiber?: number
          created_at?: string
          entry_date?: string
          recipe_id?: string | null
          servings_logged?: number | null
          portion_unit?: string | null
          portion_quantity?: number | null
          reference_weight_grams?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'food_entries_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'food_entries_recipe_id_fkey'
            columns: ['recipe_id']
            isOneToOne: false
            referencedRelation: 'recipes'
            referencedColumns: ['id']
          },
        ]
      }
      recipes: {
        Row: {
          id: string
          user_id: string
          name: string
          description: string
          icon: string
          icon_bg: string
          icon_color: string
          default_servings: number
          serving_weight_grams: number | null
          forked_from_recipe_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          description?: string
          icon?: string
          icon_bg?: string
          icon_color?: string
          default_servings?: number
          serving_weight_grams?: number | null
          forked_from_recipe_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          description?: string
          icon?: string
          icon_bg?: string
          icon_color?: string
          default_servings?: number
          serving_weight_grams?: number | null
          forked_from_recipe_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'recipes_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      recipe_ingredients: {
        Row: {
          id: string
          recipe_id: string
          user_id: string
          sort_order: number
          name: string
          amount: string
          ingredient_id: string | null
          amount_grams: number | null
          calories: number
          protein: number
          carbs: number
          fat: number
          fiber: number
          caffeine: number
          created_at: string
        }
        Insert: {
          id?: string
          recipe_id: string
          user_id: string
          sort_order?: number
          name: string
          amount?: string
          ingredient_id?: string | null
          amount_grams?: number | null
          calories?: number
          protein?: number
          carbs?: number
          fat?: number
          fiber?: number
          caffeine?: number
          created_at?: string
        }
        Update: {
          id?: string
          recipe_id?: string
          user_id?: string
          sort_order?: number
          name?: string
          amount?: string
          ingredient_id?: string | null
          amount_grams?: number | null
          calories?: number
          protein?: number
          carbs?: number
          fat?: number
          fiber?: number
          caffeine?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'recipe_ingredients_recipe_id_fkey'
            columns: ['recipe_id']
            isOneToOne: false
            referencedRelation: 'recipes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'recipe_ingredients_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'recipe_ingredients_ingredient_id_fkey'
            columns: ['ingredient_id']
            isOneToOne: false
            referencedRelation: 'ingredients'
            referencedColumns: ['id']
          },
        ]
      }
      activities: {
        Row: {
          source?: string
          external_id?: string | null
          log_method?: string | null
          intensity?: string | null
          confidence?: string | null
          estimate_notes?: string
          counted_in_device_total?: boolean
          synced_at?: string | null
          id: string
          user_id: string
          name: string
          activity_type: string
          activity_date: string
          distance_meters: number | null
          moving_time_seconds: number
          average_heartrate: number | null
          max_heartrate: number | null
          calories: number | null
          workout_id: string | null
          workout_sets_logged: number | string | null
          created_at: string
        }
        Insert: {
          source?: string
          external_id?: string | null
          log_method?: string | null
          intensity?: string | null
          confidence?: string | null
          estimate_notes?: string
          counted_in_device_total?: boolean
          synced_at?: string | null
          id?: string
          user_id: string
          name: string
          activity_type: string
          activity_date?: string
          distance_meters?: number | null
          moving_time_seconds: number
          average_heartrate?: number | null
          max_heartrate?: number | null
          calories?: number | null
          workout_id?: string | null
          workout_sets_logged?: number | string | null
          created_at?: string
        }
        Update: {
          source?: string
          external_id?: string | null
          log_method?: string | null
          intensity?: string | null
          confidence?: string | null
          estimate_notes?: string
          counted_in_device_total?: boolean
          synced_at?: string | null
          id?: string
          user_id?: string
          name?: string
          activity_type?: string
          activity_date?: string
          distance_meters?: number | null
          moving_time_seconds?: number
          average_heartrate?: number | null
          max_heartrate?: number | null
          calories?: number | null
          workout_id?: string | null
          workout_sets_logged?: number | string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'activities_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'activities_workout_id_fkey'
            columns: ['workout_id']
            isOneToOne: false
            referencedRelation: 'workouts'
            referencedColumns: ['id']
          },
        ]
      }
      workouts: {
        Row: {
          id: string
          user_id: string
          name: string
          description: string
          icon: string
          icon_bg: string
          icon_color: string
          default_duration_minutes: number | null
          default_calories: number | null
          forked_from_workout_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          description?: string
          icon?: string
          icon_bg?: string
          icon_color?: string
          default_duration_minutes?: number | null
          default_calories?: number | null
          forked_from_workout_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          description?: string
          icon?: string
          icon_bg?: string
          icon_color?: string
          default_duration_minutes?: number | null
          default_calories?: number | null
          forked_from_workout_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'workouts_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      workout_exercises: {
        Row: {
          id: string
          workout_id: string
          user_id: string
          sort_order: number
          name: string
          target_reps: number
          created_at: string
        }
        Insert: {
          id?: string
          workout_id: string
          user_id: string
          sort_order?: number
          name: string
          target_reps?: number
          created_at?: string
        }
        Update: {
          id?: string
          workout_id?: string
          user_id?: string
          sort_order?: number
          name?: string
          target_reps?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'workout_exercises_workout_id_fkey'
            columns: ['workout_id']
            isOneToOne: false
            referencedRelation: 'workouts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'workout_exercises_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      activity_exercises: {
        Row: {
          id: string
          activity_id: string
          user_id: string
          workout_exercise_id: string | null
          sort_order: number
          name: string
          reps_completed: number
          created_at: string
        }
        Insert: {
          id?: string
          activity_id: string
          user_id: string
          workout_exercise_id?: string | null
          sort_order?: number
          name: string
          reps_completed: number
          created_at?: string
        }
        Update: {
          id?: string
          activity_id?: string
          user_id?: string
          workout_exercise_id?: string | null
          sort_order?: number
          name?: string
          reps_completed?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'activity_exercises_activity_id_fkey'
            columns: ['activity_id']
            isOneToOne: false
            referencedRelation: 'activities'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'activity_exercises_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'activity_exercises_workout_exercise_id_fkey'
            columns: ['workout_exercise_id']
            isOneToOne: false
            referencedRelation: 'workout_exercises'
            referencedColumns: ['id']
          },
        ]
      }
      recipe_shares: {
        Row: {
          id: string
          recipe_id: string
          owner_id: string
          shared_with_user_id: string
          owner_display_name: string
          shared_with_display_name: string
          saved_copy_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          recipe_id: string
          owner_id: string
          shared_with_user_id: string
          owner_display_name: string
          shared_with_display_name: string
          saved_copy_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          recipe_id?: string
          owner_id?: string
          shared_with_user_id?: string
          owner_display_name?: string
          shared_with_display_name?: string
          saved_copy_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
      workout_shares: {
        Row: {
          id: string
          workout_id: string
          owner_id: string
          shared_with_user_id: string
          owner_display_name: string
          shared_with_display_name: string
          saved_copy_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          workout_id: string
          owner_id: string
          shared_with_user_id: string
          owner_display_name: string
          shared_with_display_name: string
          saved_copy_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          workout_id?: string
          owner_id?: string
          shared_with_user_id?: string
          owner_display_name?: string
          shared_with_display_name?: string
          saved_copy_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
      food_entry_shares: {
        Row: {
          id: string
          food_entry_id: string
          owner_id: string
          shared_with_user_id: string
          owner_display_name: string
          shared_with_display_name: string
          saved_copy_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          food_entry_id: string
          owner_id: string
          shared_with_user_id: string
          owner_display_name: string
          shared_with_display_name: string
          saved_copy_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          food_entry_id?: string
          owner_id?: string
          shared_with_user_id?: string
          owner_display_name?: string
          shared_with_display_name?: string
          saved_copy_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
      activity_shares: {
        Row: {
          id: string
          activity_id: string
          owner_id: string
          shared_with_user_id: string
          owner_display_name: string
          shared_with_display_name: string
          saved_copy_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          activity_id: string
          owner_id: string
          shared_with_user_id: string
          owner_display_name: string
          shared_with_display_name: string
          saved_copy_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          activity_id?: string
          owner_id?: string
          shared_with_user_id?: string
          owner_display_name?: string
          shared_with_display_name?: string
          saved_copy_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          weight_tracking?: boolean
          weight_checkin_days?: number
          weight_checkin_snoozed_until?: string | null
          id: string
          display_name: string
          nutrition_goals: NutritionGoals
          age: number | null
          height_cm: number | null
          weight_kg: number | null
          gender: string
          bmr_override: number | null
          uses_wearable: boolean
          time_zone: string
          created_at: string
        }
        Insert: {
          weight_tracking?: boolean
          weight_checkin_days?: number
          weight_checkin_snoozed_until?: string | null
          id: string
          display_name: string
          nutrition_goals?: NutritionGoals
          age?: number | null
          height_cm?: number | null
          weight_kg?: number | null
          gender?: string
          bmr_override?: number | null
          uses_wearable?: boolean
          time_zone?: string
          created_at?: string
        }
        Update: {
          weight_tracking?: boolean
          weight_checkin_days?: number
          weight_checkin_snoozed_until?: string | null
          id?: string
          display_name?: string
          nutrition_goals?: NutritionGoals
          age?: number | null
          height_cm?: number | null
          weight_kg?: number | null
          gender?: string
          bmr_override?: number | null
          uses_wearable?: boolean
          time_zone?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'profiles_id_fkey'
            columns: ['id']
            isOneToOne: true
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      daily_device_totals: {
        Row: {
          user_id: string
          energy_date: string
          device_total_kcal: number
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          energy_date: string
          device_total_kcal: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          energy_date?: string
          device_total_kcal?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      medications: {
        Row: {
          id: string
          user_id: string
          name: string
          brand_name: string
          strength: string
          interval_hours: number
          how_to_take: string
          schedule: string
          used_for: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          brand_name?: string
          strength?: string
          interval_hours: number
          how_to_take?: string
          schedule?: string
          used_for?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          brand_name?: string
          strength?: string
          interval_hours?: number
          how_to_take?: string
          schedule?: string
          used_for?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'medications_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      medication_doses: {
        Row: {
          id: string
          user_id: string
          medication_id: string
          dose_date: string
          taken_at: string
          notes: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          medication_id: string
          dose_date?: string
          taken_at?: string
          notes?: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          medication_id?: string
          dose_date?: string
          taken_at?: string
          notes?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'medication_doses_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'medication_doses_medication_id_fkey'
            columns: ['medication_id']
            isOneToOne: false
            referencedRelation: 'medications'
            referencedColumns: ['id']
          },
        ]
      }
      ingredients: {
        Row: {
          id: string
          user_id: string
          name: string
          description: string
          icon: string
          icon_bg: string
          icon_color: string
          per_100g_calories: number
          per_100g_protein: number
          per_100g_carbs: number
          per_100g_fat: number
          per_100g_fiber: number
          per_100g_caffeine: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          description?: string
          icon?: string
          icon_bg?: string
          icon_color?: string
          per_100g_calories?: number
          per_100g_protein?: number
          per_100g_carbs?: number
          per_100g_fat?: number
          per_100g_fiber?: number
          per_100g_caffeine?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          description?: string
          icon?: string
          icon_bg?: string
          icon_color?: string
          per_100g_calories?: number
          per_100g_protein?: number
          per_100g_carbs?: number
          per_100g_fat?: number
          per_100g_fiber?: number
          per_100g_caffeine?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'ingredients_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      fitness_connections: {
        Row: {
          user_id: string
          provider: string
          status: string
          scopes: string[]
          external_user_id: string | null
          refresh_token_ciphertext: string
          access_token_ciphertext: string | null
          access_token_expires_at: string | null
          settings: Json
          last_synced_at: string | null
          last_sync_summary: Json | null
          last_error: string | null
          connected_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          provider: string
          status?: string
          scopes?: string[]
          external_user_id?: string | null
          refresh_token_ciphertext: string
          access_token_ciphertext?: string | null
          access_token_expires_at?: string | null
          settings?: Json
          last_synced_at?: string | null
          last_sync_summary?: Json | null
          last_error?: string | null
          connected_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          provider?: string
          status?: string
          scopes?: string[]
          external_user_id?: string | null
          refresh_token_ciphertext?: string
          access_token_ciphertext?: string | null
          access_token_expires_at?: string | null
          settings?: Json
          last_synced_at?: string | null
          last_sync_summary?: Json | null
          last_error?: string | null
          connected_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      daily_metrics: {
        Row: {
          user_id: string
          metric_date: string
          device_total_kcal: number | null
          steps: number | null
          water_ml: number | null
          resting_hr: number | null
          source: string
          updated_at: string
        }
        Insert: {
          user_id: string
          metric_date: string
          device_total_kcal?: number | null
          steps?: number | null
          water_ml?: number | null
          resting_hr?: number | null
          source?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          metric_date?: string
          device_total_kcal?: number | null
          steps?: number | null
          water_ml?: number | null
          resting_hr?: number | null
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      body_measurements: {
        Row: {
          id: string
          user_id: string
          measured_on: string
          measured_at: string
          weight_kg: number | string | null
          body_fat_pct: number | string | null
          waist_cm: number | string | null
          source: string
          note: string
          external_id: string | null
          logged_via: string
        }
        Insert: {
          id?: string
          user_id: string
          measured_on: string
          measured_at?: string
          weight_kg?: number | string | null
          body_fat_pct?: number | string | null
          waist_cm?: number | string | null
          source?: string
          note?: string
          external_id?: string | null
          logged_via?: string
        }
        Update: {
          id?: string
          user_id?: string
          measured_on?: string
          measured_at?: string
          weight_kg?: number | string | null
          body_fat_pct?: number | string | null
          waist_cm?: number | string | null
          source?: string
          note?: string
          external_id?: string | null
          logged_via?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      find_users_for_share: {
        Args: { search_query: string }
        Returns: {
          id: string
          display_name: string
          email_hint: string
        }[]
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
