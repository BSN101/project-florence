-- T-038 follow-up: a missing receipt raised the chronology error, which the app showed as
-- "refund date too early". Same as 20261123160600 except the two checks are split.
begin;

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
    if not found then
        raise exception 'Payment receipt not found' using errcode = '22023';
    end if;
    if p_refunded_at < v_received then
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

revoke all on function public.record_refund(uuid, uuid, uuid, timestamptz, text, boolean) from public, anon, authenticated, service_role;
grant execute on function public.record_refund(uuid, uuid, uuid, timestamptz, text, boolean) to service_role;

commit;
