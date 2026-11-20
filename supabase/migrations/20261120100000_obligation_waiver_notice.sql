-- FL-026 / FL-044: waiving an obligation notifies the student in the same
-- transaction, and an obligation on a pending transfer cannot be waived
-- (verify_payment would then reject every item on that transfer).
begin;

-- Same as 20261112060000, plus the obligation_waived notification kind.
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
  if new.kind not in ('merit_received','demerit_incurred','service_recorded','obligation_due','payment_verified','payment_rejected','council_access_changed','obligation_waived')
   or new.target_type is not null then raise exception 'Unapproved notification category/navigation'; end if;
 end if;
 return new;
end $$;


-- Same as 20261107050430, plus obligation_waived.
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
        else null end;
    if v_message is null then raise exception 'Unsupported command notification kind'; end if;
    insert into public.notifications(recipient_id, kind, message) values (p_student, p_kind, v_message);
end $$;

-- Same as 20261107050430, plus the pending-transfer block and the student notice.
-- submit_transfer_payment locks the same obligation rows, so the check cannot race it.
create or replace function public.waive_obligation(p_key uuid, p_actor uuid, p_obligation uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare o public.obligations%rowtype; v_result jsonb;
begin
    perform public.f_cmd_council(p_actor);
    if nullif(btrim(p_reason), '') is null then raise exception 'Waiver reason required'; end if;
    v_result := public.f_cmd_begin(p_key, 'waive_obligation', p_actor, jsonb_build_object('obligation', p_obligation, 'reason', p_reason));
    if v_result is not null then return v_result; end if;
    perform public.f_cmd_lock_obligations(array[p_obligation]);
    select * into o from public.obligations where id = p_obligation;
    if o.student_id = p_actor then raise exception 'Self debt waiver forbidden' using errcode = '42501'; end if;
    if o.waived_at is not null or public.f_cmd_settled(o.id) then raise exception 'Only unpaid, unwaived obligations may be waived'; end if;
    if exists (select 1 from public.payment_items i join public.payments p on p.id = i.payment_id
        where i.obligation_id = o.id and p.status = 'pending' and p.record_status = 'current') then
        raise exception 'Obligation has a pending transfer' using errcode = '55000'; end if;
    update public.obligations set waived_at = now(), waived_by = p_actor, waiver_reason = p_reason where id = o.id;
    perform public.f_cmd_notice(o.student_id, 'obligation_waived');
    return public.f_cmd_finish(p_key, jsonb_build_object('obligation_id', o.id, 'waived_at', now()));
end $$;

commit;
