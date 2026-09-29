


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."check_reason" AS ENUM (
    'missing',
    'damaged'
);


ALTER TYPE "public"."check_reason" OWNER TO "postgres";


CREATE TYPE "public"."claim_status" AS ENUM (
    'to_pay',
    'paid'
);


ALTER TYPE "public"."claim_status" OWNER TO "postgres";


CREATE TYPE "public"."item_type" AS ENUM (
    'snack',
    'treat'
);


ALTER TYPE "public"."item_type" OWNER TO "postgres";


CREATE TYPE "public"."movement_reason" AS ENUM (
    'purchase',
    'sold',
    'out',
    'missing',
    'damaged',
    'found',
    'donated',
    'correction'
);


ALTER TYPE "public"."movement_reason" OWNER TO "postgres";


CREATE TYPE "public"."sale_phase" AS ENUM (
    'lineup',
    'selling',
    'counting',
    'closed'
);


ALTER TYPE "public"."sale_phase" OWNER TO "postgres";


CREATE TYPE "public"."storage_kind" AS ENUM (
    'shelf',
    'freezer'
);


ALTER TYPE "public"."storage_kind" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    'volunteer',
    'treasurer',
    'admin'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."actor"() RETURNS "uuid"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select coalesce(auth.uid(), nullif(current_setting('app.actor', true), '')::uuid)
$$;


ALTER FUNCTION "public"."actor"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_volunteer"("p_email" "text", "p_name" "text", "p_role" "public"."user_role" DEFAULT 'volunteer'::"public"."user_role") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_email text := lower(trim(p_email));
  v_name  text := trim(p_name);
  v_uid   uuid;
begin
  if not public.has_role('admin') then
    raise exception 'Only the coordinator can add volunteers.';
  end if;
  if position('@' in v_email) < 2 then
    raise exception 'Enter an email address.';
  end if;
  if v_name = '' then
    raise exception 'Enter a name.';
  end if;

  select id into v_uid from auth.users where lower(email) = v_email;

  if v_uid is not null then
    insert into public.profiles (id, email, display_name, role, active)
    values (v_uid, v_email, v_name, p_role, true)
    on conflict (id) do update
      set email        = excluded.email,
          display_name = excluded.display_name,
          role         = excluded.role,
          active       = true;
    return jsonb_build_object('status', 'added', 'profile_id', v_uid);
  end if;

  insert into public.volunteer_invites (email, display_name, role)
  values (v_email, v_name, p_role)
  on conflict (lower(email)) where accepted_at is null do update
    set display_name = excluded.display_name,
        role         = excluded.role;
  return jsonb_build_object('status', 'invited');
end $$;


ALTER FUNCTION "public"."add_volunteer"("p_email" "text", "p_name" "text", "p_role" "public"."user_role") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_row"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  pk_cols text[] := tg_argv;   -- primary key column names
  src jsonb := to_jsonb(coalesce(new, old));
  pk text;
begin
  select string_agg(src ->> c, ':') into pk from unnest(pk_cols) c;
  insert into public.audit_log (table_name, row_pk, action, old_data, new_data, actor)
  values (tg_table_name, pk, tg_op,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end,
          public.actor());
  return coalesce(new, old);
end $$;


ALTER FUNCTION "public"."audit_row"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."begin_count"("p_sale_day" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  perform public.require_member();
  perform set_config('snack.fn', 'on', true);
  update public.sale_days set phase = 'counting', count_started_at = now()
   where id = p_sale_day and phase = 'selling';
  if not found then raise exception 'Count-up has already started.'; end if;
  update public.sale_day_items set left_count = start_count
   where sale_day_id = p_sale_day and left_count is null;
  insert into public.cash_counts (sale_day_id, denom_cents)
  select p_sale_day, d from unnest(array[2000, 1000, 500, 200, 100, 25, 10, 5]) d
  on conflict do nothing;
  perform set_config('snack.fn', '', true);
end $$;


ALTER FUNCTION "public"."begin_count"("p_sale_day" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cash_counts_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  ph public.sale_phase;
begin
  select phase into ph from public.sale_days where id = coalesce(new.sale_day_id, old.sale_day_id);
  if public.in_fn() then return coalesce(new, old); end if;
  if ph <> 'counting' then raise exception 'Cash is counted during count-up.'; end if;
  if tg_op <> 'DELETE' then
    new.updated_at := now();
    new.updated_by := public.actor();
  end if;
  return coalesce(new, old);
end $$;


ALTER FUNCTION "public"."cash_counts_guard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clear_signoffs"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if public.in_fn() then return null; end if;
  delete from public.sale_day_signoffs where sale_day_id = coalesce(new.sale_day_id, old.sale_day_id);
  return null;
end $$;


ALTER FUNCTION "public"."clear_signoffs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."close_sale_day"("p_sale_day" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  t record;
begin
  perform public.require_member();
  select * into t from public.sale_day_totals where sale_day_id = p_sale_day;
  if t.phase is distinct from 'counting' then raise exception 'This sale day is not being counted.'; end if;
  if t.signoffs < 1 then raise exception 'A volunteer needs to confirm the count.'; end if;
  if t.items_over_start > 0 then raise exception 'Some items show more left than you started with. Recount them.'; end if;
  if t.items_uncounted > 0 then raise exception 'Some items have no leftover count.'; end if;

  perform set_config('snack.fn', 'on', true);
  update public.sale_days set phase = 'closed', closed_at = now(), closed_by = auth.uid()
   where id = p_sale_day and phase = 'counting';
  if not found then raise exception 'This sale day was already finished.'; end if;

  insert into public.stock_movements (item_id, qty, reason, sale_day_id)
  select item_id, -sold_pieces, 'sold', p_sale_day
  from public.sale_day_item_results where sale_day_id = p_sale_day and sold_pieces > 0;
  insert into public.stock_movements (item_id, qty, reason, sale_day_id)
  select item_id, -out_count, 'out', p_sale_day
  from public.sale_day_items where sale_day_id = p_sale_day and out_count > 0;
  perform set_config('snack.fn', '', true);
end $$;


ALTER FUNCTION "public"."close_sale_day"("p_sale_day" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_sale_day"("p_date" "date" DEFAULT CURRENT_DATE) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_id uuid;
begin
  perform public.require_member();
  perform set_config('snack.fn', 'on', true);
  insert into public.sale_days (sale_date, float_cents)
  select p_date, float_cents from public.settings
  returning id into v_id;
  insert into public.sale_day_items (sale_day_id, item_id)
  select v_id, s.item_id from public.suggest_lineup() s where s.suggested;
  perform set_config('snack.fn', '', true);
  return v_id;
end $$;


ALTER FUNCTION "public"."create_sale_day"("p_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forbid_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  raise exception '% rows cannot be changed. Add a correction instead.', tg_table_name;
end $$;


ALTER FUNCTION "public"."forbid_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_auth_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_email  text := lower(new.email);
  v_invite public.volunteer_invites;
begin
  -- Empty team: whoever signs in first is the coordinator.
  if not exists (select 1 from public.profiles) then
    insert into public.profiles (id, email, display_name, role, active)
    values (new.id, v_email,
            coalesce(nullif(split_part(coalesce(v_email, ''), '@', 1), ''), 'Coordinator'),
            'admin', true)
    on conflict (id) do nothing;
    return new;
  end if;

  select * into v_invite
    from public.volunteer_invites
   where lower(email) = v_email and accepted_at is null
   order by created_at
   limit 1;

  -- No invite: they sign in but see "Ask the coordinator to add you".
  if v_invite.id is null then
    return new;
  end if;

  insert into public.profiles (id, email, display_name, role, active)
  values (new.id, v_email, v_invite.display_name, v_invite.role, true)
  on conflict (id) do nothing;

  update public.volunteer_invites
     set accepted_at = now(), accepted_by = new.id
   where id = v_invite.id;
  return new;
end $$;


ALTER FUNCTION "public"."handle_new_auth_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_role"("r" "public"."user_role") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (select 1 from public.profiles where id = auth.uid() and active and role = r)
$$;


ALTER FUNCTION "public"."has_role"("r" "public"."user_role") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."in_fn"() RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select coalesce(current_setting('snack.fn', true), '') = 'on'
$$;


ALTER FUNCTION "public"."in_fn"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_member"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (select 1 from public.profiles where id = auth.uid() and active)
$$;


ALTER FUNCTION "public"."is_member"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."issue_mark_paid_tokens"("p_valid" interval DEFAULT '7 days'::interval) RETURNS TABLE("buyer_id" "uuid", "buyer_name" "text", "total_cents" integer, "purchase_ids" "uuid"[], "token" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_treasurer uuid;
  r record;
  v_token text;
begin
  select id into v_treasurer from public.profiles where role = 'treasurer' and active limit 1;
  if v_treasurer is null then raise exception 'No active treasurer account.'; end if;
  for r in
    select c.buyer_id, c.buyer_name, sum(c.total_cents)::int as total, array_agg(c.id order by c.claim_no) as ids
    from public.claims c where c.status = 'to_pay'
    group by c.buyer_id, c.buyer_name
  loop
    v_token := encode(extensions.gen_random_bytes(24), 'hex');
    insert into public.action_tokens (token_hash, purpose, payload, issued_to, expires_at)
    values (encode(extensions.digest(v_token, 'sha256'), 'hex'), 'mark_paid',
            jsonb_build_object('buyer_id', r.buyer_id, 'purchase_ids', to_jsonb(r.ids)),
            v_treasurer, now() + p_valid);
    buyer_id := r.buyer_id; buyer_name := r.buyer_name; total_cents := r.total;
    purchase_ids := r.ids; token := v_token;
    return next;
  end loop;
end $$;


ALTER FUNCTION "public"."issue_mark_paid_tokens"("p_valid" interval) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."items_touch"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at := now();
  new.updated_by := public.actor();
  new.version    := old.version + 1;
  return new;
end $$;


ALTER FUNCTION "public"."items_touch"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_purchase"("p" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_id uuid := coalesce((p ->> 'id')::uuid, gen_random_uuid());
  v_line jsonb;
  v_n int := 0;
  v_item uuid;
  v_on_hand int;
  v_cost numeric;
  v_line_id uuid;
begin
  perform public.require_member();
  if exists (select 1 from public.purchases where id = v_id) then return v_id; end if;
  if coalesce(p ->> 'receipt_path', '') = '' then raise exception 'Attach the receipt photo.'; end if;
  if jsonb_array_length(coalesce(p -> 'lines', '[]')) = 0 then raise exception 'Add at least one item.'; end if;

  insert into public.purchases (id, purchased_on, store, buyer_id, receipt_path)
  values (v_id, (p ->> 'purchased_on')::date, p ->> 'store', (p ->> 'buyer_id')::uuid, p ->> 'receipt_path');

  for v_line in select * from jsonb_array_elements(p -> 'lines') loop
    v_n := v_n + 1;
    v_item := (v_line ->> 'item_id')::uuid;
    if v_item is null then
      insert into public.items (name, type, storage)
      values (trim(v_line -> 'new_item' ->> 'name'),
              (v_line -> 'new_item' ->> 'type')::public.item_type,
              coalesce((v_line -> 'new_item' ->> 'storage')::public.storage_kind, 'shelf'))
      returning id into v_item;
    end if;

    select on_hand, unit_cost_cents into v_on_hand, v_cost from public.item_stock where id = v_item;
    v_on_hand := greatest(v_on_hand, 0);
    update public.items
       set unit_cost_cents = round(((v_on_hand * v_cost) + (v_line ->> 'cost_cents')::int)
                                   / (v_on_hand + (v_line ->> 'pieces')::int), 2),
           price_cents = coalesce((v_line ->> 'price_cents')::int, price_cents),
           bundle_size = case when v_line ->> 'price_cents' is not null
                              then coalesce((v_line ->> 'bundle_size')::int, 1) else bundle_size end
     where id = v_item;

    insert into public.purchase_lines (purchase_id, line_no, item_id, pieces, cost_cents)
    values (v_id, v_n, v_item, (v_line ->> 'pieces')::int, (v_line ->> 'cost_cents')::int)
    returning id into v_line_id;
    insert into public.stock_movements (item_id, qty, reason, purchase_line_id)
    values (v_item, (v_line ->> 'pieces')::int, 'purchase', v_line_id);
  end loop;
  return v_id;
end $$;


ALTER FUNCTION "public"."log_purchase"("p" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."profiles_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if old.active and not new.active and new.id = auth.uid() then
    raise exception 'You cannot remove yourself from the team.';
  end if;
  if old.role = 'admin' and old.active
     and (new.role <> 'admin' or not new.active)
     and not exists (select 1 from public.profiles
                      where role = 'admin' and active and id <> old.id) then
    raise exception 'The team needs at least one coordinator.';
  end if;
  return new;
end $$;


ALTER FUNCTION "public"."profiles_guard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."redeem_action_token"("p_token" "text", "p_payment_ref" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  t public.action_tokens;
  v_count int;
begin
  select * into t from public.action_tokens
   where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
   for update;
  if t.id is null then raise exception 'This link is not valid.'; end if;
  if t.used_at is not null then raise exception 'This link has already been used.'; end if;
  if t.expires_at < now() then raise exception 'This link has expired. Use the latest weekly email.'; end if;

  perform set_config('app.actor', t.issued_to::text, true);
  update public.purchases
     set status = 'paid', paid_at = now(), paid_by = t.issued_to,
         payment_ref = coalesce(p_payment_ref, 'E-transfer')
   where id in (select jsonb_array_elements_text(t.payload -> 'purchase_ids')::uuid)
     and status = 'to_pay';
  get diagnostics v_count = row_count;
  update public.action_tokens set used_at = now() where id = t.id;
  return jsonb_build_object('purchases_paid', v_count, 'buyer_id', t.payload ->> 'buyer_id');
end $$;


ALTER FUNCTION "public"."redeem_action_token"("p_token" "text", "p_payment_ref" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."require_member"() RETURNS "void"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not public.is_member() then raise exception 'Not signed in as a Snack Shack volunteer.'; end if;
end $$;


ALTER FUNCTION "public"."require_member"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sale_day_items_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  ph public.sale_phase;
begin
  select phase into ph from public.sale_days where id = coalesce(new.sale_day_id, old.sale_day_id);
  if public.in_fn() then return coalesce(new, old); end if;
  if tg_op in ('INSERT', 'DELETE') then
    if ph <> 'lineup' then raise exception 'The lineup can only change before the sale starts.'; end if;
    if tg_op = 'INSERT' and exists (select 1 from public.items
                                     where id = new.item_id and (price_cents is null or archived)) then
      raise exception 'Only priced, active items can go in a lineup.';
    end if;
    return coalesce(new, old);
  end if;
  if (new.start_count, new.locked_price_cents, new.locked_bundle_size, new.locked_type)
     is distinct from (old.start_count, old.locked_price_cents, old.locked_bundle_size, old.locked_type) then
    raise exception 'Starting counts and locked prices are set by start_sale().';
  end if;
  if (new.check_count, new.check_reason) is distinct from (old.check_count, old.check_reason)
     and ph <> 'lineup' then
    raise exception 'Check stock happens before the sale starts.';
  end if;
  if (new.left_count, new.out_count) is distinct from (old.left_count, old.out_count)
     and ph <> 'counting' then
    raise exception 'Leftover counts are entered during count-up.';
  end if;
  new.updated_at := now();
  new.updated_by := public.actor();
  return new;
end $$;


ALTER FUNCTION "public"."sale_day_items_guard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sale_days_clear_signoffs"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if public.in_fn() then return null; end if;
  if (new.helper_credits) is distinct from (old.helper_credits) then
    delete from public.sale_day_signoffs where sale_day_id = new.id;
  end if;
  return null;
end $$;


ALTER FUNCTION "public"."sale_days_clear_signoffs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sale_days_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if public.in_fn() then return new; end if;
  if old.phase = 'closed' then
    raise exception 'This sale day is closed. Fix mistakes with a stock correction.';
  end if;
  if (new.phase, new.float_cents, new.started_at, new.started_by, new.count_started_at,
      new.closed_at, new.closed_by, new.sale_date)
     is distinct from
     (old.phase, old.float_cents, old.started_at, old.started_by, old.count_started_at,
      old.closed_at, old.closed_by, old.sale_date) then
    raise exception 'Use the sale day functions to change phase.';
  end if;
  if (new.helper_credits, new.note) is distinct from (old.helper_credits, old.note)
     and old.phase <> 'counting' then
    raise exception 'Helper credits and notes are entered during count-up.';
  end if;
  return new;
end $$;


ALTER FUNCTION "public"."sale_days_guard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."settings_touch"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.updated_at := now();
  new.updated_by := public.actor();
  return new;
end $$;


ALTER FUNCTION "public"."settings_touch"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sign_off"("p_sale_day" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  perform public.require_member();
  if not exists (select 1 from public.sale_days where id = p_sale_day and phase = 'counting') then
    raise exception 'Sign-off happens during count-up.';
  end if;
  insert into public.sale_day_signoffs (sale_day_id, user_id) values (p_sale_day, auth.uid())
  on conflict do nothing;
end $$;


ALTER FUNCTION "public"."sign_off"("p_sale_day" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."start_sale"("p_sale_day" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  r record;
  v_diff int;
begin
  perform public.require_member();
  perform set_config('snack.fn', 'on', true);
  update public.sale_days
     set phase = 'selling', started_at = now(), started_by = auth.uid()
   where id = p_sale_day and phase = 'lineup';
  if not found then raise exception 'This sale has already started.'; end if;
  if not exists (select 1 from public.sale_day_items where sale_day_id = p_sale_day) then
    raise exception 'Pick at least one item for the lineup.';
  end if;

  for r in
    select sdi.item_id, sdi.check_count, sdi.check_reason, i.on_hand, i.price_cents, i.bundle_size, i.type, i.name
    from public.sale_day_items sdi
    join public.item_stock i on i.id = sdi.item_id
    where sdi.sale_day_id = p_sale_day
  loop
    if r.price_cents is null then raise exception '% needs a price before it can be sold.', r.name; end if;
    v_diff := coalesce(r.check_count, r.on_hand) - r.on_hand;
    if v_diff < 0 then
      insert into public.stock_movements (item_id, qty, reason, sale_day_id)
      values (r.item_id, v_diff, coalesce(r.check_reason, 'missing')::text::public.movement_reason, p_sale_day);
    elsif v_diff > 0 then
      insert into public.stock_movements (item_id, qty, reason, sale_day_id)
      values (r.item_id, v_diff, 'found', p_sale_day);
    end if;
    update public.sale_day_items
       set start_count = r.on_hand + v_diff,
           locked_price_cents = r.price_cents,
           locked_bundle_size = r.bundle_size,
           locked_type = r.type
     where sale_day_id = p_sale_day and item_id = r.item_id;
  end loop;
  perform set_config('snack.fn', '', true);
end $$;


ALTER FUNCTION "public"."start_sale"("p_sale_day" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."suggest_lineup"() RETURNS TABLE("item_id" "uuid", "type" "public"."item_type", "score" integer, "reason" "text", "suggested" boolean)
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  with s as (
    select st.*, i.on_hand
    from public.item_sale_stats st
    join public.item_stock i on i.id = st.item_id
    where i.price_cents is not null and not i.archived and i.on_hand > 0
  ), avg_rate as (
    select type, avg(pieces_per_day_out) as rate from s where pieces_per_day_out is not null group by type
  ), scored as (
    select s.item_id, s.type,
           (s.days_out = 0) as is_new,
           s.sold_out_recently as sold_out,
           coalesce(s.pieces_per_day_out < 0.6 * a.rate, false) as slow,
           s.sales_since_out
    from s left join avg_rate a on a.type = s.type
  ), ranked as (
    select *,
           (40 * is_new::int + 30 * sold_out::int + 35 * slow::int
            + 10 * least(coalesce(sales_since_out, 5), 5)) as score
    from scored
  ), picked as (
    select *, row_number() over (partition by type order by score desc, item_id) as rk from ranked
  )
  select item_id, type, score,
         case when is_new then 'New'
              when sold_out then 'Sold out lately'
              when slow then 'Slow seller'
              when sales_since_out >= 2 then 'Not out for ' || sales_since_out || ' sales'
         end,
         rk <= case when type = 'snack' then 3 else 2 end
  from picked
  order by type, score desc
$$;


ALTER FUNCTION "public"."suggest_lineup"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."action_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "token_hash" "text" NOT NULL,
    "purpose" "text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "issued_to" "uuid" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "used_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "action_tokens_purpose_check" CHECK (("purpose" = 'mark_paid'::"text"))
);


ALTER TABLE "public"."action_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_log" (
    "id" bigint NOT NULL,
    "table_name" "text" NOT NULL,
    "row_pk" "text" NOT NULL,
    "action" "text" NOT NULL,
    "old_data" "jsonb",
    "new_data" "jsonb",
    "actor" "uuid",
    "at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "audit_log_action_check" CHECK (("action" = ANY (ARRAY['INSERT'::"text", 'UPDATE'::"text", 'DELETE'::"text"])))
);


ALTER TABLE "public"."audit_log" OWNER TO "postgres";


ALTER TABLE "public"."audit_log" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."audit_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."cash_counts" (
    "sale_day_id" "uuid" NOT NULL,
    "denom_cents" integer NOT NULL,
    "qty" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid" DEFAULT "public"."actor"(),
    CONSTRAINT "cash_counts_denom_cents_check" CHECK (("denom_cents" = ANY (ARRAY[2000, 1000, 500, 200, 100, 25, 10, 5]))),
    CONSTRAINT "cash_counts_qty_check" CHECK (("qty" >= 0))
);


ALTER TABLE "public"."cash_counts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "display_name" "text" NOT NULL,
    "role" "public"."user_role" DEFAULT 'volunteer'::"public"."user_role" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "email" "text",
    CONSTRAINT "profiles_display_name_check" CHECK (("length"(TRIM(BOTH FROM "display_name")) > 0))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."purchase_lines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "purchase_id" "uuid" NOT NULL,
    "line_no" integer NOT NULL,
    "item_id" "uuid" NOT NULL,
    "pieces" integer NOT NULL,
    "cost_cents" integer NOT NULL,
    CONSTRAINT "purchase_lines_cost_cents_check" CHECK (("cost_cents" > 0)),
    CONSTRAINT "purchase_lines_pieces_check" CHECK (("pieces" > 0))
);


ALTER TABLE "public"."purchase_lines" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."purchases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "claim_no" integer NOT NULL,
    "purchased_on" "date" NOT NULL,
    "store" "text" NOT NULL,
    "buyer_id" "uuid" NOT NULL,
    "receipt_path" "text" NOT NULL,
    "status" "public"."claim_status" DEFAULT 'to_pay'::"public"."claim_status" NOT NULL,
    "paid_at" timestamp with time zone,
    "paid_by" "uuid",
    "payment_ref" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "public"."actor"(),
    CONSTRAINT "purchases_paid_consistent" CHECK ((("status" = 'paid'::"public"."claim_status") = ("paid_at" IS NOT NULL)))
);


ALTER TABLE "public"."purchases" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."claims" WITH ("security_invoker"='true') AS
 SELECT "p"."id",
    "p"."claim_no",
    "p"."purchased_on",
    "p"."store",
    "p"."buyer_id",
    "p"."receipt_path",
    "p"."status",
    "p"."paid_at",
    "p"."paid_by",
    "p"."payment_ref",
    "p"."created_at",
    "p"."created_by",
    ('SS-'::"text" || "lpad"(("p"."claim_no")::"text", 3, '0'::"text")) AS "claim_label",
    (( SELECT COALESCE("sum"("l"."cost_cents"), (0)::bigint) AS "coalesce"
           FROM "public"."purchase_lines" "l"
          WHERE ("l"."purchase_id" = "p"."id")))::integer AS "total_cents",
    "pr"."display_name" AS "buyer_name"
   FROM ("public"."purchases" "p"
     JOIN "public"."profiles" "pr" ON (("pr"."id" = "p"."buyer_id")));


ALTER VIEW "public"."claims" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "type" "public"."item_type" NOT NULL,
    "storage" "public"."storage_kind" DEFAULT 'shelf'::"public"."storage_kind" NOT NULL,
    "price_cents" integer,
    "bundle_size" integer DEFAULT 1 NOT NULL,
    "unit_cost_cents" numeric(10,2) DEFAULT 0 NOT NULL,
    "archived" boolean DEFAULT false NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "public"."actor"(),
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid" DEFAULT "public"."actor"(),
    CONSTRAINT "items_name_check" CHECK (("length"(TRIM(BOTH FROM "name")) > 0)),
    CONSTRAINT "items_price_option" CHECK ((("price_cents" IS NULL) OR (("price_cents" = 100) AND ("bundle_size" = ANY (ARRAY[1, 2, 3]))) OR (("price_cents" = 200) AND ("bundle_size" = 1)))),
    CONSTRAINT "items_unit_cost_cents_check" CHECK (("unit_cost_cents" >= (0)::numeric))
);


ALTER TABLE "public"."items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sale_day_items" (
    "sale_day_id" "uuid" NOT NULL,
    "item_id" "uuid" NOT NULL,
    "check_count" integer,
    "check_reason" "public"."check_reason",
    "start_count" integer,
    "locked_price_cents" integer,
    "locked_bundle_size" integer,
    "locked_type" "public"."item_type",
    "left_count" integer,
    "out_count" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid" DEFAULT "public"."actor"(),
    CONSTRAINT "sale_day_items_check_count_check" CHECK (("check_count" >= 0)),
    CONSTRAINT "sale_day_items_left_count_check" CHECK (("left_count" >= 0)),
    CONSTRAINT "sale_day_items_out_count_check" CHECK (("out_count" >= 0)),
    CONSTRAINT "sale_day_items_start_count_check" CHECK (("start_count" >= 0))
);


ALTER TABLE "public"."sale_day_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sale_days" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sale_date" "date" NOT NULL,
    "phase" "public"."sale_phase" DEFAULT 'lineup'::"public"."sale_phase" NOT NULL,
    "float_cents" integer NOT NULL,
    "helper_credits" integer DEFAULT 0 NOT NULL,
    "note" "text",
    "started_at" timestamp with time zone,
    "started_by" "uuid",
    "count_started_at" timestamp with time zone,
    "closed_at" timestamp with time zone,
    "closed_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "public"."actor"(),
    CONSTRAINT "sale_days_float_cents_check" CHECK (("float_cents" >= 0)),
    CONSTRAINT "sale_days_helper_credits_check" CHECK (("helper_credits" >= 0))
);


ALTER TABLE "public"."sale_days" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."sale_day_item_results" WITH ("security_invoker"='true') AS
 SELECT "sdi"."sale_day_id",
    "sdi"."item_id",
    "sdi"."check_count",
    "sdi"."check_reason",
    "sdi"."start_count",
    "sdi"."locked_price_cents",
    "sdi"."locked_bundle_size",
    "sdi"."locked_type",
    "sdi"."left_count",
    "sdi"."out_count",
    "sdi"."updated_at",
    "sdi"."updated_by",
    "sd"."sale_date",
    "sd"."phase",
    (("sdi"."start_count" - "sdi"."left_count") - "sdi"."out_count") AS "sold_pieces",
    ("round"(((((("sdi"."start_count" - "sdi"."left_count") - "sdi"."out_count"))::numeric * ("sdi"."locked_price_cents")::numeric) / ("sdi"."locked_bundle_size")::numeric)))::integer AS "sales_cents"
   FROM ("public"."sale_day_items" "sdi"
     JOIN "public"."sale_days" "sd" ON (("sd"."id" = "sdi"."sale_day_id")));


ALTER VIEW "public"."sale_day_item_results" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."item_sale_stats" WITH ("security_invoker"='true') AS
 WITH "closed" AS (
         SELECT "sale_days"."id",
            "row_number"() OVER (ORDER BY "sale_days"."sale_date" DESC, "sale_days"."closed_at" DESC) AS "rn"
           FROM "public"."sale_days"
          WHERE ("sale_days"."phase" = 'closed'::"public"."sale_phase")
        ), "r" AS (
         SELECT "res"."item_id",
            "res"."sold_pieces",
            "res"."left_count",
            "c"."rn"
           FROM ("public"."sale_day_item_results" "res"
             JOIN "closed" "c" ON (("c"."id" = "res"."sale_day_id")))
        )
 SELECT "i"."id" AS "item_id",
    "i"."type",
    ("count"("r"."rn"))::integer AS "days_out",
    (COALESCE("sum"("r"."sold_pieces"), (0)::bigint))::integer AS "pieces_sold",
        CASE
            WHEN ("count"("r"."rn") > 0) THEN (("sum"("r"."sold_pieces"))::numeric / ("count"("r"."rn"))::numeric)
            ELSE NULL::numeric
        END AS "pieces_per_day_out",
    (("min"("r"."rn") - 1))::integer AS "sales_since_out",
    COALESCE("bool_or"((("r"."left_count" = 0) AND ("r"."rn" <= 2))), false) AS "sold_out_recently",
    ("count"("r"."rn") FILTER (WHERE ("r"."left_count" = 0)))::integer AS "sold_out_days"
   FROM ("public"."items" "i"
     LEFT JOIN "r" ON (("r"."item_id" = "i"."id")))
  GROUP BY "i"."id", "i"."type";


ALTER VIEW "public"."item_sale_stats" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."item_stock" AS
SELECT
    NULL::"uuid" AS "id",
    NULL::"text" AS "name",
    NULL::"public"."item_type" AS "type",
    NULL::"public"."storage_kind" AS "storage",
    NULL::integer AS "price_cents",
    NULL::integer AS "bundle_size",
    NULL::numeric(10,2) AS "unit_cost_cents",
    NULL::boolean AS "archived",
    NULL::integer AS "version",
    NULL::timestamp with time zone AS "created_at",
    NULL::"uuid" AS "created_by",
    NULL::timestamp with time zone AS "updated_at",
    NULL::"uuid" AS "updated_by",
    NULL::integer AS "on_hand";


ALTER VIEW "public"."item_stock" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."item_overview" WITH ("security_invoker"='true') AS
 SELECT "s"."id",
    "s"."name",
    "s"."type",
    "s"."storage",
    "s"."price_cents",
    "s"."bundle_size",
    "s"."unit_cost_cents",
    "s"."archived",
    "s"."version",
    "s"."created_at",
    "s"."created_by",
    "s"."updated_at",
    "s"."updated_by",
    "s"."on_hand",
    COALESCE("st"."days_out", 0) AS "days_out",
    (COALESCE("st"."days_out", 0) = 0) AS "is_new",
    "st"."pieces_per_day_out",
    "last_buy"."buyer_name" AS "last_bought_by",
    "last_buy"."purchased_on" AS "last_bought_on",
    "editor"."display_name" AS "updated_by_name"
   FROM ((("public"."item_stock" "s"
     LEFT JOIN "public"."item_sale_stats" "st" ON (("st"."item_id" = "s"."id")))
     LEFT JOIN LATERAL ( SELECT "pr"."display_name" AS "buyer_name",
            "p"."purchased_on"
           FROM (("public"."purchase_lines" "l"
             JOIN "public"."purchases" "p" ON (("p"."id" = "l"."purchase_id")))
             JOIN "public"."profiles" "pr" ON (("pr"."id" = "p"."buyer_id")))
          WHERE ("l"."item_id" = "s"."id")
          ORDER BY "p"."purchased_on" DESC, "p"."claim_no" DESC
         LIMIT 1) "last_buy" ON (true))
     LEFT JOIN "public"."profiles" "editor" ON (("editor"."id" = "s"."updated_by")));


ALTER VIEW "public"."item_overview" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."lineup_options" WITH ("security_invoker"='true') AS
 SELECT "s"."item_id",
    "i"."name",
    "i"."type",
    "i"."storage",
    "i"."price_cents",
    "i"."bundle_size",
    "i"."unit_cost_cents",
    "i"."on_hand",
    "s"."score",
    "s"."reason",
    "s"."suggested"
   FROM ("public"."suggest_lineup"() "s"("item_id", "type", "score", "reason", "suggested")
     JOIN "public"."item_stock" "i" ON (("i"."id" = "s"."item_id")));


ALTER VIEW "public"."lineup_options" OWNER TO "postgres";


ALTER TABLE "public"."purchases" ALTER COLUMN "claim_no" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."purchases_claim_no_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE OR REPLACE VIEW "public"."sale_day_lineup" WITH ("security_invoker"='true') AS
 SELECT "sdi"."sale_day_id",
    "sdi"."item_id",
    "i"."name",
    "i"."storage",
    COALESCE("sdi"."locked_type", "i"."type") AS "type",
    COALESCE("sdi"."locked_price_cents", "i"."price_cents") AS "price_cents",
    COALESCE("sdi"."locked_bundle_size", "i"."bundle_size") AS "bundle_size",
    "i"."unit_cost_cents",
    "i"."on_hand" AS "expected_count",
    "sdi"."check_count",
    "sdi"."check_reason",
    "sdi"."start_count",
    COALESCE("st"."pieces_per_day_out", (15)::numeric) AS "rate"
   FROM (("public"."sale_day_items" "sdi"
     JOIN "public"."item_stock" "i" ON (("i"."id" = "sdi"."item_id")))
     LEFT JOIN "public"."item_sale_stats" "st" ON (("st"."item_id" = "sdi"."item_id")));


ALTER VIEW "public"."sale_day_lineup" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."sale_day_lineup_totals" WITH ("security_invoker"='true') AS
 WITH "numbered" AS (
         SELECT "sale_days"."id",
            "sale_days"."sale_date",
            "sale_days"."phase",
            "sale_days"."float_cents",
            ("row_number"() OVER (ORDER BY "sale_days"."sale_date", "sale_days"."created_at"))::integer AS "day_no"
           FROM "public"."sale_days"
        ), "lineup" AS (
         SELECT "sale_day_lineup"."sale_day_id",
            ("count"(*) FILTER (WHERE ("sale_day_lineup"."type" = 'snack'::"public"."item_type")))::integer AS "snacks",
            ("count"(*) FILTER (WHERE ("sale_day_lineup"."type" = 'treat'::"public"."item_type")))::integer AS "treats",
            ("count"(*) FILTER (WHERE (("sale_day_lineup"."check_count" IS NOT NULL) AND ("sale_day_lineup"."check_count" <> "sale_day_lineup"."expected_count"))))::integer AS "items_off",
            "sum"(("sale_day_lineup"."rate" * "sale_day_lineup"."unit_cost_cents")) AS "cost_weight",
            "sum"((("sale_day_lineup"."rate" * ("sale_day_lineup"."price_cents")::numeric) / ("sale_day_lineup"."bundle_size")::numeric)) AS "price_weight"
           FROM "public"."sale_day_lineup"
          GROUP BY "sale_day_lineup"."sale_day_id"
        )
 SELECT "n"."id" AS "sale_day_id",
    "n"."sale_date",
    "n"."phase",
    "n"."float_cents",
    "n"."day_no",
    COALESCE("l"."snacks", 0) AS "snacks",
    COALESCE("l"."treats", 0) AS "treats",
    COALESCE("l"."items_off", 0) AS "items_off",
        CASE
            WHEN ("l"."price_weight" > (0)::numeric) THEN ((1)::numeric - ("l"."cost_weight" / "l"."price_weight"))
            ELSE NULL::numeric
        END AS "margin"
   FROM ("numbered" "n"
     LEFT JOIN "lineup" "l" ON (("l"."sale_day_id" = "n"."id")));


ALTER VIEW "public"."sale_day_lineup_totals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sale_day_signoffs" (
    "sale_day_id" "uuid" NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "signed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."sale_day_signoffs" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."sale_day_totals" WITH ("security_invoker"='true') AS
 WITH "r" AS (
         SELECT "sale_day_item_results"."sale_day_id",
            (COALESCE("sum"(GREATEST("sale_day_item_results"."sold_pieces", 0)), (0)::bigint))::integer AS "pieces_sold",
            (COALESCE("sum"(GREATEST("sale_day_item_results"."sold_pieces", 0)) FILTER (WHERE ("sale_day_item_results"."locked_type" = 'treat'::"public"."item_type")), (0)::bigint))::integer AS "treat_pieces_sold",
            (COALESCE("sum"(GREATEST("sale_day_item_results"."sales_cents", 0)), (0)::bigint))::integer AS "sales_cents",
            ("count"(*) FILTER (WHERE ("sale_day_item_results"."sold_pieces" < 0)))::integer AS "items_over_start",
            ("count"(*) FILTER (WHERE ("sale_day_item_results"."left_count" IS NULL)))::integer AS "items_uncounted"
           FROM "public"."sale_day_item_results"
          GROUP BY "sale_day_item_results"."sale_day_id"
        ), "c" AS (
         SELECT "cash_counts"."sale_day_id",
            ("sum"(("cash_counts"."denom_cents" * "cash_counts"."qty")))::integer AS "counted_cents"
           FROM "public"."cash_counts"
          GROUP BY "cash_counts"."sale_day_id"
        )
 SELECT "sd"."id" AS "sale_day_id",
    "sd"."sale_date",
    "sd"."phase",
    "sd"."float_cents",
    "sd"."helper_credits",
    COALESCE("r"."pieces_sold", 0) AS "pieces_sold",
    COALESCE("r"."treat_pieces_sold", 0) AS "treat_pieces_sold",
    COALESCE("r"."sales_cents", 0) AS "sales_cents",
    COALESCE("r"."items_over_start", 0) AS "items_over_start",
    COALESCE("r"."items_uncounted", 0) AS "items_uncounted",
    (("sd"."float_cents" + COALESCE("r"."sales_cents", 0)) - ("sd"."helper_credits" * 100)) AS "expected_cents",
    COALESCE("c"."counted_cents", 0) AS "counted_cents",
    (COALESCE("c"."counted_cents", 0) - (("sd"."float_cents" + COALESCE("r"."sales_cents", 0)) - ("sd"."helper_credits" * 100))) AS "over_short_cents",
    (COALESCE("c"."counted_cents", 0) - "sd"."float_cents") AS "deposit_cents",
    (( SELECT "count"(*) AS "count"
           FROM "public"."sale_day_signoffs" "s"
          WHERE ("s"."sale_day_id" = "sd"."id")))::integer AS "signoffs"
   FROM (("public"."sale_days" "sd"
     LEFT JOIN "r" ON (("r"."sale_day_id" = "sd"."id")))
     LEFT JOIN "c" ON (("c"."sale_day_id" = "sd"."id")));


ALTER VIEW "public"."sale_day_totals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."settings" (
    "id" boolean DEFAULT true NOT NULL,
    "float_cents" integer DEFAULT 3000 NOT NULL,
    "target_sale_days" integer DEFAULT 2 NOT NULL,
    "over_short_ok_cents" integer DEFAULT 300 NOT NULL,
    "over_short_warn_cents" integer DEFAULT 1000 NOT NULL,
    "gst_rate" numeric(5,4) DEFAULT 0.05 NOT NULL,
    "max_items_per_kid" integer DEFAULT 3 NOT NULL,
    "max_treats_per_kid" integer DEFAULT 1 NOT NULL,
    "treasurer_email" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid",
    CONSTRAINT "settings_float_cents_check" CHECK (("float_cents" >= 0)),
    CONSTRAINT "settings_id_check" CHECK ("id"),
    CONSTRAINT "settings_target_sale_days_check" CHECK (("target_sale_days" > 0))
);


ALTER TABLE "public"."settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shopping_trips" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "volunteer_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "planned_for" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "released_at" timestamp with time zone
);


ALTER TABLE "public"."shopping_trips" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."stock_by_type" WITH ("security_invoker"='true') AS
 WITH "days" AS (
         SELECT ("count"(*))::integer AS "n"
           FROM "public"."sale_days"
          WHERE ("sale_days"."phase" = 'closed'::"public"."sale_phase")
        ), "sold" AS (
         SELECT "r"."locked_type" AS "type",
            ("sum"(GREATEST("r"."sold_pieces", 0)))::integer AS "pieces"
           FROM ("public"."sale_day_item_results" "r"
             JOIN "public"."sale_days" "d" ON (("d"."id" = "r"."sale_day_id")))
          WHERE ("d"."phase" = 'closed'::"public"."sale_phase")
          GROUP BY "r"."locked_type"
        ), "held" AS (
         SELECT "i"."type",
            (COALESCE("sum"("i"."on_hand"), (0)::bigint))::integer AS "on_hand"
           FROM "public"."item_stock" "i"
          WHERE (NOT "i"."archived")
          GROUP BY "i"."type"
        ), "rate" AS (
         SELECT "t"."type",
            COALESCE("h"."on_hand", 0) AS "on_hand",
                CASE
                    WHEN ("days"."n" > 0) THEN ((COALESCE("s"."pieces", 0))::numeric / ("days"."n")::numeric)
                    ELSE NULL::numeric
                END AS "sold_per_sale_day"
           FROM (((( VALUES ('snack'::"public"."item_type"), ('treat'::"public"."item_type")) "t"("type")
             CROSS JOIN "days")
             LEFT JOIN "sold" "s" ON (("s"."type" = "t"."type")))
             LEFT JOIN "held" "h" ON (("h"."type" = "t"."type")))
        )
 SELECT "rate"."type",
    "rate"."on_hand",
    "rate"."sold_per_sale_day",
    ("ceil"(("rate"."sold_per_sale_day" * ("settings"."target_sale_days")::numeric)))::integer AS "target_pieces",
    GREATEST((("ceil"(("rate"."sold_per_sale_day" * ("settings"."target_sale_days")::numeric)))::integer - "rate"."on_hand"), 0) AS "buy_pieces",
        CASE
            WHEN ("rate"."sold_per_sale_day" > (0)::numeric) THEN (("rate"."on_hand")::numeric / "rate"."sold_per_sale_day")
            ELSE NULL::numeric
        END AS "sale_days_left"
   FROM ("rate"
     CROSS JOIN "public"."settings");


ALTER VIEW "public"."stock_by_type" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stock_movements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "item_id" "uuid" NOT NULL,
    "qty" integer NOT NULL,
    "reason" "public"."movement_reason" NOT NULL,
    "purchase_line_id" "uuid",
    "sale_day_id" "uuid",
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "public"."actor"(),
    CONSTRAINT "stock_movements_qty_check" CHECK (("qty" <> 0)),
    CONSTRAINT "stock_movements_sign" CHECK (((("reason" = ANY (ARRAY['purchase'::"public"."movement_reason", 'found'::"public"."movement_reason"])) AND ("qty" > 0)) OR (("reason" = ANY (ARRAY['sold'::"public"."movement_reason", 'out'::"public"."movement_reason", 'missing'::"public"."movement_reason", 'damaged'::"public"."movement_reason", 'donated'::"public"."movement_reason"])) AND ("qty" < 0)) OR ("reason" = 'correction'::"public"."movement_reason")))
);


ALTER TABLE "public"."stock_movements" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."type_benchmarks" WITH ("security_invoker"='true') AS
 SELECT "type",
    COALESCE(( SELECT "avg"("i"."unit_cost_cents") AS "avg"
           FROM "public"."item_overview" "i"
          WHERE (("i"."type" = "t"."type") AND (NOT "i"."archived") AND (NOT "i"."is_new") AND ("i"."price_cents" IS NOT NULL) AND ("i"."unit_cost_cents" > (0)::numeric))), ( SELECT "avg"("i"."unit_cost_cents") AS "avg"
           FROM "public"."item_overview" "i"
          WHERE (("i"."type" = "t"."type") AND (NOT "i"."archived") AND ("i"."price_cents" IS NOT NULL) AND ("i"."unit_cost_cents" > (0)::numeric)))) AS "usual_cost_cents",
    ( SELECT "avg"("s"."pieces_per_day_out") AS "avg"
           FROM ("public"."item_sale_stats" "s"
             JOIN "public"."items" "i" ON (("i"."id" = "s"."item_id")))
          WHERE (("i"."type" = "t"."type") AND ("s"."pieces_per_day_out" IS NOT NULL))) AS "pieces_per_day_out"
   FROM ( VALUES ('snack'::"public"."item_type"), ('treat'::"public"."item_type")) "t"("type");


ALTER VIEW "public"."type_benchmarks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."volunteer_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "role" "public"."user_role" DEFAULT 'volunteer'::"public"."user_role" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "public"."actor"(),
    "accepted_at" timestamp with time zone,
    "accepted_by" "uuid",
    CONSTRAINT "volunteer_invites_display_name_check" CHECK (("length"(TRIM(BOTH FROM "display_name")) > 0)),
    CONSTRAINT "volunteer_invites_email_check" CHECK ((POSITION(('@'::"text") IN ("email")) > 1))
);


ALTER TABLE "public"."volunteer_invites" OWNER TO "postgres";


ALTER TABLE ONLY "public"."action_tokens"
    ADD CONSTRAINT "action_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."action_tokens"
    ADD CONSTRAINT "action_tokens_token_hash_key" UNIQUE ("token_hash");



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cash_counts"
    ADD CONSTRAINT "cash_counts_pkey" PRIMARY KEY ("sale_day_id", "denom_cents");



ALTER TABLE ONLY "public"."items"
    ADD CONSTRAINT "items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_lines"
    ADD CONSTRAINT "purchase_lines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_lines"
    ADD CONSTRAINT "purchase_lines_purchase_id_line_no_key" UNIQUE ("purchase_id", "line_no");



ALTER TABLE ONLY "public"."purchases"
    ADD CONSTRAINT "purchases_claim_no_key" UNIQUE ("claim_no");



ALTER TABLE ONLY "public"."purchases"
    ADD CONSTRAINT "purchases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sale_day_items"
    ADD CONSTRAINT "sale_day_items_pkey" PRIMARY KEY ("sale_day_id", "item_id");



ALTER TABLE ONLY "public"."sale_day_signoffs"
    ADD CONSTRAINT "sale_day_signoffs_pkey" PRIMARY KEY ("sale_day_id", "user_id");



ALTER TABLE ONLY "public"."sale_days"
    ADD CONSTRAINT "sale_days_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."settings"
    ADD CONSTRAINT "settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shopping_trips"
    ADD CONSTRAINT "shopping_trips_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."volunteer_invites"
    ADD CONSTRAINT "volunteer_invites_pkey" PRIMARY KEY ("id");



CREATE INDEX "audit_log_table_name_row_pk_idx" ON "public"."audit_log" USING "btree" ("table_name", "row_pk");



CREATE UNIQUE INDEX "profiles_email_key" ON "public"."profiles" USING "btree" ("lower"("email"));



CREATE UNIQUE INDEX "sale_days_one_open" ON "public"."sale_days" USING "btree" ((true)) WHERE ("phase" <> 'closed'::"public"."sale_phase");



CREATE UNIQUE INDEX "shopping_trips_one_open" ON "public"."shopping_trips" USING "btree" ((true)) WHERE ("released_at" IS NULL);



CREATE INDEX "stock_movements_item_id_idx" ON "public"."stock_movements" USING "btree" ("item_id");



CREATE INDEX "stock_movements_sale_day_id_idx" ON "public"."stock_movements" USING "btree" ("sale_day_id");



CREATE UNIQUE INDEX "volunteer_invites_open" ON "public"."volunteer_invites" USING "btree" ("lower"("email")) WHERE ("accepted_at" IS NULL);



CREATE OR REPLACE VIEW "public"."item_stock" WITH ("security_invoker"='true') AS
 SELECT "i"."id",
    "i"."name",
    "i"."type",
    "i"."storage",
    "i"."price_cents",
    "i"."bundle_size",
    "i"."unit_cost_cents",
    "i"."archived",
    "i"."version",
    "i"."created_at",
    "i"."created_by",
    "i"."updated_at",
    "i"."updated_by",
    (COALESCE("sum"("m"."qty"), (0)::bigint))::integer AS "on_hand"
   FROM ("public"."items" "i"
     LEFT JOIN "public"."stock_movements" "m" ON (("m"."item_id" = "i"."id")))
  GROUP BY "i"."id";



CREATE OR REPLACE TRIGGER "audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."cash_counts" FOR EACH ROW EXECUTE FUNCTION "public"."audit_row"('sale_day_id', 'denom_cents');



CREATE OR REPLACE TRIGGER "audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."items" FOR EACH ROW EXECUTE FUNCTION "public"."audit_row"('id');



CREATE OR REPLACE TRIGGER "audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."audit_row"('id');



CREATE OR REPLACE TRIGGER "audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."purchase_lines" FOR EACH ROW EXECUTE FUNCTION "public"."audit_row"('id');



CREATE OR REPLACE TRIGGER "audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."purchases" FOR EACH ROW EXECUTE FUNCTION "public"."audit_row"('id');



CREATE OR REPLACE TRIGGER "audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."sale_day_items" FOR EACH ROW EXECUTE FUNCTION "public"."audit_row"('sale_day_id', 'item_id');



CREATE OR REPLACE TRIGGER "audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."sale_day_signoffs" FOR EACH ROW EXECUTE FUNCTION "public"."audit_row"('sale_day_id', 'user_id');



CREATE OR REPLACE TRIGGER "audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."sale_days" FOR EACH ROW EXECUTE FUNCTION "public"."audit_row"('id');



CREATE OR REPLACE TRIGGER "audit" AFTER UPDATE ON "public"."settings" FOR EACH ROW EXECUTE FUNCTION "public"."audit_row"('id');



CREATE OR REPLACE TRIGGER "audit" AFTER INSERT ON "public"."stock_movements" FOR EACH ROW EXECUTE FUNCTION "public"."audit_row"('id');



CREATE OR REPLACE TRIGGER "audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."volunteer_invites" FOR EACH ROW EXECUTE FUNCTION "public"."audit_row"('id');



CREATE OR REPLACE TRIGGER "cash_counts_guard" BEFORE INSERT OR DELETE OR UPDATE ON "public"."cash_counts" FOR EACH ROW EXECUTE FUNCTION "public"."cash_counts_guard"();



CREATE OR REPLACE TRIGGER "clear_signoffs" AFTER INSERT OR DELETE OR UPDATE ON "public"."cash_counts" FOR EACH ROW EXECUTE FUNCTION "public"."clear_signoffs"();



CREATE OR REPLACE TRIGGER "clear_signoffs" AFTER INSERT OR DELETE OR UPDATE ON "public"."sale_day_items" FOR EACH ROW EXECUTE FUNCTION "public"."clear_signoffs"();



CREATE OR REPLACE TRIGGER "clear_signoffs" AFTER UPDATE ON "public"."sale_days" FOR EACH ROW EXECUTE FUNCTION "public"."sale_days_clear_signoffs"();



CREATE OR REPLACE TRIGGER "items_touch" BEFORE UPDATE ON "public"."items" FOR EACH ROW EXECUTE FUNCTION "public"."items_touch"();



CREATE OR REPLACE TRIGGER "profiles_guard" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."profiles_guard"();



CREATE OR REPLACE TRIGGER "sale_day_items_guard" BEFORE INSERT OR DELETE OR UPDATE ON "public"."sale_day_items" FOR EACH ROW EXECUTE FUNCTION "public"."sale_day_items_guard"();



CREATE OR REPLACE TRIGGER "sale_days_guard" BEFORE UPDATE ON "public"."sale_days" FOR EACH ROW EXECUTE FUNCTION "public"."sale_days_guard"();



CREATE OR REPLACE TRIGGER "settings_touch" BEFORE UPDATE ON "public"."settings" FOR EACH ROW EXECUTE FUNCTION "public"."settings_touch"();



CREATE OR REPLACE TRIGGER "stock_movements_append_only" BEFORE DELETE OR UPDATE ON "public"."stock_movements" FOR EACH ROW EXECUTE FUNCTION "public"."forbid_change"();



ALTER TABLE ONLY "public"."action_tokens"
    ADD CONSTRAINT "action_tokens_issued_to_fkey" FOREIGN KEY ("issued_to") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."cash_counts"
    ADD CONSTRAINT "cash_counts_sale_day_id_fkey" FOREIGN KEY ("sale_day_id") REFERENCES "public"."sale_days"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."purchase_lines"
    ADD CONSTRAINT "purchase_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id");



ALTER TABLE ONLY "public"."purchase_lines"
    ADD CONSTRAINT "purchase_lines_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."purchases"
    ADD CONSTRAINT "purchases_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."purchases"
    ADD CONSTRAINT "purchases_paid_by_fkey" FOREIGN KEY ("paid_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."sale_day_items"
    ADD CONSTRAINT "sale_day_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id");



ALTER TABLE ONLY "public"."sale_day_items"
    ADD CONSTRAINT "sale_day_items_sale_day_id_fkey" FOREIGN KEY ("sale_day_id") REFERENCES "public"."sale_days"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sale_day_signoffs"
    ADD CONSTRAINT "sale_day_signoffs_sale_day_id_fkey" FOREIGN KEY ("sale_day_id") REFERENCES "public"."sale_days"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sale_day_signoffs"
    ADD CONSTRAINT "sale_day_signoffs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."shopping_trips"
    ADD CONSTRAINT "shopping_trips_volunteer_id_fkey" FOREIGN KEY ("volunteer_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id");



ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_purchase_line_id_fkey" FOREIGN KEY ("purchase_line_id") REFERENCES "public"."purchase_lines"("id");



ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_sale_day_id_fkey" FOREIGN KEY ("sale_day_id") REFERENCES "public"."sale_days"("id");



ALTER TABLE ONLY "public"."volunteer_invites"
    ADD CONSTRAINT "volunteer_invites_accepted_by_fkey" FOREIGN KEY ("accepted_by") REFERENCES "public"."profiles"("id");



ALTER TABLE "public"."action_tokens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin_delete" ON "public"."volunteer_invites" FOR DELETE TO "authenticated" USING ("public"."has_role"('admin'::"public"."user_role"));



CREATE POLICY "admin_insert" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_role"('admin'::"public"."user_role"));



CREATE POLICY "admin_read" ON "public"."volunteer_invites" FOR SELECT TO "authenticated" USING ("public"."has_role"('admin'::"public"."user_role"));



CREATE POLICY "admin_update" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ("public"."has_role"('admin'::"public"."user_role")) WITH CHECK ("public"."has_role"('admin'::"public"."user_role"));



CREATE POLICY "admin_write" ON "public"."settings" FOR UPDATE TO "authenticated" USING ("public"."has_role"('admin'::"public"."user_role")) WITH CHECK ("public"."has_role"('admin'::"public"."user_role"));



ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cash_counts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "member_insert" ON "public"."shopping_trips" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_member"() AND ("volunteer_id" = "auth"."uid"())));



CREATE POLICY "member_insert" ON "public"."stock_movements" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_member"() AND ("reason" = ANY (ARRAY['donated'::"public"."movement_reason", 'correction'::"public"."movement_reason"]))));



CREATE POLICY "member_release" ON "public"."shopping_trips" FOR UPDATE TO "authenticated" USING (("volunteer_id" = "auth"."uid"())) WITH CHECK (("volunteer_id" = "auth"."uid"()));



CREATE POLICY "member_write" ON "public"."cash_counts" TO "authenticated" USING ("public"."is_member"()) WITH CHECK ("public"."is_member"());



CREATE POLICY "member_write" ON "public"."items" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_member"());



CREATE POLICY "member_write" ON "public"."sale_day_items" TO "authenticated" USING ("public"."is_member"()) WITH CHECK ("public"."is_member"());



CREATE POLICY "member_write" ON "public"."sale_days" FOR UPDATE TO "authenticated" USING ("public"."is_member"()) WITH CHECK ("public"."is_member"());



CREATE POLICY "member_write_u" ON "public"."items" FOR UPDATE TO "authenticated" USING ("public"."is_member"()) WITH CHECK ("public"."is_member"());



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."purchase_lines" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."purchases" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "read_all" ON "public"."audit_log" FOR SELECT TO "authenticated" USING ("public"."is_member"());



CREATE POLICY "read_all" ON "public"."cash_counts" FOR SELECT TO "authenticated" USING ("public"."is_member"());



CREATE POLICY "read_all" ON "public"."items" FOR SELECT TO "authenticated" USING ("public"."is_member"());



CREATE POLICY "read_all" ON "public"."profiles" FOR SELECT TO "authenticated" USING ("public"."is_member"());



CREATE POLICY "read_all" ON "public"."purchase_lines" FOR SELECT TO "authenticated" USING ("public"."is_member"());



CREATE POLICY "read_all" ON "public"."purchases" FOR SELECT TO "authenticated" USING ("public"."is_member"());



CREATE POLICY "read_all" ON "public"."sale_day_items" FOR SELECT TO "authenticated" USING ("public"."is_member"());



CREATE POLICY "read_all" ON "public"."sale_day_signoffs" FOR SELECT TO "authenticated" USING ("public"."is_member"());



CREATE POLICY "read_all" ON "public"."sale_days" FOR SELECT TO "authenticated" USING ("public"."is_member"());



CREATE POLICY "read_all" ON "public"."settings" FOR SELECT TO "authenticated" USING ("public"."is_member"());



CREATE POLICY "read_all" ON "public"."shopping_trips" FOR SELECT TO "authenticated" USING ("public"."is_member"());



CREATE POLICY "read_all" ON "public"."stock_movements" FOR SELECT TO "authenticated" USING ("public"."is_member"());



ALTER TABLE "public"."sale_day_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sale_day_signoffs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sale_days" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shopping_trips" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stock_movements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."volunteer_invites" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."cash_counts";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."sale_day_items";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."sale_day_signoffs";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."sale_days";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."actor"() TO "anon";
GRANT ALL ON FUNCTION "public"."actor"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."actor"() TO "service_role";



GRANT ALL ON FUNCTION "public"."add_volunteer"("p_email" "text", "p_name" "text", "p_role" "public"."user_role") TO "anon";
GRANT ALL ON FUNCTION "public"."add_volunteer"("p_email" "text", "p_name" "text", "p_role" "public"."user_role") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_volunteer"("p_email" "text", "p_name" "text", "p_role" "public"."user_role") TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_row"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_row"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_row"() TO "service_role";



GRANT ALL ON FUNCTION "public"."begin_count"("p_sale_day" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."begin_count"("p_sale_day" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."begin_count"("p_sale_day" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."cash_counts_guard"() TO "anon";
GRANT ALL ON FUNCTION "public"."cash_counts_guard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cash_counts_guard"() TO "service_role";



GRANT ALL ON FUNCTION "public"."clear_signoffs"() TO "anon";
GRANT ALL ON FUNCTION "public"."clear_signoffs"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."clear_signoffs"() TO "service_role";



GRANT ALL ON FUNCTION "public"."close_sale_day"("p_sale_day" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."close_sale_day"("p_sale_day" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."close_sale_day"("p_sale_day" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_sale_day"("p_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."create_sale_day"("p_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_sale_day"("p_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."forbid_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."forbid_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."forbid_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_auth_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_auth_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_auth_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_role"("r" "public"."user_role") TO "anon";
GRANT ALL ON FUNCTION "public"."has_role"("r" "public"."user_role") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_role"("r" "public"."user_role") TO "service_role";



GRANT ALL ON FUNCTION "public"."in_fn"() TO "anon";
GRANT ALL ON FUNCTION "public"."in_fn"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."in_fn"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_member"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_member"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_member"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."issue_mark_paid_tokens"("p_valid" interval) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."issue_mark_paid_tokens"("p_valid" interval) TO "service_role";



GRANT ALL ON FUNCTION "public"."items_touch"() TO "anon";
GRANT ALL ON FUNCTION "public"."items_touch"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."items_touch"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_purchase"("p" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."log_purchase"("p" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_purchase"("p" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."profiles_guard"() TO "anon";
GRANT ALL ON FUNCTION "public"."profiles_guard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."profiles_guard"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."redeem_action_token"("p_token" "text", "p_payment_ref" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."redeem_action_token"("p_token" "text", "p_payment_ref" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."require_member"() TO "anon";
GRANT ALL ON FUNCTION "public"."require_member"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."require_member"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sale_day_items_guard"() TO "anon";
GRANT ALL ON FUNCTION "public"."sale_day_items_guard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sale_day_items_guard"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sale_days_clear_signoffs"() TO "anon";
GRANT ALL ON FUNCTION "public"."sale_days_clear_signoffs"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sale_days_clear_signoffs"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sale_days_guard"() TO "anon";
GRANT ALL ON FUNCTION "public"."sale_days_guard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sale_days_guard"() TO "service_role";



GRANT ALL ON FUNCTION "public"."settings_touch"() TO "anon";
GRANT ALL ON FUNCTION "public"."settings_touch"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."settings_touch"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sign_off"("p_sale_day" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."sign_off"("p_sale_day" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sign_off"("p_sale_day" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."start_sale"("p_sale_day" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."start_sale"("p_sale_day" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."start_sale"("p_sale_day" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."suggest_lineup"() TO "anon";
GRANT ALL ON FUNCTION "public"."suggest_lineup"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."suggest_lineup"() TO "service_role";


















GRANT ALL ON TABLE "public"."action_tokens" TO "anon";
GRANT ALL ON TABLE "public"."action_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."action_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."audit_log" TO "anon";
GRANT ALL ON TABLE "public"."audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_log" TO "service_role";



GRANT ALL ON SEQUENCE "public"."audit_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."audit_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."audit_log_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."cash_counts" TO "anon";
GRANT ALL ON TABLE "public"."cash_counts" TO "authenticated";
GRANT ALL ON TABLE "public"."cash_counts" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."purchase_lines" TO "anon";
GRANT ALL ON TABLE "public"."purchase_lines" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_lines" TO "service_role";



GRANT ALL ON TABLE "public"."purchases" TO "anon";
GRANT ALL ON TABLE "public"."purchases" TO "authenticated";
GRANT ALL ON TABLE "public"."purchases" TO "service_role";



GRANT ALL ON TABLE "public"."claims" TO "anon";
GRANT ALL ON TABLE "public"."claims" TO "authenticated";
GRANT ALL ON TABLE "public"."claims" TO "service_role";



GRANT ALL ON TABLE "public"."items" TO "anon";
GRANT ALL ON TABLE "public"."items" TO "authenticated";
GRANT ALL ON TABLE "public"."items" TO "service_role";



GRANT ALL ON TABLE "public"."sale_day_items" TO "anon";
GRANT ALL ON TABLE "public"."sale_day_items" TO "authenticated";
GRANT ALL ON TABLE "public"."sale_day_items" TO "service_role";



GRANT ALL ON TABLE "public"."sale_days" TO "anon";
GRANT ALL ON TABLE "public"."sale_days" TO "authenticated";
GRANT ALL ON TABLE "public"."sale_days" TO "service_role";



GRANT ALL ON TABLE "public"."sale_day_item_results" TO "anon";
GRANT ALL ON TABLE "public"."sale_day_item_results" TO "authenticated";
GRANT ALL ON TABLE "public"."sale_day_item_results" TO "service_role";



GRANT ALL ON TABLE "public"."item_sale_stats" TO "anon";
GRANT ALL ON TABLE "public"."item_sale_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."item_sale_stats" TO "service_role";



GRANT ALL ON TABLE "public"."item_stock" TO "anon";
GRANT ALL ON TABLE "public"."item_stock" TO "authenticated";
GRANT ALL ON TABLE "public"."item_stock" TO "service_role";



GRANT ALL ON TABLE "public"."item_overview" TO "anon";
GRANT ALL ON TABLE "public"."item_overview" TO "authenticated";
GRANT ALL ON TABLE "public"."item_overview" TO "service_role";



GRANT ALL ON TABLE "public"."lineup_options" TO "anon";
GRANT ALL ON TABLE "public"."lineup_options" TO "authenticated";
GRANT ALL ON TABLE "public"."lineup_options" TO "service_role";



GRANT ALL ON SEQUENCE "public"."purchases_claim_no_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."purchases_claim_no_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."purchases_claim_no_seq" TO "service_role";



GRANT ALL ON TABLE "public"."sale_day_lineup" TO "anon";
GRANT ALL ON TABLE "public"."sale_day_lineup" TO "authenticated";
GRANT ALL ON TABLE "public"."sale_day_lineup" TO "service_role";



GRANT ALL ON TABLE "public"."sale_day_lineup_totals" TO "anon";
GRANT ALL ON TABLE "public"."sale_day_lineup_totals" TO "authenticated";
GRANT ALL ON TABLE "public"."sale_day_lineup_totals" TO "service_role";



GRANT ALL ON TABLE "public"."sale_day_signoffs" TO "anon";
GRANT ALL ON TABLE "public"."sale_day_signoffs" TO "authenticated";
GRANT ALL ON TABLE "public"."sale_day_signoffs" TO "service_role";



GRANT ALL ON TABLE "public"."sale_day_totals" TO "anon";
GRANT ALL ON TABLE "public"."sale_day_totals" TO "authenticated";
GRANT ALL ON TABLE "public"."sale_day_totals" TO "service_role";



GRANT ALL ON TABLE "public"."settings" TO "anon";
GRANT ALL ON TABLE "public"."settings" TO "authenticated";
GRANT ALL ON TABLE "public"."settings" TO "service_role";



GRANT ALL ON TABLE "public"."shopping_trips" TO "anon";
GRANT ALL ON TABLE "public"."shopping_trips" TO "authenticated";
GRANT ALL ON TABLE "public"."shopping_trips" TO "service_role";



GRANT ALL ON TABLE "public"."stock_by_type" TO "anon";
GRANT ALL ON TABLE "public"."stock_by_type" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_by_type" TO "service_role";



GRANT ALL ON TABLE "public"."stock_movements" TO "anon";
GRANT ALL ON TABLE "public"."stock_movements" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_movements" TO "service_role";



GRANT ALL ON TABLE "public"."type_benchmarks" TO "anon";
GRANT ALL ON TABLE "public"."type_benchmarks" TO "authenticated";
GRANT ALL ON TABLE "public"."type_benchmarks" TO "service_role";



GRANT ALL ON TABLE "public"."volunteer_invites" TO "anon";
GRANT ALL ON TABLE "public"."volunteer_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."volunteer_invites" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































