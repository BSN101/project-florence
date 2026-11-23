-- T-038 (FL-027 / FL-044): harden record_refund and notify the student in the
-- same transaction when a completed full-payment refund is recorded.
-- Preserves received-money history, never rewrites payment status or waives debt.
begin;

-- Same as 20261122100000, plus the payment_refunded notification kind.
create or replace function f_access_private.reference_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if TG_TABLE_NAME='payments' then
  if new.decided_by=new.student_id or (new.method='cash' and new.submitted_by=new.student_id) then raise exception 'Self payment recording/decision forbidden'; end if;
  if new.proof_file_id is not null and not exists(select 1 from public.files f where f.id=new.proof_file_id and f.purpose='payment_proof' and f.uploader_id=new.student_id) then raise exception 'Proof must be the student payment-proof file'; end if;
  if new.method='transfer' and new.supersedes_payment_id is null and not exists(select 1 from public.payment_accounts a where a.id=new.payment_account_id and a.archived_at is null
   and a.label=new.destination_label and a.account_name=new.destination_account_name and a.account_reference=new.destination_account_reference for share) then raise exception 'Active destination snapshot required'; end if;
 elsif TG_TABLE_NAME='payment_accounts' then
  if new.qr_file_id is not null and not exists(select 1 from public.files f where f.id=new.qr_file_id and f.purpose='payment_account_qr') then raise exception 'Invalid payment destination QR purpose'; end if;
 elsif TG_TABLE_NAME='roster_imports' then
  if not exists(select 1 from public.files f where f.id=new.file_id and f.purpose='roster_import') then raise exception 'Invalid roster import file purpose'; end if;
 elsif TG_TABLE_NAME='invitations' then
  if TG_OP='UPDATE' then
   if old.status<>'pending' or new.status='pending' or (to_jsonb(new)-array['status','accepted_at','cancelled_at']) is distinct from (to_jsonb(old)-array['status','accepted_at','cancelled_at']) then raise exception 'Only final invitation transition allowed'; end if;
   if new.status='accepted' and (new.accepted_at>=new.expires_at or new.accepted_at<new.created_at or new.expires_at<=clock_timestamp()) then raise exception 'Invitation expired or invalid acceptance time'; end if;
   if new.status='expired' and old.expires_at>clock_timestamp() then raise exception 'Invitation has not reached its deadline'; end if;
  else
   if new.status<>'pending' then raise exception 'New invitation must be pending'; end if;
   if (new.purpose='faculty_access') is distinct from exists(select 1 from public.profiles p where p.id=new.profile_id and p.university_id is null) then
    raise exception 'Invitation purpose does not match profile category'; end if;
  end if;
 elsif TG_TABLE_NAME='notifications' then
  if new.kind not in ('merit_received','demerit_incurred','service_recorded','obligation_due','payment_verified','payment_rejected','council_access_changed','obligation_waived','attendance_claim_rejected','payment_refunded')
   or new.target_type is not null then raise exception 'Unapproved notification category/navigation'; end if;
 end if;
 return new;
end $$;

-- Same as 20261122100000, plus payment_refunded.
create or replace function public.f_cmd_notice(p_student uuid, p_kind text) returns void
language plpgsql security definer set search_path = pg_catalog as $$
declare v_message text;
begin
    v_message := case p_kind
        when 'merit_received' then 'A merit award was recorded. View your records.'
        when 'demerit_incurred' then 'A demerit was recorded. View your records.'
        when 'service_recorded' then 'Service completion was recorded. View your records.'
        when 'obligation_due' then 'An obligation was recorded. View your account.'
        when 'obligation_waived' then 'An obligation was waived. View your account.'
        when 'payment_verified' then 'Your payment was verified. View your account.'
        when 'payment_rejected' then 'Your payment submission was rejected. View your account.'
        when 'attendance_claim_rejected' then 'Your attendance photo was rejected. View the event.'
        when 'payment_refunded' then 'A payment refund was recorded. View your account.'
        else null end;
    if v_message is null then raise exception 'Unsupported command notification kind'; end if;
    insert into public.notifications(recipient_id, kind, message) values (p_student, p_kind, v_message);
end $$;

-- Same lock order as 20261107050430 (request -> receipt -> payment -> sorted obligations),
-- plus trimmed/bounded reason, distinct self-refund and verified-status checks,
-- and an atomic payment_refunded student notification.
create or replace function public.record_refund(p_key uuid, p_actor uuid, p_receipt uuid,
    p_refunded_at timestamptz, p_reason text, p_facts_confirmed boolean) returns jsonb
language plpgsql security definer set search_path = pg_catalog set "TimeZone" = 'UTC' as $$
declare p public.payments%rowtype; v_result jsonb; v_refund uuid; v_received timestamptz;
    v_ids uuid[]; v_reason text;
begin
    perform public.f_cmd_council(p_actor);
    v_reason := nullif(btrim(p_reason), '');
    if p_receipt is null or p_facts_confirmed is distinct from true or v_reason is null
        or length(v_reason) > 500 or p_refunded_at is null or not isfinite(p_refunded_at)
        or p_refunded_at > clock_timestamp() then
        raise exception 'Actual completed refund time/reason/confirmation required' using errcode = '22023';
    end if;
    v_result := public.f_cmd_begin(p_key, 'record_refund', p_actor, jsonb_build_object(
        'receipt', p_receipt, 'refunded_at', p_refunded_at, 'reason', v_reason, 'confirmed', p_facts_confirmed));
    if v_result is not null then return v_result; end if;

    select received_at into v_received from public.payment_receipts where id = p_receipt for update;
    if not found or p_refunded_at < v_received then
        raise exception 'Invalid receipt/refund chronology' using errcode = '22023';
    end if;
    select * into p from public.payments
        where receipt_id = p_receipt and is_receipt_record and record_status = 'current' for update;
    if not found then
        raise exception 'Payment receipt not found' using errcode = '22023';
    end if;
    if p.student_id = p_actor then
        raise exception 'Self refund recording forbidden' using errcode = '42501';
    end if;
    if exists (select 1 from public.payment_refunds where receipt_id = p_receipt) then
        raise exception 'Receipt already refunded' using errcode = '23505';
    end if;
    if p.status <> 'verified' then
        raise exception 'Only verified payments can be refunded' using errcode = '55000';
    end if;

    v_ids := public.f_cmd_check_items(p.id, false);
    insert into public.payment_refunds(receipt_id, payment_id, amount, reason, recorded_by, refunded_at)
        values (p_receipt, p.id, p.amount, v_reason, p_actor, p_refunded_at) returning id into v_refund;
    perform public.f_cmd_notice(p.student_id, 'payment_refunded');
    return public.f_cmd_finish(p_key, jsonb_build_object('refund_id', v_refund, 'receipt_id', p_receipt, 'amount', p.amount));
end $$;

revoke all on function public.f_cmd_notice(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.record_refund(uuid, uuid, uuid, timestamptz, text, boolean) from public, anon, authenticated, service_role;
grant execute on function public.record_refund(uuid, uuid, uuid, timestamptz, text, boolean) to service_role;

commit;
