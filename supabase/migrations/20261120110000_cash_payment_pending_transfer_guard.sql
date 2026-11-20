-- FL-024 / FL-025: cash cannot be recorded for an obligation that is on a
-- transfer awaiting review. Otherwise verify_payment rejects that whole transfer,
-- and the student may have paid twice. Decide the transfer first.
begin;

-- Same as 20261107050430, plus the pending-transfer block after the obligation lock.
-- submit_transfer_payment locks the same obligation rows, so the check cannot race it.
create or replace function public.record_cash_payment(p_key uuid, p_actor uuid, p_student uuid,
    p_semester uuid, p_obligations uuid[], p_received_at timestamptz) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare v_result jsonb; v_payment uuid; v_receipt uuid; v_total numeric;
begin
    perform public.f_cmd_council(p_actor);
    if p_student = p_actor then raise exception 'Self cash recording forbidden' using errcode = '42501'; end if;
    if p_received_at is null or not isfinite(p_received_at) or p_received_at > clock_timestamp() then raise exception 'Actual receipt time required'; end if;
    v_result := public.f_cmd_begin(p_key, 'record_cash_payment', p_actor, jsonb_build_object(
        'student', p_student, 'semester', p_semester, 'obligations', p_obligations, 'received_at', p_received_at));
    if v_result is not null then return v_result; end if;
    perform public.f_cmd_student(p_student, p_semester);
    -- New receipt cannot be concurrently referenced before this commit.
    insert into public.payment_receipts(request_key, received_at, recognized_by)
        values (p_key, p_received_at, p_actor) returning id into v_receipt;
    perform public.f_cmd_lock_obligations(p_obligations);
    if exists (select 1 from public.payment_items i join public.payments p on p.id = i.payment_id
        where i.obligation_id = any(p_obligations) and p.status = 'pending' and p.record_status = 'current') then
        raise exception 'Selected obligation has a pending transfer' using errcode = '55000'; end if;
    v_total := public.f_cmd_item_total(p_obligations, p_student, p_semester, true);
    insert into public.payments(student_id, semester_id, method, status, record_status,
        request_key, receipt_id, is_receipt_record, amount, submitted_by, submitted_at, decided_by, decided_at)
    values (p_student, p_semester, 'cash', 'verified', 'current', p_key, v_receipt, true,
        v_total, p_actor, now(), p_actor, now()) returning id into v_payment;
    insert into public.payment_items(payment_id, obligation_id, student_id, semester_id, amount)
        select v_payment, id, student_id, semester_id, amount from public.obligations where id = any(p_obligations);
    perform public.f_cmd_notice(p_student, 'payment_verified');
    return public.f_cmd_finish(p_key, jsonb_build_object('payment_id', v_payment, 'receipt_id', v_receipt, 'amount', v_total));
end $$;

commit;
