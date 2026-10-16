

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

CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";

CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";

COMMENT ON SCHEMA "public" IS 'standard public schema';

CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";

CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";

CREATE TYPE "public"."cash_count_kind" AS ENUM (
    'open',
    'close'
);

ALTER TYPE "public"."cash_count_kind" OWNER TO "postgres";

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
    'correction',
    'returned',
    'count',
    'repacked'
);

ALTER TYPE "public"."movement_reason" OWNER TO "postgres";

CREATE TYPE "public"."sale_phase" AS ENUM (
    'open',
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

CREATE OR REPLACE FUNCTION "public"."add_volunteer"("p_email" "text", "p_name" "text", "p_role" "public"."user_role" DEFAULT 'volunteer'::"public"."user_role", "p_full_name" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_email   text := lower(trim(p_email));
  v_name    text := trim(p_name);
  v_full    text := nullif(trim(p_full_name), '');
  v_uid     uuid;
  v_profile public.profiles;
begin
  if not public.has_role('admin') then
    raise exception 'Only the coordinator can add volunteers.';
  end if;
  if position('@' in v_email) < 2 then
    raise exception 'Enter an email address.';
  end if;

  select * into v_profile from public.profiles where lower(email) = v_email;
  if v_profile.id is not null and v_profile.active then
    raise exception 'Already on the team. Tap their name to edit.';
  elsif v_profile.id is not null then
    raise exception 'Removed from the team. Tap Add back.';
  end if;
  if exists (select 1 from public.volunteer_invites
              where lower(email) = v_email and accepted_at is null) then
    raise exception 'Already invited. Tap the invite to edit.';
  end if;

  perform public.display_name_check(v_name, null, null);
  perform public.full_name_check(v_full);

  select id into v_uid from auth.users where lower(email) = v_email;

  if v_uid is not null then
    insert into public.profiles (id, email, display_name, full_name, role, active)
    values (v_uid, v_email, v_name, v_full, p_role, true);
    return jsonb_build_object('status', 'added', 'profile_id', v_uid);
  end if;

  insert into public.volunteer_invites (email, display_name, full_name, role)
  values (v_email, v_name, v_full, p_role);
  return jsonb_build_object('status', 'invited');
end $$;

ALTER FUNCTION "public"."add_volunteer"("p_email" "text", "p_name" "text", "p_role" "public"."user_role", "p_full_name" "text") OWNER TO "postgres";

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

CREATE OR REPLACE FUNCTION "public"."cancel_sale_day"("p_sale_day" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  perform public.require_member();
  perform set_config('snack.fn', 'on', true);
  delete from public.sale_days where id = p_sale_day and phase = 'open' and selling_at is null;
  if not found then raise exception 'Selling has started, so this sale day can''t be cancelled.'; end if;
  perform set_config('snack.fn', '', true);
end $$;

ALTER FUNCTION "public"."cancel_sale_day"("p_sale_day" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."cash_counts_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  d public.sale_days;
begin
  if public.in_fn() then return coalesce(new, old); end if;
  if tg_op <> 'UPDATE' then raise exception 'Cash rows are created with the sale day.'; end if;
  if (new.sale_day_id, new.kind, new.denom_cents) is distinct from (old.sale_day_id, old.kind, old.denom_cents) then
    raise exception 'Only the count can change.';
  end if;
  select * into d from public.sale_days where id = new.sale_day_id;
  if d.phase <> 'open' then raise exception 'This sale day is closed.'; end if;
  if new.kind = 'open' and d.selling_at is not null then
    raise exception 'Selling has started. The open count can''t change.';
  end if;
  if new.kind = 'close' and d.selling_at is null then
    raise exception 'Finish the open count first.';
  end if;
  new.updated_at := now();
  new.updated_by := public.actor();
  return new;
end $$;

ALTER FUNCTION "public"."cash_counts_guard"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."cents_text"("p_cents" integer) RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $_$
  select '$' || to_char(p_cents / 100.0, 'FM999,990.00')
$_$;

ALTER FUNCTION "public"."cents_text"("p_cents" integer) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."check_repack_side"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if (new.qty > 0) <> (new.item_id = (select pack_item_id from public.repacks where id = new.repack_id)) then
    raise exception 'A repack adds to the item made and takes from the items that went in.';
  end if;
  return new;
end $$;

ALTER FUNCTION "public"."check_repack_side"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."claims_report"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_since timestamptz;
  v_report jsonb;
begin
  perform public.require_coordinator();
  select max(sent_at) into v_since from public.claim_sends;

  with dep as (
    select c.sale_date, c.deposit_cents, c.revenue_cents,
           coalesce(c.closed_by_name, '') as volunteers
      from public.sale_day_cash c
     where c.phase = 'closed' and (v_since is null or c.closed_at > v_since)
  ), owed as (
    select c.buyer_id, c.buyer_name, c.buyer_full_name,
           sum(c.net_cents)::int as total_cents,
           jsonb_agg(jsonb_build_object(
             'id', c.id, 'label', c.claim_label, 'purchased_on', c.purchased_on,
             'store', c.store, 'total_cents', c.net_cents, 'refunded_cents', c.refunded_cents,
             'receipt_path', c.receipt_path) order by c.claim_no) as claims
      from public.claims c
     where c.status = 'to_pay' and c.net_cents > 0
     group by c.buyer_id, c.buyer_name, c.buyer_full_name
  )
  select jsonb_build_object(
    'since', v_since,
    'deposits', coalesce((select jsonb_agg(to_jsonb(dep) order by dep.sale_date) from dep), '[]'),
    'deposited_cents', coalesce((select sum(deposit_cents) from dep), 0)::int,
    'to_reimburse', coalesce((select jsonb_agg(to_jsonb(owed) order by owed.buyer_name) from owed), '[]'),
    'to_reimburse_cents', coalesce((select sum(total_cents) from owed), 0)::int,
    'ledger', coalesce((
      select jsonb_agg(jsonb_build_object(
        'label', c.claim_label, 'purchased_on', c.purchased_on, 'store', c.store,
        'buyer_name', c.buyer_name, 'buyer_full_name', c.buyer_full_name,
        'total_cents', c.net_cents, 'refunded_cents', c.refunded_cents,
        'status', case when c.status = 'to_pay' and c.net_cents = 0 then 'refunded' else c.status::text end,
        'paid_at', c.paid_at, 'payment_note', c.payment_note) order by c.claim_no)
      from public.claims c), '[]')
  ) into v_report;
  return v_report;
end $$;

ALTER FUNCTION "public"."claims_report"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."close_sale_day"("p_sale_day" "uuid", "p_left_in_box_cents" integer, "p_note" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_close int;
begin
  perform public.require_member();
  if exists (select 1 from public.sale_days where id = p_sale_day and phase = 'closed') then
    raise exception 'This sale day was already closed.';
  end if;
  if not exists (select 1 from public.sale_days where id = p_sale_day and selling_at is not null) then
    raise exception 'Finish the open count first.';
  end if;
  select coalesce(sum(denom_cents * qty), 0) into v_close
    from public.cash_counts where sale_day_id = p_sale_day and kind = 'close';
  if v_close = 0 then raise exception 'Count the cash box first.'; end if;
  if p_left_in_box_cents is null or p_left_in_box_cents < 0 then
    raise exception 'Left in box can''t be negative.';
  end if;
  if p_left_in_box_cents > v_close then
    raise exception 'Left in box is more than you counted.';
  end if;

  perform set_config('snack.fn', 'on', true);
  update public.sale_days
     set phase = 'closed', closed_at = now(), closed_by = auth.uid(),
         left_in_box_cents = p_left_in_box_cents, close_note = nullif(btrim(p_note), '')
   where id = p_sale_day and phase = 'open';
  if not found then raise exception 'This sale day was already closed.'; end if;
  perform set_config('snack.fn', '', true);
end $$;

ALTER FUNCTION "public"."close_sale_day"("p_sale_day" "uuid", "p_left_in_box_cents" integer, "p_note" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."display_name_check"("p_name" "text", "p_profile" "uuid", "p_invite" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if p_name is null or p_name = '' then
    raise exception 'Enter a name.';
  end if;
  if char_length(p_name) > 30 then
    raise exception 'Keep the name to 30 characters or fewer.';
  end if;
  if exists (select 1 from public.profiles
              where lower(display_name) = lower(p_name)
                and id is distinct from p_profile)
     or exists (select 1 from public.volunteer_invites
                 where lower(display_name) = lower(p_name)
                   and accepted_at is null
                   and id is distinct from p_invite) then
    raise exception 'Someone on the team already uses that name.';
  end if;
end $$;

ALTER FUNCTION "public"."display_name_check"("p_name" "text", "p_profile" "uuid", "p_invite" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."forbid_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  raise exception '% rows cannot be changed. Add a correction instead.', tg_table_name;
end $$;

ALTER FUNCTION "public"."forbid_change"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."full_name_check"("p_full_name" "text") RETURNS "void"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
begin
  if char_length(p_full_name) > 100 then
    raise exception 'Keep the full name to 100 characters or fewer.';
  end if;
end $$;

ALTER FUNCTION "public"."full_name_check"("p_full_name" "text") OWNER TO "postgres";

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
            left(coalesce(nullif(split_part(coalesce(v_email, ''), '@', 1), ''), 'Coordinator'), 30),
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

  insert into public.profiles (id, email, display_name, full_name, role, active)
  values (new.id, v_email, v_invite.display_name, v_invite.full_name, v_invite.role, true)
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

CREATE OR REPLACE FUNCTION "public"."local_today"() RETURNS "date"
    LANGUAGE "sql" STABLE
    AS $$
  select (now() at time zone 'America/Vancouver')::date
$$;

ALTER FUNCTION "public"."local_today"() OWNER TO "postgres";

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
  if (p ->> 'buyer_id')::uuid is distinct from auth.uid() and not public.has_role('admin') then
    raise exception 'Only the coordinator can log a purchase for someone else.';
  end if;
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

CREATE OR REPLACE FUNCTION "public"."mark_claim_unpaid"("p_purchase_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  perform public.require_coordinator();
  update public.purchases
     set status = 'to_pay', paid_at = null, paid_by = null, payment_note = null
   where id = p_purchase_id and status = 'paid';
  if not found then raise exception 'That claim is not paid.'; end if;
end $$;

ALTER FUNCTION "public"."mark_claim_unpaid"("p_purchase_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."mark_claims_paid"("p_purchase_ids" "uuid"[], "p_expected_cents" integer, "p_paid_on" "date", "p_note" "text" DEFAULT NULL::"text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_ids uuid[];
  v_locked int;
  v_net int;
begin
  perform public.require_coordinator();
  select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(p_purchase_ids) as x;
  if cardinality(v_ids) = 0 then raise exception 'Pick the claims to mark paid.'; end if;
  if p_paid_on is null then raise exception 'Enter the date paid.'; end if;
  if p_paid_on > (now() at time zone 'America/Vancouver')::date then
    raise exception 'The paid date cannot be in the future.';
  end if;

  -- Locked so a refund cannot change a claim between the checks and the update.
  select count(*) into v_locked
    from (select id from public.purchases
           where id = any (v_ids) and status = 'to_pay' for update) as locked;
  if v_locked <> cardinality(v_ids) then
    raise exception 'A claim changed since you loaded this list. Check it and try again.';
  end if;
  select coalesce(sum(net_cents), 0) into v_net from public.claims where id = any (v_ids);
  if v_net is distinct from p_expected_cents then
    raise exception 'A claim changed since you loaded this list. Check it and try again.';
  end if;

  update public.purchases
     set status = 'paid',
         paid_at = (p_paid_on + time '12:00') at time zone 'America/Vancouver',
         paid_by = auth.uid(),
         payment_note = nullif(btrim(p_note), '')
   where id = any (v_ids);
  return cardinality(v_ids);
end $$;

ALTER FUNCTION "public"."mark_claims_paid"("p_purchase_ids" "uuid"[], "p_expected_cents" integer, "p_paid_on" "date", "p_note" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."open_sale_day"("p_date" "date" DEFAULT NULL::"date") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_date date := coalesce(p_date, public.local_today());
  v_id uuid;
begin
  perform public.require_member();
  if v_date > public.local_today() then raise exception 'A sale day can''t be in the future.'; end if;
  if exists (select 1 from public.sale_days where phase = 'open') then
    raise exception 'Another sale day is still open. Close it first.';
  end if;
  if exists (select 1 from public.sale_days where sale_date = v_date) then
    raise exception 'There''s already a sale day on %.', to_char(v_date, 'FMMon FMDD');
  end if;

  perform set_config('snack.fn', 'on', true);
  insert into public.sale_days (sale_date) values (v_date) returning id into v_id;
  insert into public.cash_counts (sale_day_id, kind, denom_cents)
  select v_id, k, d
    from unnest(array['open', 'close']::public.cash_count_kind[]) k,
         unnest(array[2000, 1000, 500, 200, 100, 25, 10, 5]) d;
  perform set_config('snack.fn', '', true);
  return v_id;
exception when unique_violation then
  raise exception 'Another sale day was just opened. Refresh and try again.';
end $$;

ALTER FUNCTION "public"."open_sale_day"("p_date" "date") OWNER TO "postgres";

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

CREATE OR REPLACE FUNCTION "public"."record_claims_send"("p_sent_to" "text", "p_claim_count" integer, "p_total_cents" integer) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_id uuid;
begin
  perform public.require_coordinator();
  insert into public.claim_sends (sent_by, sent_to, claim_count, total_cents)
  values (auth.uid(), p_sent_to, p_claim_count, p_total_cents)
  returning id into v_id;
  return v_id;
end $$;

ALTER FUNCTION "public"."record_claims_send"("p_sent_to" "text", "p_claim_count" integer, "p_total_cents" integer) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."refund_purchase_line"("p_id" "uuid", "p_line" "uuid", "p_pieces" integer, "p_amount_cents" integer, "p_refunded_on" "date", "p_slip_path" "text" DEFAULT NULL::"text", "p_note" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_line public.purchase_lines;
  v_claim public.purchases;
  v_buyer text;
  v_pieces_left int;
  v_cents_left int;
  v_on_hand int;
begin
  perform public.require_member();
  if exists (select 1 from public.purchase_refunds where id = p_id) then return p_id; end if;

  select * into v_line from public.purchase_lines where id = p_line for update;
  if v_line.id is null then raise exception 'That line is not on a claim.'; end if;
  -- Locked so a Mark paid link cannot be redeemed between our checks and the insert.
  select * into v_claim from public.purchases where id = v_line.purchase_id for update;
  select display_name into v_buyer from public.profiles where id = v_claim.buyer_id;

  if v_claim.status = 'paid' then raise exception 'Already paid. Ask the treasurer.'; end if;
  if v_claim.buyer_id <> auth.uid() and not public.has_role('admin') then
    raise exception 'Only % or a coordinator can refund.', v_buyer;
  end if;

  if p_pieces is null or p_pieces < 1 then raise exception 'Enter the pieces.'; end if;
  select v_line.pieces - coalesce(sum(r.pieces), 0), v_line.cost_cents - coalesce(sum(r.amount_cents), 0)
    into v_pieces_left, v_cents_left
    from public.purchase_refunds r where r.purchase_line_id = v_line.id;
  if p_pieces > v_pieces_left then raise exception 'Only % left on this line.', v_pieces_left; end if;

  select on_hand into v_on_hand from public.item_stock where id = v_line.item_id;
  if p_pieces > greatest(v_on_hand, 0) then raise exception 'Only % on hand.', greatest(v_on_hand, 0); end if;

  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'Enter the refund amount.'; end if;
  if p_amount_cents > v_cents_left then
    raise exception 'Up to % left on this line.', public.cents_text(v_cents_left);
  end if;

  insert into public.purchase_refunds (id, purchase_line_id, pieces, amount_cents, refunded_on, slip_path, note)
  values (p_id, p_line, p_pieces, p_amount_cents, p_refunded_on,
          nullif(p_slip_path, ''), nullif(trim(coalesce(p_note, '')), ''));
  insert into public.stock_movements (item_id, qty, reason, purchase_line_id, refund_id)
  values (v_line.item_id, -p_pieces, 'returned', p_line, p_id);
  return p_id;
end $$;

ALTER FUNCTION "public"."refund_purchase_line"("p_id" "uuid", "p_line" "uuid", "p_pieces" integer, "p_amount_cents" integer, "p_refunded_on" "date", "p_slip_path" "text", "p_note" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."repack"("p" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_id uuid := (p ->> 'id')::uuid;
  v_pack uuid := (p ->> 'pack_item_id')::uuid;
  v_packs int := (p ->> 'packs')::int;
  v_src jsonb;
  v_item uuid;
  v_per int;
  v_seen uuid[] := '{}';
  v_cents numeric := 0;
  v_cost numeric;
  v_on_hand int;
  v_archived boolean;
begin
  perform public.require_member();
  if v_id is null then raise exception 'A repack needs an id.'; end if;
  if exists (select 1 from public.repacks where id = v_id) then return v_id; end if;

  if v_packs is null or v_packs < 1 then raise exception 'Make at least one pack.'; end if;
  if p -> 'sources' is null or jsonb_typeof(p -> 'sources') <> 'array'
     or jsonb_array_length(p -> 'sources') = 0 then
    raise exception 'Add at least one item that went in.';
  end if;

  if v_pack is null then
    if p -> 'new_item' is null then raise exception 'Pick the item you made.'; end if;
    if coalesce(trim(p -> 'new_item' ->> 'name'), '') = '' then
      raise exception 'Give the new item a name.';
    end if;
    insert into public.items (name, type, storage, price_cents, bundle_size)
    values (trim(p -> 'new_item' ->> 'name'),
            (p -> 'new_item' ->> 'type')::public.item_type,
            coalesce((p -> 'new_item' ->> 'storage')::public.storage_kind, 'shelf'),
            (p -> 'new_item' ->> 'price_cents')::int,
            coalesce((p -> 'new_item' ->> 'bundle_size')::int, 1))
    returning id into v_pack;
  else
    select archived into v_archived from public.items where id = v_pack;
    if not found then raise exception 'That item no longer exists.'; end if;
    if v_archived then raise exception 'That item is archived.'; end if;
  end if;

  insert into public.repacks (id, pack_item_id, packs, note)
  values (v_id, v_pack, v_packs, nullif(trim(p ->> 'note'), ''));

  for v_src in select * from jsonb_array_elements(p -> 'sources') loop
    v_item := (v_src ->> 'item_id')::uuid;
    v_per := (v_src ->> 'pieces_per_pack')::int;
    if v_per is null or v_per < 1 then raise exception 'Pieces per pack must be 1 or more.'; end if;
    if v_item = v_pack then raise exception 'An item cannot go into itself.'; end if;
    if v_item = any (v_seen) then raise exception 'Each item can be added once.'; end if;
    v_seen := v_seen || v_item;

    select unit_cost_cents, archived into v_cost, v_archived
    from public.items where id = v_item;
    if not found then raise exception 'That item no longer exists.'; end if;
    if v_archived then raise exception 'That item is archived.'; end if;

    v_cents := v_cents + v_packs * v_per * v_cost;
    insert into public.stock_movements (item_id, qty, reason, repack_id)
    values (v_item, -(v_packs * v_per), 'repacked', v_id);
  end loop;

  select on_hand, unit_cost_cents into v_on_hand, v_cost from public.item_stock where id = v_pack;
  v_on_hand := greatest(v_on_hand, 0);
  update public.items
     set unit_cost_cents = round(((v_on_hand * v_cost) + v_cents) / (v_on_hand + v_packs), 2)
   where id = v_pack;

  insert into public.stock_movements (item_id, qty, reason, repack_id)
  values (v_pack, v_packs, 'repacked', v_id);

  return v_id;
end $$;

ALTER FUNCTION "public"."repack"("p" "jsonb") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."require_coordinator"() RETURNS "void"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not public.has_role('admin') then raise exception 'Only the coordinator can do this.'; end if;
end $$;

ALTER FUNCTION "public"."require_coordinator"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."require_member"() RETURNS "void"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not public.is_member() then raise exception 'Not signed in as a Snack Shack volunteer.'; end if;
end $$;

ALTER FUNCTION "public"."require_member"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."save_stock_count"("p_counts" "jsonb") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_row jsonb;
  v_item uuid;
  v_pieces int;
  v_on_hand int;
  v_seen uuid[] := '{}';
begin
  perform public.require_member();
  -- One save at a time, so each difference is taken from the ledger as it stands.
  perform pg_advisory_xact_lock(hashtext('save_stock_count'));
  if p_counts is null or jsonb_typeof(p_counts) <> 'array' or jsonb_array_length(p_counts) = 0 then
    raise exception 'Count at least one item.';
  end if;

  for v_row in select * from jsonb_array_elements(p_counts) loop
    v_item := (v_row ->> 'item_id')::uuid;
    v_pieces := (v_row ->> 'pieces')::int;
    if v_pieces is null or v_pieces < 0 then raise exception 'Pieces must be 0 or more.'; end if;
    if v_item = any (v_seen) then raise exception 'Each item can be counted once per save.'; end if;
    v_seen := v_seen || v_item;

    select on_hand into v_on_hand from public.item_stock where id = v_item;
    if not found then raise exception 'That item no longer exists.'; end if;
    if exists (select 1 from public.items where id = v_item and archived) then
      raise exception 'That item is archived.';
    end if;

    insert into public.stock_movements (item_id, qty, reason)
    values (v_item, v_pieces - v_on_hand, 'count');
  end loop;

  return array_length(v_seen, 1);
end $$;

ALTER FUNCTION "public"."save_stock_count"("p_counts" "jsonb") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."set_member_active"("p_id" "uuid", "p_active" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not public.has_role('admin') then
    raise exception 'Only the coordinator can edit the team.';
  end if;
  if not exists (select 1 from public.profiles where id = p_id) then
    raise exception 'That person is not on the team list.';
  end if;

  -- profiles_guard stops you removing yourself or the last coordinator.
  update public.profiles set active = p_active where id = p_id;
end $$;

ALTER FUNCTION "public"."set_member_active"("p_id" "uuid", "p_active" boolean) OWNER TO "postgres";

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

CREATE OR REPLACE FUNCTION "public"."start_selling"("p_sale_day" "uuid", "p_note" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  perform public.require_member();
  if not exists (select 1 from public.cash_counts where sale_day_id = p_sale_day and kind = 'open' and qty > 0) then
    raise exception 'Count the cash box first.';
  end if;
  perform set_config('snack.fn', 'on', true);
  update public.sale_days
     set selling_at = now(), selling_by = auth.uid(), open_note = nullif(btrim(p_note), '')
   where id = p_sale_day and phase = 'open' and selling_at is null;
  if not found then raise exception 'Selling has already started.'; end if;
  perform set_config('snack.fn', '', true);
end $$;

ALTER FUNCTION "public"."start_selling"("p_sale_day" "uuid", "p_note" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."undo_refund"("p_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_refund public.purchase_refunds;
  v_line public.purchase_lines;
  v_claim public.purchases;
  v_buyer text;
begin
  perform public.require_member();
  select * into v_refund from public.purchase_refunds where id = p_id for update;
  if v_refund.id is null then raise exception 'That refund is already gone.'; end if;
  select * into v_line from public.purchase_lines where id = v_refund.purchase_line_id;
  select * into v_claim from public.purchases where id = v_line.purchase_id for update;
  select display_name into v_buyer from public.profiles where id = v_claim.buyer_id;

  if v_claim.status = 'paid' then raise exception 'Already paid. Ask the treasurer.'; end if;
  if v_claim.buyer_id <> auth.uid() and not public.has_role('admin') then
    raise exception 'Only % or a coordinator can undo a refund.', v_buyer;
  end if;

  delete from public.purchase_refunds where id = p_id;
  insert into public.stock_movements (item_id, qty, reason, purchase_line_id, refund_id, note)
  values (v_line.item_id, v_refund.pieces, 'correction', v_line.id, p_id, 'Refund undone');
end $$;

ALTER FUNCTION "public"."undo_refund"("p_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."update_invite"("p_id" "uuid", "p_display_name" "text", "p_full_name" "text", "p_role" "public"."user_role") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_name text := trim(p_display_name);
  v_full text := nullif(trim(p_full_name), '');
begin
  if not public.has_role('admin') then
    raise exception 'Only the coordinator can edit the team.';
  end if;
  if not exists (select 1 from public.volunteer_invites
                  where id = p_id and accepted_at is null) then
    raise exception 'That invite is gone. They may have signed in already.';
  end if;
  perform public.display_name_check(v_name, null, p_id);
  perform public.full_name_check(v_full);

  update public.volunteer_invites
     set display_name = v_name, full_name = v_full, role = p_role
   where id = p_id;
end $$;

ALTER FUNCTION "public"."update_invite"("p_id" "uuid", "p_display_name" "text", "p_full_name" "text", "p_role" "public"."user_role") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."update_my_profile"("p_display_name" "text", "p_full_name" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_name text := trim(p_display_name);
  v_full text := nullif(trim(p_full_name), '');
begin
  if not public.is_member() then
    raise exception 'Ask the coordinator to add you to the team.';
  end if;
  perform public.display_name_check(v_name, auth.uid(), null);
  perform public.full_name_check(v_full);

  update public.profiles
     set display_name = v_name, full_name = v_full
   where id = auth.uid();
end $$;

ALTER FUNCTION "public"."update_my_profile"("p_display_name" "text", "p_full_name" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."update_team_member"("p_id" "uuid", "p_display_name" "text", "p_full_name" "text", "p_role" "public"."user_role") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_name text := trim(p_display_name);
  v_full text := nullif(trim(p_full_name), '');
begin
  if not public.has_role('admin') then
    raise exception 'Only the coordinator can edit the team.';
  end if;
  if not exists (select 1 from public.profiles where id = p_id) then
    raise exception 'That person is not on the team list.';
  end if;
  perform public.display_name_check(v_name, p_id, null);
  perform public.full_name_check(v_full);

  -- profiles_guard still keeps at least one coordinator.
  update public.profiles
     set display_name = v_name, full_name = v_full, role = p_role
   where id = p_id;
end $$;

ALTER FUNCTION "public"."update_team_member"("p_id" "uuid", "p_display_name" "text", "p_full_name" "text", "p_role" "public"."user_role") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";

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
    "kind" "public"."cash_count_kind" NOT NULL,
    "denom_cents" integer NOT NULL,
    "qty" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid" DEFAULT "public"."actor"(),
    CONSTRAINT "cash_counts_denom_cents_check" CHECK (("denom_cents" = ANY (ARRAY[2000, 1000, 500, 200, 100, 25, 10, 5]))),
    CONSTRAINT "cash_counts_qty_check" CHECK (("qty" >= 0))
);

ALTER TABLE "public"."cash_counts" OWNER TO "postgres";

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

CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "display_name" "text" NOT NULL,
    "role" "public"."user_role" DEFAULT 'volunteer'::"public"."user_role" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "email" "text",
    "full_name" "text",
    CONSTRAINT "profiles_display_name_check" CHECK (("length"(TRIM(BOTH FROM "display_name")) > 0)),
    CONSTRAINT "profiles_display_name_length" CHECK (("char_length"("display_name") <= 30)),
    CONSTRAINT "profiles_full_name_check" CHECK ((("full_name" IS NULL) OR ("length"(TRIM(BOTH FROM "full_name")) > 0))),
    CONSTRAINT "profiles_full_name_length" CHECK (("char_length"("full_name") <= 100))
);

ALTER TABLE "public"."profiles" OWNER TO "postgres";

CREATE OR REPLACE VIEW "public"."change_history" WITH ("security_invoker"='true') AS
 WITH "changes" AS (
         SELECT "a"."id",
            "a"."at",
            "a"."actor",
            (("a"."new_data" ->> 'id'::"text"))::"uuid" AS "item_id",
            NULL::"uuid" AS "sale_day_id",
            "f"."field",
            ("a"."old_data" ->> "f"."field") AS "old_value",
            ("a"."new_data" ->> "f"."field") AS "new_value"
           FROM ("public"."audit_log" "a"
             CROSS JOIN ( VALUES ('name'::"text"), ('type'::"text"), ('storage'::"text"), ('archived'::"text")) "f"("field"))
          WHERE (("a"."table_name" = 'items'::"text") AND ("a"."action" = 'UPDATE'::"text") AND (("a"."old_data" ->> "f"."field") IS DISTINCT FROM ("a"."new_data" ->> "f"."field")) AND (NOT (EXISTS ( SELECT 1
                   FROM "public"."audit_log" "b"
                  WHERE (("b"."table_name" = 'items'::"text") AND ("b"."action" = 'INSERT'::"text") AND ("b"."row_pk" = "a"."row_pk") AND ("b"."at" = "a"."at"))))))
        UNION ALL
         SELECT "a"."id",
            "a"."at",
            "a"."actor",
            (("a"."new_data" ->> 'id'::"text"))::"uuid" AS "uuid",
            NULL::"uuid" AS "uuid",
            'price'::"text",
            ((("a"."old_data" ->> 'price_cents'::"text") || '/'::"text") || ("a"."old_data" ->> 'bundle_size'::"text")),
            ((("a"."new_data" ->> 'price_cents'::"text") || '/'::"text") || ("a"."new_data" ->> 'bundle_size'::"text"))
           FROM "public"."audit_log" "a"
          WHERE (("a"."table_name" = 'items'::"text") AND ("a"."action" = 'UPDATE'::"text") AND ((("a"."old_data" ->> 'price_cents'::"text") IS DISTINCT FROM ("a"."new_data" ->> 'price_cents'::"text")) OR (("a"."old_data" ->> 'bundle_size'::"text") IS DISTINCT FROM ("a"."new_data" ->> 'bundle_size'::"text"))) AND (NOT (EXISTS ( SELECT 1
                   FROM "public"."audit_log" "b"
                  WHERE (("b"."table_name" = 'items'::"text") AND ("b"."action" = 'INSERT'::"text") AND ("b"."row_pk" = "a"."row_pk") AND ("b"."at" = "a"."at"))))))
        UNION ALL
         SELECT "a"."id",
            "a"."at",
            "a"."actor",
            NULL::"uuid" AS "uuid",
            (("a"."new_data" ->> 'id'::"text"))::"uuid" AS "uuid",
            'phase'::"text",
            ("a"."old_data" ->> 'phase'::"text"),
            ("a"."new_data" ->> 'phase'::"text")
           FROM "public"."audit_log" "a"
          WHERE (("a"."table_name" = 'sale_days'::"text") AND ("a"."action" = 'UPDATE'::"text") AND (("a"."old_data" ->> 'phase'::"text") IS DISTINCT FROM ("a"."new_data" ->> 'phase'::"text")))
        )
 SELECT "c"."id",
    "c"."at",
    "c"."item_id",
    "i"."name" AS "item_name",
    "c"."sale_day_id",
    "c"."field",
    "c"."old_value",
    "c"."new_value",
    "c"."actor" AS "actor_id",
    "p"."display_name" AS "actor_name"
   FROM (("changes" "c"
     LEFT JOIN "public"."items" "i" ON (("i"."id" = "c"."item_id")))
     LEFT JOIN "public"."profiles" "p" ON (("p"."id" = "c"."actor")));

ALTER VIEW "public"."change_history" OWNER TO "postgres";

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

CREATE TABLE IF NOT EXISTS "public"."purchase_refunds" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "purchase_line_id" "uuid" NOT NULL,
    "pieces" integer NOT NULL,
    "amount_cents" integer NOT NULL,
    "refunded_on" "date" NOT NULL,
    "slip_path" "text",
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "public"."actor"(),
    CONSTRAINT "purchase_refunds_amount_cents_check" CHECK (("amount_cents" > 0)),
    CONSTRAINT "purchase_refunds_pieces_check" CHECK (("pieces" >= 1))
);

ALTER TABLE "public"."purchase_refunds" OWNER TO "postgres";

CREATE OR REPLACE VIEW "public"."claim_lines" WITH ("security_invoker"='true') AS
 SELECT "l"."id",
    "l"."purchase_id",
    "l"."line_no",
    "l"."pieces",
    "l"."cost_cents",
    "i"."name" AS "item_name",
    ("l"."pieces" - (COALESCE("rf"."pieces", (0)::bigint))::integer) AS "pieces_left",
    ("l"."cost_cents" - (COALESCE("rf"."cents", (0)::bigint))::integer) AS "cents_left"
   FROM (("public"."purchase_lines" "l"
     JOIN "public"."items" "i" ON (("i"."id" = "l"."item_id")))
     LEFT JOIN ( SELECT "purchase_refunds"."purchase_line_id",
            "sum"("purchase_refunds"."pieces") AS "pieces",
            "sum"("purchase_refunds"."amount_cents") AS "cents"
           FROM "public"."purchase_refunds"
          GROUP BY "purchase_refunds"."purchase_line_id") "rf" ON (("rf"."purchase_line_id" = "l"."id")));

ALTER VIEW "public"."claim_lines" OWNER TO "postgres";

CREATE OR REPLACE VIEW "public"."claim_refunds" WITH ("security_invoker"='true') AS
 SELECT "r"."id",
    "l"."purchase_id",
    "r"."purchase_line_id",
    "r"."pieces",
    "r"."amount_cents",
    "r"."refunded_on",
    "r"."slip_path",
    "r"."note",
    "r"."created_at",
    "pr"."display_name" AS "created_by_name"
   FROM (("public"."purchase_refunds" "r"
     JOIN "public"."purchase_lines" "l" ON (("l"."id" = "r"."purchase_line_id")))
     LEFT JOIN "public"."profiles" "pr" ON (("pr"."id" = "r"."created_by")));

ALTER VIEW "public"."claim_refunds" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."claim_sends" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sent_by" "uuid" NOT NULL,
    "sent_to" "text" NOT NULL,
    "claim_count" integer NOT NULL,
    "total_cents" integer NOT NULL
);

ALTER TABLE "public"."claim_sends" OWNER TO "postgres";

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
    "payment_note" "text",
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
    "p"."payment_note",
    "p"."created_at",
    "p"."created_by",
    ('SS-'::"text" || "lpad"(("p"."claim_no")::"text", 3, '0'::"text")) AS "claim_label",
    (( SELECT COALESCE("sum"("l"."cost_cents"), (0)::bigint) AS "coalesce"
           FROM "public"."purchase_lines" "l"
          WHERE ("l"."purchase_id" = "p"."id")))::integer AS "total_cents",
    "pr"."display_name" AS "buyer_name",
    "pr"."full_name" AS "buyer_full_name",
    (( SELECT COALESCE("sum"("r"."amount_cents"), (0)::bigint) AS "coalesce"
           FROM ("public"."purchase_refunds" "r"
             JOIN "public"."purchase_lines" "l" ON (("l"."id" = "r"."purchase_line_id")))
          WHERE ("l"."purchase_id" = "p"."id")))::integer AS "refunded_cents",
    ((( SELECT COALESCE("sum"("l"."cost_cents"), (0)::bigint) AS "coalesce"
           FROM "public"."purchase_lines" "l"
          WHERE ("l"."purchase_id" = "p"."id")) - ( SELECT COALESCE("sum"("r"."amount_cents"), (0)::bigint) AS "coalesce"
           FROM ("public"."purchase_refunds" "r"
             JOIN "public"."purchase_lines" "l" ON (("l"."id" = "r"."purchase_line_id")))
          WHERE ("l"."purchase_id" = "p"."id"))))::integer AS "net_cents"
   FROM ("public"."purchases" "p"
     JOIN "public"."profiles" "pr" ON (("pr"."id" = "p"."buyer_id")));

ALTER VIEW "public"."claims" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."sale_days" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sale_date" "date" NOT NULL,
    "phase" "public"."sale_phase" DEFAULT 'open'::"public"."sale_phase" NOT NULL,
    "open_note" "text",
    "close_note" "text",
    "selling_at" timestamp with time zone,
    "selling_by" "uuid",
    "left_in_box_cents" integer,
    "closed_at" timestamp with time zone,
    "closed_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "public"."actor"(),
    CONSTRAINT "sale_days_left_in_box_cents_check" CHECK (("left_in_box_cents" >= 0))
);

ALTER TABLE "public"."sale_days" OWNER TO "postgres";

CREATE OR REPLACE VIEW "public"."sale_day_cash" WITH ("security_invoker"='true') AS
 WITH "totals" AS (
         SELECT "cash_counts"."sale_day_id",
            ("sum"(("cash_counts"."denom_cents" * "cash_counts"."qty")) FILTER (WHERE ("cash_counts"."kind" = 'open'::"public"."cash_count_kind")))::integer AS "open_cents",
            ("sum"(("cash_counts"."denom_cents" * "cash_counts"."qty")) FILTER (WHERE ("cash_counts"."kind" = 'close'::"public"."cash_count_kind")))::integer AS "close_cents"
           FROM "public"."cash_counts"
          GROUP BY "cash_counts"."sale_day_id"
        )
 SELECT "d"."id" AS "sale_day_id",
    "d"."sale_date",
    "d"."phase",
    "d"."selling_at",
    "d"."closed_at",
    "t"."open_cents",
    "t"."close_cents",
    ("t"."close_cents" - "t"."open_cents") AS "revenue_cents",
    "d"."left_in_box_cents",
    ("t"."close_cents" - "d"."left_in_box_cents") AS "deposit_cents",
    "prev"."left_in_box_cents" AS "expected_open_cents",
    ("t"."open_cents" - "prev"."left_in_box_cents") AS "open_diff_cents",
    "d"."open_note",
    "d"."close_note",
    "sb"."display_name" AS "opened_by_name",
    "cb"."display_name" AS "closed_by_name"
   FROM (((("public"."sale_days" "d"
     JOIN "totals" "t" ON (("t"."sale_day_id" = "d"."id")))
     LEFT JOIN LATERAL ( SELECT "p"."left_in_box_cents"
           FROM "public"."sale_days" "p"
          WHERE (("p"."phase" = 'closed'::"public"."sale_phase") AND ("p"."sale_date" < "d"."sale_date"))
          ORDER BY "p"."sale_date" DESC
         LIMIT 1) "prev" ON (true))
     LEFT JOIN "public"."profiles" "sb" ON (("sb"."id" = "d"."selling_by")))
     LEFT JOIN "public"."profiles" "cb" ON (("cb"."id" = "d"."closed_by")));

ALTER VIEW "public"."sale_day_cash" OWNER TO "postgres";

CREATE OR REPLACE VIEW "public"."insights_months" WITH ("security_invoker"='true') AS
 WITH "rev" AS (
         SELECT ("date_trunc"('month'::"text", ("sale_day_cash"."sale_date")::timestamp with time zone))::"date" AS "month",
            ("sum"("sale_day_cash"."revenue_cents"))::integer AS "revenue_cents"
           FROM "public"."sale_day_cash"
          WHERE ("sale_day_cash"."phase" = 'closed'::"public"."sale_phase")
          GROUP BY (("date_trunc"('month'::"text", ("sale_day_cash"."sale_date")::timestamp with time zone))::"date")
        ), "spent" AS (
         SELECT ("date_trunc"('month'::"text", ("claims"."purchased_on")::timestamp with time zone))::"date" AS "month",
            ("sum"("claims"."net_cents"))::integer AS "claims_cents"
           FROM "public"."claims"
          GROUP BY (("date_trunc"('month'::"text", ("claims"."purchased_on")::timestamp with time zone))::"date")
        )
 SELECT COALESCE("r"."month", "s"."month") AS "month",
    COALESCE("r"."revenue_cents", 0) AS "revenue_cents",
    COALESCE("s"."claims_cents", 0) AS "claims_cents",
    (COALESCE("r"."revenue_cents", 0) - COALESCE("s"."claims_cents", 0)) AS "difference_cents"
   FROM ("rev" "r"
     FULL JOIN "spent" "s" ON (("s"."month" = "r"."month")));

ALTER VIEW "public"."insights_months" OWNER TO "postgres";

CREATE OR REPLACE VIEW "public"."insights_best_month" WITH ("security_invoker"='true') AS
 SELECT "month",
    "revenue_cents",
    "claims_cents",
    "difference_cents"
   FROM "public"."insights_months"
  WHERE (( SELECT "count"(*) AS "count"
           FROM "public"."insights_months" "insights_months_1") >= 2)
  ORDER BY "difference_cents" DESC, "month" DESC
 LIMIT 1;

ALTER VIEW "public"."insights_best_month" OWNER TO "postgres";

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
    "refund_id" "uuid",
    "seq" bigint NOT NULL,
    "repack_id" "uuid",
    CONSTRAINT "stock_movements_qty_check" CHECK ((("qty" <> 0) OR ("reason" = 'count'::"public"."movement_reason"))),
    CONSTRAINT "stock_movements_repack" CHECK ((("reason" = 'repacked'::"public"."movement_reason") = ("repack_id" IS NOT NULL))),
    CONSTRAINT "stock_movements_sign" CHECK (((("reason" = ANY (ARRAY['purchase'::"public"."movement_reason", 'found'::"public"."movement_reason"])) AND ("qty" > 0)) OR (("reason" = ANY (ARRAY['sold'::"public"."movement_reason", 'out'::"public"."movement_reason", 'missing'::"public"."movement_reason", 'damaged'::"public"."movement_reason", 'donated'::"public"."movement_reason", 'returned'::"public"."movement_reason"])) AND ("qty" < 0)) OR ("reason" = ANY (ARRAY['correction'::"public"."movement_reason", 'count'::"public"."movement_reason", 'repacked'::"public"."movement_reason"]))))
);

ALTER TABLE "public"."stock_movements" OWNER TO "postgres";

CREATE OR REPLACE VIEW "public"."item_counts" WITH ("security_invoker"='true') AS
 WITH "last_count" AS (
         SELECT DISTINCT ON ("stock_movements"."item_id") "stock_movements"."item_id",
            "stock_movements"."seq",
            "stock_movements"."qty",
            "stock_movements"."created_at"
           FROM "public"."stock_movements"
          WHERE ("stock_movements"."reason" = 'count'::"public"."movement_reason")
          ORDER BY "stock_movements"."item_id", "stock_movements"."seq" DESC
        )
 SELECT "i"."id" AS "item_id",
    "lc"."created_at" AS "last_counted_at",
        CASE
            WHEN ("lc"."seq" IS NOT NULL) THEN (( SELECT COALESCE("sum"("m"."qty"), (0)::bigint) AS "coalesce"
               FROM "public"."stock_movements" "m"
              WHERE (("m"."item_id" = "i"."id") AND ("m"."seq" <= "lc"."seq"))))::integer
            ELSE NULL::integer
        END AS "last_counted_pieces",
    (( SELECT COALESCE("sum"("m"."qty"), (0)::bigint) AS "coalesce"
           FROM "public"."stock_movements" "m"
          WHERE (("m"."item_id" = "i"."id") AND ("m"."reason" = ANY (ARRAY['purchase'::"public"."movement_reason", 'returned'::"public"."movement_reason"])) AND (("lc"."seq" IS NULL) OR ("m"."seq" > "lc"."seq")))))::integer AS "bought_since",
        CASE
            WHEN (EXISTS ( SELECT 1
               FROM "public"."stock_movements" "c"
              WHERE (("c"."item_id" = "i"."id") AND ("c"."reason" = 'count'::"public"."movement_reason") AND ((("c"."created_at" AT TIME ZONE 'America/Vancouver'::"text"))::"date" < (("lc"."created_at" AT TIME ZONE 'America/Vancouver'::"text"))::"date")))) THEN (- (( SELECT "sum"("c"."qty") AS "sum"
               FROM "public"."stock_movements" "c"
              WHERE (("c"."item_id" = "i"."id") AND ("c"."reason" = 'count'::"public"."movement_reason") AND ((("c"."created_at" AT TIME ZONE 'America/Vancouver'::"text"))::"date" = (("lc"."created_at" AT TIME ZONE 'America/Vancouver'::"text"))::"date"))))::integer)
            ELSE NULL::integer
        END AS "pieces_gone",
    (( SELECT COALESCE("sum"("m"."qty"), (0)::bigint) AS "coalesce"
           FROM "public"."stock_movements" "m"
          WHERE (("m"."item_id" = "i"."id") AND ("m"."reason" = 'repacked'::"public"."movement_reason") AND (("lc"."seq" IS NULL) OR ("m"."seq" > "lc"."seq")))))::integer AS "repacked_since"
   FROM ("public"."items" "i"
     LEFT JOIN "last_count" "lc" ON (("lc"."item_id" = "i"."id")));

ALTER VIEW "public"."item_counts" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."repacks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pack_item_id" "uuid" NOT NULL,
    "packs" integer NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "public"."actor"(),
    CONSTRAINT "repacks_packs_check" CHECK (("packs" >= 1))
);

ALTER TABLE "public"."repacks" OWNER TO "postgres";

CREATE OR REPLACE VIEW "public"."insights_items" WITH ("security_invoker"='true') AS
 SELECT "i"."id" AS "item_id",
    "i"."name",
    "i"."price_cents",
    "i"."bundle_size",
    "i"."unit_cost_cents",
    "c"."last_counted_at",
    "c"."pieces_gone",
        CASE
            WHEN ("i"."price_cents" IS NOT NULL) THEN ("round"(((("c"."pieces_gone")::numeric * ("i"."price_cents")::numeric) / ("i"."bundle_size")::numeric)))::integer
            ELSE NULL::integer
        END AS "revenue_estimate_cents",
        CASE
            WHEN ("i"."price_cents" IS NOT NULL) THEN ((1)::numeric - (("i"."unit_cost_cents" * ("i"."bundle_size")::numeric) / ("i"."price_cents")::numeric))
            ELSE NULL::numeric
        END AS "margin",
    (EXISTS ( SELECT 1
           FROM "public"."repacks" "r"
          WHERE ("r"."pack_item_id" = "i"."id"))) AS "made_by_repack"
   FROM ("public"."items" "i"
     JOIN "public"."item_counts" "c" ON (("c"."item_id" = "i"."id")))
  WHERE (("c"."pieces_gone" IS NOT NULL) AND (NOT "i"."archived") AND ("i"."price_cents" IS NOT NULL));

ALTER VIEW "public"."insights_items" OWNER TO "postgres";

CREATE OR REPLACE VIEW "public"."insights_low_margin_items" WITH ("security_invoker"='true') AS
 SELECT "i"."id" AS "item_id",
    "i"."name",
    "c"."bought_since",
    ((1)::numeric - (("i"."unit_cost_cents" * ("i"."bundle_size")::numeric) / ("i"."price_cents")::numeric)) AS "margin"
   FROM ("public"."items" "i"
     JOIN "public"."item_counts" "c" ON (("c"."item_id" = "i"."id")))
  WHERE ((NOT "i"."archived") AND ("i"."price_cents" IS NOT NULL) AND (("c"."bought_since" > 0) OR ("c"."repacked_since" > 0)) AND (((1)::numeric - (("i"."unit_cost_cents" * ("i"."bundle_size")::numeric) / ("i"."price_cents")::numeric)) < 0.3));

ALTER VIEW "public"."insights_low_margin_items" OWNER TO "postgres";

CREATE OR REPLACE VIEW "public"."insights_open_count_off" WITH ("security_invoker"='true') AS
 SELECT ("count"(*))::integer AS "sale_days"
   FROM "public"."sale_day_cash"
  WHERE (("phase" = 'closed'::"public"."sale_phase") AND ("open_diff_cents" IS NOT NULL) AND ("open_diff_cents" <> 0))
 HAVING ("count"(*) > 0);

ALTER VIEW "public"."insights_open_count_off" OWNER TO "postgres";

CREATE OR REPLACE VIEW "public"."insights_revenue_trend" WITH ("security_invoker"='true') AS
 WITH "days" AS (
         SELECT "sale_day_cash"."sale_date",
            "sale_day_cash"."revenue_cents",
            "row_number"() OVER (ORDER BY "sale_day_cash"."sale_date" DESC) AS "rn"
           FROM "public"."sale_day_cash"
          WHERE ("sale_day_cash"."phase" = 'closed'::"public"."sale_phase")
        ), "usual" AS (
         SELECT ("round"("avg"("days"."revenue_cents")))::integer AS "usual_cents"
           FROM "days"
          WHERE ("days"."rn" > 1)
        )
 SELECT "d"."sale_date",
    "d"."revenue_cents",
    "u"."usual_cents",
    ("d"."revenue_cents" - "u"."usual_cents") AS "difference_cents"
   FROM "days" "d",
    "usual" "u"
  WHERE (("d"."rn" = 1) AND ("u"."usual_cents" IS NOT NULL) AND ("d"."revenue_cents" <> "u"."usual_cents"));

ALTER VIEW "public"."insights_revenue_trend" OWNER TO "postgres";

CREATE OR REPLACE VIEW "public"."insights_slowest_item" WITH ("security_invoker"='true') AS
 SELECT "item_id",
    "name",
    "pieces_gone"
   FROM "public"."insights_items"
  WHERE (( SELECT "count"(*) AS "count"
           FROM "public"."insights_items" "insights_items_1") >= 2)
  ORDER BY "pieces_gone", "name"
 LIMIT 1;

ALTER VIEW "public"."insights_slowest_item" OWNER TO "postgres";

CREATE OR REPLACE VIEW "public"."insights_term" WITH ("security_invoker"='true') AS
 SELECT (( SELECT "count"(*) AS "count"
           FROM "public"."sale_day_cash"
          WHERE ("sale_day_cash"."phase" = 'closed'::"public"."sale_phase")))::integer AS "sale_days",
    (COALESCE(( SELECT "sum"("sale_day_cash"."revenue_cents") AS "sum"
           FROM "public"."sale_day_cash"
          WHERE ("sale_day_cash"."phase" = 'closed'::"public"."sale_phase")), (0)::bigint))::integer AS "revenue_cents",
    (COALESCE(( SELECT "sum"("claims"."net_cents") AS "sum"
           FROM "public"."claims"), (0)::bigint))::integer AS "claims_cents",
    ((COALESCE(( SELECT "sum"("sale_day_cash"."revenue_cents") AS "sum"
           FROM "public"."sale_day_cash"
          WHERE ("sale_day_cash"."phase" = 'closed'::"public"."sale_phase")), (0)::bigint) - COALESCE(( SELECT "sum"("claims"."net_cents") AS "sum"
           FROM "public"."claims"), (0)::bigint)))::integer AS "difference_cents",
    ( SELECT ("round"("avg"("sale_day_cash"."revenue_cents")))::integer AS "round"
           FROM "public"."sale_day_cash"
          WHERE ("sale_day_cash"."phase" = 'closed'::"public"."sale_phase")) AS "revenue_per_day_cents";

ALTER VIEW "public"."insights_term" OWNER TO "postgres";

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
    ("s"."created_at" > ("now"() - '30 days'::interval)) AS "is_new",
    "last_buy"."buyer_name" AS "last_bought_by",
    "last_buy"."purchased_on" AS "last_bought_on",
    "editor"."display_name" AS "updated_by_name",
    "c"."last_counted_at",
    "c"."last_counted_pieces",
    "c"."bought_since",
    "c"."pieces_gone",
    "c"."repacked_since",
    (EXISTS ( SELECT 1
           FROM "public"."repacks" "r"
          WHERE ("r"."pack_item_id" = "s"."id"))) AS "made_by_repack",
    (EXISTS ( SELECT 1
           FROM "public"."stock_movements" "m"
          WHERE (("m"."item_id" = "s"."id") AND ("m"."reason" = 'repacked'::"public"."movement_reason") AND ("m"."qty" < 0)))) AS "in_repacks"
   FROM ((("public"."item_stock" "s"
     LEFT JOIN LATERAL ( SELECT "pr"."display_name" AS "buyer_name",
            "p"."purchased_on"
           FROM (("public"."purchase_lines" "l"
             JOIN "public"."purchases" "p" ON (("p"."id" = "l"."purchase_id")))
             JOIN "public"."profiles" "pr" ON (("pr"."id" = "p"."buyer_id")))
          WHERE ("l"."item_id" = "s"."id")
          ORDER BY "p"."purchased_on" DESC, "p"."claim_no" DESC
         LIMIT 1) "last_buy" ON (true))
     LEFT JOIN "public"."profiles" "editor" ON (("editor"."id" = "s"."updated_by")))
     LEFT JOIN "public"."item_counts" "c" ON (("c"."item_id" = "s"."id")));

ALTER VIEW "public"."item_overview" OWNER TO "postgres";

CREATE OR REPLACE VIEW "public"."last_claims_send" WITH ("security_invoker"='true') AS
 SELECT "s"."id",
    "s"."sent_at",
    "s"."sent_to",
    "s"."claim_count",
    "s"."total_cents",
    "p"."display_name" AS "sent_by_name"
   FROM ("public"."claim_sends" "s"
     JOIN "public"."profiles" "p" ON (("p"."id" = "s"."sent_by")))
  ORDER BY "s"."sent_at" DESC
 LIMIT 1;

ALTER VIEW "public"."last_claims_send" OWNER TO "postgres";

ALTER TABLE "public"."purchases" ALTER COLUMN "claim_no" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."purchases_claim_no_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE IF NOT EXISTS "public"."settings" (
    "id" boolean DEFAULT true NOT NULL,
    "float_cents" integer DEFAULT 3000 NOT NULL,
    "gst_rate" numeric(5,4) DEFAULT 0.05 NOT NULL,
    "treasurer_email" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid",
    CONSTRAINT "settings_float_cents_check" CHECK (("float_cents" >= 0)),
    CONSTRAINT "settings_id_check" CHECK ("id")
);

ALTER TABLE "public"."settings" OWNER TO "postgres";

ALTER TABLE "public"."stock_movements" ALTER COLUMN "seq" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."stock_movements_seq_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE OR REPLACE VIEW "public"."type_benchmarks" WITH ("security_invoker"='true') AS
 SELECT "type",
    COALESCE(( SELECT "avg"("i"."unit_cost_cents") AS "avg"
           FROM "public"."item_overview" "i"
          WHERE (("i"."type" = "t"."type") AND (NOT "i"."archived") AND (NOT "i"."is_new") AND (NOT "i"."made_by_repack") AND ("i"."price_cents" IS NOT NULL) AND ("i"."unit_cost_cents" > (0)::numeric))), ( SELECT "avg"("i"."unit_cost_cents") AS "avg"
           FROM "public"."item_overview" "i"
          WHERE (("i"."type" = "t"."type") AND (NOT "i"."archived") AND (NOT "i"."made_by_repack") AND ("i"."price_cents" IS NOT NULL) AND ("i"."unit_cost_cents" > (0)::numeric)))) AS "usual_cost_cents"
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
    "full_name" "text",
    CONSTRAINT "volunteer_invites_display_name_check" CHECK (("length"(TRIM(BOTH FROM "display_name")) > 0)),
    CONSTRAINT "volunteer_invites_display_name_length" CHECK (("char_length"("display_name") <= 30)),
    CONSTRAINT "volunteer_invites_email_check" CHECK ((POSITION(('@'::"text") IN ("email")) > 1)),
    CONSTRAINT "volunteer_invites_full_name_check" CHECK ((("full_name" IS NULL) OR ("length"(TRIM(BOTH FROM "full_name")) > 0))),
    CONSTRAINT "volunteer_invites_full_name_length" CHECK (("char_length"("full_name") <= 100))
);

ALTER TABLE "public"."volunteer_invites" OWNER TO "postgres";

ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."cash_counts"
    ADD CONSTRAINT "cash_counts_pkey" PRIMARY KEY ("sale_day_id", "kind", "denom_cents");

ALTER TABLE ONLY "public"."claim_sends"
    ADD CONSTRAINT "claim_sends_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."items"
    ADD CONSTRAINT "items_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."purchase_lines"
    ADD CONSTRAINT "purchase_lines_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."purchase_lines"
    ADD CONSTRAINT "purchase_lines_purchase_id_line_no_key" UNIQUE ("purchase_id", "line_no");

ALTER TABLE ONLY "public"."purchase_refunds"
    ADD CONSTRAINT "purchase_refunds_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."purchases"
    ADD CONSTRAINT "purchases_claim_no_key" UNIQUE ("claim_no");

ALTER TABLE ONLY "public"."purchases"
    ADD CONSTRAINT "purchases_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."repacks"
    ADD CONSTRAINT "repacks_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."sale_days"
    ADD CONSTRAINT "sale_days_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."sale_days"
    ADD CONSTRAINT "sale_days_sale_date_key" UNIQUE ("sale_date");

ALTER TABLE ONLY "public"."settings"
    ADD CONSTRAINT "settings_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."volunteer_invites"
    ADD CONSTRAINT "volunteer_invites_pkey" PRIMARY KEY ("id");

CREATE INDEX "audit_log_table_name_row_pk_idx" ON "public"."audit_log" USING "btree" ("table_name", "row_pk");

CREATE UNIQUE INDEX "profiles_display_name_key" ON "public"."profiles" USING "btree" ("lower"("display_name"));

CREATE UNIQUE INDEX "profiles_email_key" ON "public"."profiles" USING "btree" ("lower"("email"));

CREATE INDEX "purchase_refunds_purchase_line_id_idx" ON "public"."purchase_refunds" USING "btree" ("purchase_line_id");

CREATE INDEX "repacks_pack_item_id_idx" ON "public"."repacks" USING "btree" ("pack_item_id");

CREATE UNIQUE INDEX "sale_days_one_open" ON "public"."sale_days" USING "btree" ("phase") WHERE ("phase" = 'open'::"public"."sale_phase");

CREATE INDEX "stock_movements_item_id_idx" ON "public"."stock_movements" USING "btree" ("item_id");

CREATE INDEX "stock_movements_repack_id_idx" ON "public"."stock_movements" USING "btree" ("repack_id") WHERE ("repack_id" IS NOT NULL);

CREATE INDEX "stock_movements_sale_day_id_idx" ON "public"."stock_movements" USING "btree" ("sale_day_id");

CREATE UNIQUE INDEX "stock_movements_seq" ON "public"."stock_movements" USING "btree" ("seq");

CREATE UNIQUE INDEX "volunteer_invites_display_name_open" ON "public"."volunteer_invites" USING "btree" ("lower"("display_name")) WHERE ("accepted_at" IS NULL);

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

CREATE OR REPLACE TRIGGER "audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."cash_counts" FOR EACH ROW EXECUTE FUNCTION "public"."audit_row"('sale_day_id');

CREATE OR REPLACE TRIGGER "audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."items" FOR EACH ROW EXECUTE FUNCTION "public"."audit_row"('id');

CREATE OR REPLACE TRIGGER "audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."audit_row"('id');

CREATE OR REPLACE TRIGGER "audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."purchase_lines" FOR EACH ROW EXECUTE FUNCTION "public"."audit_row"('id');

CREATE OR REPLACE TRIGGER "audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."purchase_refunds" FOR EACH ROW EXECUTE FUNCTION "public"."audit_row"('id');

CREATE OR REPLACE TRIGGER "audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."purchases" FOR EACH ROW EXECUTE FUNCTION "public"."audit_row"('id');

CREATE OR REPLACE TRIGGER "audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."repacks" FOR EACH ROW EXECUTE FUNCTION "public"."audit_row"('id');

CREATE OR REPLACE TRIGGER "audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."sale_days" FOR EACH ROW EXECUTE FUNCTION "public"."audit_row"('id');

CREATE OR REPLACE TRIGGER "audit" AFTER UPDATE ON "public"."settings" FOR EACH ROW EXECUTE FUNCTION "public"."audit_row"('id');

CREATE OR REPLACE TRIGGER "audit" AFTER INSERT ON "public"."stock_movements" FOR EACH ROW EXECUTE FUNCTION "public"."audit_row"('id');

CREATE OR REPLACE TRIGGER "audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."volunteer_invites" FOR EACH ROW EXECUTE FUNCTION "public"."audit_row"('id');

CREATE OR REPLACE TRIGGER "cash_counts_guard" BEFORE INSERT OR DELETE OR UPDATE ON "public"."cash_counts" FOR EACH ROW EXECUTE FUNCTION "public"."cash_counts_guard"();

CREATE OR REPLACE TRIGGER "items_touch" BEFORE UPDATE ON "public"."items" FOR EACH ROW EXECUTE FUNCTION "public"."items_touch"();

CREATE OR REPLACE TRIGGER "profiles_guard" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."profiles_guard"();

CREATE OR REPLACE TRIGGER "settings_touch" BEFORE UPDATE ON "public"."settings" FOR EACH ROW EXECUTE FUNCTION "public"."settings_touch"();

CREATE OR REPLACE TRIGGER "stock_movements_append_only" BEFORE DELETE OR UPDATE ON "public"."stock_movements" FOR EACH ROW EXECUTE FUNCTION "public"."forbid_change"();

CREATE OR REPLACE TRIGGER "stock_movements_repack_side" BEFORE INSERT ON "public"."stock_movements" FOR EACH ROW WHEN (("new"."reason" = 'repacked'::"public"."movement_reason")) EXECUTE FUNCTION "public"."check_repack_side"();

ALTER TABLE ONLY "public"."cash_counts"
    ADD CONSTRAINT "cash_counts_sale_day_id_fkey" FOREIGN KEY ("sale_day_id") REFERENCES "public"."sale_days"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."claim_sends"
    ADD CONSTRAINT "claim_sends_sent_by_fkey" FOREIGN KEY ("sent_by") REFERENCES "public"."profiles"("id");

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."purchase_lines"
    ADD CONSTRAINT "purchase_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id");

ALTER TABLE ONLY "public"."purchase_lines"
    ADD CONSTRAINT "purchase_lines_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."purchase_refunds"
    ADD CONSTRAINT "purchase_refunds_purchase_line_id_fkey" FOREIGN KEY ("purchase_line_id") REFERENCES "public"."purchase_lines"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."purchases"
    ADD CONSTRAINT "purchases_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "public"."profiles"("id");

ALTER TABLE ONLY "public"."purchases"
    ADD CONSTRAINT "purchases_paid_by_fkey" FOREIGN KEY ("paid_by") REFERENCES "public"."profiles"("id");

ALTER TABLE ONLY "public"."repacks"
    ADD CONSTRAINT "repacks_pack_item_id_fkey" FOREIGN KEY ("pack_item_id") REFERENCES "public"."items"("id");

ALTER TABLE ONLY "public"."sale_days"
    ADD CONSTRAINT "sale_days_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "public"."profiles"("id");

ALTER TABLE ONLY "public"."sale_days"
    ADD CONSTRAINT "sale_days_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");

ALTER TABLE ONLY "public"."sale_days"
    ADD CONSTRAINT "sale_days_selling_by_fkey" FOREIGN KEY ("selling_by") REFERENCES "public"."profiles"("id");

ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id");

ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_purchase_line_id_fkey" FOREIGN KEY ("purchase_line_id") REFERENCES "public"."purchase_lines"("id");

ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_repack_id_fkey" FOREIGN KEY ("repack_id") REFERENCES "public"."repacks"("id");

ALTER TABLE ONLY "public"."volunteer_invites"
    ADD CONSTRAINT "volunteer_invites_accepted_by_fkey" FOREIGN KEY ("accepted_by") REFERENCES "public"."profiles"("id");

CREATE POLICY "admin_delete" ON "public"."volunteer_invites" FOR DELETE TO "authenticated" USING ("public"."has_role"('admin'::"public"."user_role"));

CREATE POLICY "admin_read" ON "public"."volunteer_invites" FOR SELECT TO "authenticated" USING ("public"."has_role"('admin'::"public"."user_role"));

CREATE POLICY "admin_write" ON "public"."settings" FOR UPDATE TO "authenticated" USING ("public"."has_role"('admin'::"public"."user_role")) WITH CHECK ("public"."has_role"('admin'::"public"."user_role"));

ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."cash_counts" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."claim_sends" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."items" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "member_insert" ON "public"."stock_movements" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_member"() AND ("reason" = ANY (ARRAY['donated'::"public"."movement_reason", 'correction'::"public"."movement_reason"]))));

CREATE POLICY "member_write" ON "public"."cash_counts" FOR UPDATE TO "authenticated" USING ("public"."is_member"()) WITH CHECK ("public"."is_member"());

CREATE POLICY "member_write" ON "public"."items" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_member"());

CREATE POLICY "member_write_u" ON "public"."items" FOR UPDATE TO "authenticated" USING ("public"."is_member"()) WITH CHECK ("public"."is_member"());

ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."purchase_lines" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."purchase_refunds" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."purchases" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_all" ON "public"."audit_log" FOR SELECT TO "authenticated" USING ("public"."is_member"());

CREATE POLICY "read_all" ON "public"."cash_counts" FOR SELECT TO "authenticated" USING ("public"."is_member"());

CREATE POLICY "read_all" ON "public"."claim_sends" FOR SELECT TO "authenticated" USING ("public"."is_member"());

CREATE POLICY "read_all" ON "public"."items" FOR SELECT TO "authenticated" USING ("public"."is_member"());

CREATE POLICY "read_all" ON "public"."profiles" FOR SELECT TO "authenticated" USING ("public"."is_member"());

CREATE POLICY "read_all" ON "public"."purchase_lines" FOR SELECT TO "authenticated" USING ("public"."is_member"());

CREATE POLICY "read_all" ON "public"."purchase_refunds" FOR SELECT TO "authenticated" USING ("public"."is_member"());

CREATE POLICY "read_all" ON "public"."purchases" FOR SELECT TO "authenticated" USING ("public"."is_member"());

CREATE POLICY "read_all" ON "public"."repacks" FOR SELECT TO "authenticated" USING ("public"."is_member"());

CREATE POLICY "read_all" ON "public"."sale_days" FOR SELECT TO "authenticated" USING ("public"."is_member"());

CREATE POLICY "read_all" ON "public"."settings" FOR SELECT TO "authenticated" USING ("public"."is_member"());

CREATE POLICY "read_all" ON "public"."stock_movements" FOR SELECT TO "authenticated" USING ("public"."is_member"());

ALTER TABLE "public"."repacks" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."sale_days" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."settings" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."stock_movements" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."volunteer_invites" ENABLE ROW LEVEL SECURITY;

ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";

ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."cash_counts";

ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."sale_days";

GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

GRANT ALL ON FUNCTION "public"."actor"() TO "anon";
GRANT ALL ON FUNCTION "public"."actor"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."actor"() TO "service_role";

GRANT ALL ON FUNCTION "public"."add_volunteer"("p_email" "text", "p_name" "text", "p_role" "public"."user_role", "p_full_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."add_volunteer"("p_email" "text", "p_name" "text", "p_role" "public"."user_role", "p_full_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_volunteer"("p_email" "text", "p_name" "text", "p_role" "public"."user_role", "p_full_name" "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."audit_row"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_row"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_row"() TO "service_role";

GRANT ALL ON FUNCTION "public"."cancel_sale_day"("p_sale_day" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."cancel_sale_day"("p_sale_day" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_sale_day"("p_sale_day" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."cash_counts_guard"() TO "anon";
GRANT ALL ON FUNCTION "public"."cash_counts_guard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cash_counts_guard"() TO "service_role";

GRANT ALL ON FUNCTION "public"."cents_text"("p_cents" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."cents_text"("p_cents" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."cents_text"("p_cents" integer) TO "service_role";

GRANT ALL ON FUNCTION "public"."check_repack_side"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_repack_side"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_repack_side"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."claims_report"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claims_report"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."claims_report"() TO "service_role";

GRANT ALL ON FUNCTION "public"."close_sale_day"("p_sale_day" "uuid", "p_left_in_box_cents" integer, "p_note" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."close_sale_day"("p_sale_day" "uuid", "p_left_in_box_cents" integer, "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."close_sale_day"("p_sale_day" "uuid", "p_left_in_box_cents" integer, "p_note" "text") TO "service_role";

REVOKE ALL ON FUNCTION "public"."display_name_check"("p_name" "text", "p_profile" "uuid", "p_invite" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."display_name_check"("p_name" "text", "p_profile" "uuid", "p_invite" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."forbid_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."forbid_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."forbid_change"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."full_name_check"("p_full_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."full_name_check"("p_full_name" "text") TO "service_role";

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

GRANT ALL ON FUNCTION "public"."items_touch"() TO "anon";
GRANT ALL ON FUNCTION "public"."items_touch"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."items_touch"() TO "service_role";

GRANT ALL ON FUNCTION "public"."local_today"() TO "anon";
GRANT ALL ON FUNCTION "public"."local_today"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."local_today"() TO "service_role";

GRANT ALL ON FUNCTION "public"."log_purchase"("p" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."log_purchase"("p" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_purchase"("p" "jsonb") TO "service_role";

REVOKE ALL ON FUNCTION "public"."mark_claim_unpaid"("p_purchase_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_claim_unpaid"("p_purchase_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_claim_unpaid"("p_purchase_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."mark_claims_paid"("p_purchase_ids" "uuid"[], "p_expected_cents" integer, "p_paid_on" "date", "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_claims_paid"("p_purchase_ids" "uuid"[], "p_expected_cents" integer, "p_paid_on" "date", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_claims_paid"("p_purchase_ids" "uuid"[], "p_expected_cents" integer, "p_paid_on" "date", "p_note" "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."open_sale_day"("p_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."open_sale_day"("p_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."open_sale_day"("p_date" "date") TO "service_role";

GRANT ALL ON FUNCTION "public"."profiles_guard"() TO "anon";
GRANT ALL ON FUNCTION "public"."profiles_guard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."profiles_guard"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."record_claims_send"("p_sent_to" "text", "p_claim_count" integer, "p_total_cents" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_claims_send"("p_sent_to" "text", "p_claim_count" integer, "p_total_cents" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_claims_send"("p_sent_to" "text", "p_claim_count" integer, "p_total_cents" integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."refund_purchase_line"("p_id" "uuid", "p_line" "uuid", "p_pieces" integer, "p_amount_cents" integer, "p_refunded_on" "date", "p_slip_path" "text", "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."refund_purchase_line"("p_id" "uuid", "p_line" "uuid", "p_pieces" integer, "p_amount_cents" integer, "p_refunded_on" "date", "p_slip_path" "text", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."refund_purchase_line"("p_id" "uuid", "p_line" "uuid", "p_pieces" integer, "p_amount_cents" integer, "p_refunded_on" "date", "p_slip_path" "text", "p_note" "text") TO "service_role";

REVOKE ALL ON FUNCTION "public"."repack"("p" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."repack"("p" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."repack"("p" "jsonb") TO "service_role";

REVOKE ALL ON FUNCTION "public"."require_coordinator"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."require_coordinator"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."require_coordinator"() TO "service_role";

GRANT ALL ON FUNCTION "public"."require_member"() TO "anon";
GRANT ALL ON FUNCTION "public"."require_member"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."require_member"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."save_stock_count"("p_counts" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_stock_count"("p_counts" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_stock_count"("p_counts" "jsonb") TO "service_role";

REVOKE ALL ON FUNCTION "public"."set_member_active"("p_id" "uuid", "p_active" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_member_active"("p_id" "uuid", "p_active" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_member_active"("p_id" "uuid", "p_active" boolean) TO "service_role";

GRANT ALL ON FUNCTION "public"."settings_touch"() TO "anon";
GRANT ALL ON FUNCTION "public"."settings_touch"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."settings_touch"() TO "service_role";

GRANT ALL ON FUNCTION "public"."start_selling"("p_sale_day" "uuid", "p_note" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."start_selling"("p_sale_day" "uuid", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."start_selling"("p_sale_day" "uuid", "p_note" "text") TO "service_role";

REVOKE ALL ON FUNCTION "public"."undo_refund"("p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."undo_refund"("p_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."undo_refund"("p_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."update_invite"("p_id" "uuid", "p_display_name" "text", "p_full_name" "text", "p_role" "public"."user_role") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_invite"("p_id" "uuid", "p_display_name" "text", "p_full_name" "text", "p_role" "public"."user_role") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_invite"("p_id" "uuid", "p_display_name" "text", "p_full_name" "text", "p_role" "public"."user_role") TO "service_role";

REVOKE ALL ON FUNCTION "public"."update_my_profile"("p_display_name" "text", "p_full_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_my_profile"("p_display_name" "text", "p_full_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_my_profile"("p_display_name" "text", "p_full_name" "text") TO "service_role";

REVOKE ALL ON FUNCTION "public"."update_team_member"("p_id" "uuid", "p_display_name" "text", "p_full_name" "text", "p_role" "public"."user_role") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_team_member"("p_id" "uuid", "p_display_name" "text", "p_full_name" "text", "p_role" "public"."user_role") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_team_member"("p_id" "uuid", "p_display_name" "text", "p_full_name" "text", "p_role" "public"."user_role") TO "service_role";

GRANT ALL ON TABLE "public"."audit_log" TO "anon";
GRANT ALL ON TABLE "public"."audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_log" TO "service_role";

GRANT ALL ON SEQUENCE "public"."audit_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."audit_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."audit_log_id_seq" TO "service_role";

GRANT ALL ON TABLE "public"."cash_counts" TO "anon";
GRANT ALL ON TABLE "public"."cash_counts" TO "authenticated";
GRANT ALL ON TABLE "public"."cash_counts" TO "service_role";

GRANT ALL ON TABLE "public"."items" TO "anon";
GRANT ALL ON TABLE "public"."items" TO "authenticated";
GRANT ALL ON TABLE "public"."items" TO "service_role";

GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";

GRANT ALL ON TABLE "public"."change_history" TO "anon";
GRANT ALL ON TABLE "public"."change_history" TO "authenticated";
GRANT ALL ON TABLE "public"."change_history" TO "service_role";

GRANT ALL ON TABLE "public"."purchase_lines" TO "anon";
GRANT ALL ON TABLE "public"."purchase_lines" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_lines" TO "service_role";

GRANT ALL ON TABLE "public"."purchase_refunds" TO "anon";
GRANT ALL ON TABLE "public"."purchase_refunds" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_refunds" TO "service_role";

GRANT ALL ON TABLE "public"."claim_lines" TO "anon";
GRANT ALL ON TABLE "public"."claim_lines" TO "authenticated";
GRANT ALL ON TABLE "public"."claim_lines" TO "service_role";

GRANT ALL ON TABLE "public"."claim_refunds" TO "anon";
GRANT ALL ON TABLE "public"."claim_refunds" TO "authenticated";
GRANT ALL ON TABLE "public"."claim_refunds" TO "service_role";

GRANT ALL ON TABLE "public"."claim_sends" TO "anon";
GRANT ALL ON TABLE "public"."claim_sends" TO "authenticated";
GRANT ALL ON TABLE "public"."claim_sends" TO "service_role";

GRANT ALL ON TABLE "public"."purchases" TO "anon";
GRANT ALL ON TABLE "public"."purchases" TO "authenticated";
GRANT ALL ON TABLE "public"."purchases" TO "service_role";

GRANT ALL ON TABLE "public"."claims" TO "anon";
GRANT ALL ON TABLE "public"."claims" TO "authenticated";
GRANT ALL ON TABLE "public"."claims" TO "service_role";

GRANT ALL ON TABLE "public"."sale_days" TO "anon";
GRANT ALL ON TABLE "public"."sale_days" TO "authenticated";
GRANT ALL ON TABLE "public"."sale_days" TO "service_role";

GRANT ALL ON TABLE "public"."sale_day_cash" TO "anon";
GRANT ALL ON TABLE "public"."sale_day_cash" TO "authenticated";
GRANT ALL ON TABLE "public"."sale_day_cash" TO "service_role";

GRANT ALL ON TABLE "public"."insights_months" TO "anon";
GRANT ALL ON TABLE "public"."insights_months" TO "authenticated";
GRANT ALL ON TABLE "public"."insights_months" TO "service_role";

GRANT ALL ON TABLE "public"."insights_best_month" TO "anon";
GRANT ALL ON TABLE "public"."insights_best_month" TO "authenticated";
GRANT ALL ON TABLE "public"."insights_best_month" TO "service_role";

GRANT ALL ON TABLE "public"."stock_movements" TO "anon";
GRANT ALL ON TABLE "public"."stock_movements" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_movements" TO "service_role";

GRANT ALL ON TABLE "public"."item_counts" TO "anon";
GRANT ALL ON TABLE "public"."item_counts" TO "authenticated";
GRANT ALL ON TABLE "public"."item_counts" TO "service_role";

GRANT ALL ON TABLE "public"."repacks" TO "anon";
GRANT ALL ON TABLE "public"."repacks" TO "authenticated";
GRANT ALL ON TABLE "public"."repacks" TO "service_role";

GRANT ALL ON TABLE "public"."insights_items" TO "anon";
GRANT ALL ON TABLE "public"."insights_items" TO "authenticated";
GRANT ALL ON TABLE "public"."insights_items" TO "service_role";

GRANT ALL ON TABLE "public"."insights_low_margin_items" TO "anon";
GRANT ALL ON TABLE "public"."insights_low_margin_items" TO "authenticated";
GRANT ALL ON TABLE "public"."insights_low_margin_items" TO "service_role";

GRANT ALL ON TABLE "public"."insights_open_count_off" TO "anon";
GRANT ALL ON TABLE "public"."insights_open_count_off" TO "authenticated";
GRANT ALL ON TABLE "public"."insights_open_count_off" TO "service_role";

GRANT ALL ON TABLE "public"."insights_revenue_trend" TO "anon";
GRANT ALL ON TABLE "public"."insights_revenue_trend" TO "authenticated";
GRANT ALL ON TABLE "public"."insights_revenue_trend" TO "service_role";

GRANT ALL ON TABLE "public"."insights_slowest_item" TO "anon";
GRANT ALL ON TABLE "public"."insights_slowest_item" TO "authenticated";
GRANT ALL ON TABLE "public"."insights_slowest_item" TO "service_role";

GRANT ALL ON TABLE "public"."insights_term" TO "anon";
GRANT ALL ON TABLE "public"."insights_term" TO "authenticated";
GRANT ALL ON TABLE "public"."insights_term" TO "service_role";

GRANT ALL ON TABLE "public"."item_stock" TO "anon";
GRANT ALL ON TABLE "public"."item_stock" TO "authenticated";
GRANT ALL ON TABLE "public"."item_stock" TO "service_role";

GRANT ALL ON TABLE "public"."item_overview" TO "anon";
GRANT ALL ON TABLE "public"."item_overview" TO "authenticated";
GRANT ALL ON TABLE "public"."item_overview" TO "service_role";

GRANT ALL ON TABLE "public"."last_claims_send" TO "anon";
GRANT ALL ON TABLE "public"."last_claims_send" TO "authenticated";
GRANT ALL ON TABLE "public"."last_claims_send" TO "service_role";

GRANT ALL ON SEQUENCE "public"."purchases_claim_no_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."purchases_claim_no_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."purchases_claim_no_seq" TO "service_role";

GRANT ALL ON TABLE "public"."settings" TO "anon";
GRANT ALL ON TABLE "public"."settings" TO "authenticated";
GRANT ALL ON TABLE "public"."settings" TO "service_role";

GRANT ALL ON SEQUENCE "public"."stock_movements_seq_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."stock_movements_seq_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."stock_movements_seq_seq" TO "service_role";

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

