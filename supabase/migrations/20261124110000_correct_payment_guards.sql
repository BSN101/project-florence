-- T-039 (FL-028): harden correct_payment.
-- Same lock order and supersession as 20261107050430 (request -> receipt -> payment ->
-- sorted union of old and new obligations), plus:
--   * the reason is trimmed once, bounded to 500 characters and stored/hashed trimmed;
--   * input is validated before the request receipt is written;
--   * an obligation on a current pending transfer cannot join a replacement
--     (decide the transfer first), matching record_cash_payment and waive_obligation;
--   * a replacement with the same items as the current record is refused (no-op);
--   * a missing payment, an already-corrected payment and a wrong-state payment are
--     reported separately.
-- A correction still moves no money: payment_receipts and payment_refunds are never touched.
begin;

create or replace function public.correct_payment(p_key uuid, p_actor uuid, p_payment uuid,
    p_obligations uuid[], p_reason text) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare p public.payments%rowtype; v_result jsonb; v_receipt uuid; v_ids uuid[];
    v_total numeric; v_refund numeric; v_new uuid; v_reason text; v_old_items uuid[];
begin
    perform public.f_cmd_council(p_actor);
    v_reason := nullif(btrim(p_reason), '');
    if p_payment is null or v_reason is null or length(v_reason) > 500 then
        raise exception 'Correction target and a reason of at most 500 characters required' using errcode = '22023';
    end if;
    -- Validate the new array separately before forming the deduplicated old/new union.
    if p_obligations is null or cardinality(p_obligations) = 0 or cardinality(p_obligations) > 10000
        or array_ndims(p_obligations) <> 1 or array_position(p_obligations, null) is not null
        or (select count(distinct x) from unnest(p_obligations) x) <> cardinality(p_obligations) then
        raise exception 'Invalid replacement item selection' using errcode = '22023';
    end if;
    v_result := public.f_cmd_begin(p_key, 'correct_payment', p_actor,
        jsonb_build_object('payment', p_payment, 'obligations', p_obligations, 'reason', v_reason));
    if v_result is not null then return v_result; end if;

    select receipt_id into v_receipt from public.payments where id = p_payment;
    if not found then
        raise exception 'Payment not found' using errcode = '22023';
    end if;
    if v_receipt is null then
        raise exception 'Correction requires a recognized received payment' using errcode = '55000';
    end if;
    perform 1 from public.payment_receipts where id = v_receipt for update;
    select * into p from public.payments where id = p_payment for update;
    if not found or p.receipt_id is distinct from v_receipt then
        raise exception 'Payment not found' using errcode = '22023';
    end if;
    if p.record_status = 'superseded' then
        raise exception 'Payment was already corrected' using errcode = '55000';
    end if;
    if p.record_status <> 'current' or not p.is_receipt_record then
        raise exception 'Correction target must be the current authoritative receipt representation' using errcode = '55000';
    end if;
    if p.student_id = p_actor then raise exception 'Self payment correction forbidden' using errcode = '42501'; end if;

    select array_agg(obligation_id order by obligation_id) into v_old_items
        from public.payment_items where payment_id = p.id;
    select array_agg(distinct id order by id) into v_ids from (
        select unnest(p_obligations) id union select unnest(v_old_items)) s;
    perform public.f_cmd_lock_obligations(v_ids);

    if v_old_items is not distinct from (select array_agg(x order by x) from unnest(p_obligations) x) then
        raise exception 'Replacement items match the current record' using errcode = '22023';
    end if;
    if exists (select 1 from public.payment_items i join public.payments q on q.id = i.payment_id
        where i.obligation_id = any(p_obligations) and q.id <> p.id
        and q.status = 'pending' and q.record_status = 'current') then
        raise exception 'Selected obligation has a pending transfer' using errcode = '55000';
    end if;

    select amount into v_refund from public.payment_refunds where receipt_id = p.receipt_id;
    v_total := public.f_cmd_item_total(p_obligations, p.student_id, p.semester_id,
        p.status = 'verified' and v_refund is null, p.id);
    if v_refund is not null and v_total <> v_refund then raise exception 'Correction would invalidate full refund history' using errcode = '23514'; end if;
    if p.status = 'rejected' and v_refund is null then raise exception 'Received rejected payment must have a completed full return' using errcode = '55000'; end if;

    -- Supersede then insert within this transaction, avoiding partial unique index
    -- conflict. The integrity triggers permit this atomic transition.
    update public.payments set record_status = 'superseded' where id = p.id;
    insert into public.payments(student_id, semester_id, method, status, record_status, request_key,
        receipt_id, is_receipt_record, payment_account_id, destination_label, destination_account_name,
        destination_account_reference, reference_number, proof_file_id, amount, submitted_by, submitted_at,
        decided_by, decided_at, decision_reason, supersedes_payment_id)
    values (p.student_id, p.semester_id, p.method, p.status, 'current', p_key, p.receipt_id, true,
        p.payment_account_id, p.destination_label, p.destination_account_name, p.destination_account_reference,
        p.reference_number, p.proof_file_id, v_total, p_actor, now(), p_actor, now(), v_reason, p.id) returning id into v_new;
    insert into public.payment_items(payment_id, obligation_id, student_id, semester_id, amount)
        select v_new, id, student_id, semester_id, amount from public.obligations where id = any(p_obligations);
    return public.f_cmd_finish(p_key, jsonb_build_object('payment_id', v_new, 'supersedes_payment_id', p.id,
        'receipt_id', p.receipt_id, 'amount', v_total));
end $$;

revoke all on function public.correct_payment(uuid, uuid, uuid, uuid[], text) from public, anon, authenticated, service_role;
grant execute on function public.correct_payment(uuid, uuid, uuid, uuid[], text) to service_role;

commit;
