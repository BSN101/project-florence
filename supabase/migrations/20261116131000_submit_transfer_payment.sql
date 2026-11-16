-- T-034 / FL-023: Student transfer evidence submission with private proof
-- and validated active destination account snapshots.
-- Enforces single-semester obligation selection, full-item totals, proof
-- ownership, and idempotency via f_cmd_begin / f_cmd_finish.
begin;

create or replace function public.submit_transfer_payment(
    p_key uuid,
    p_actor uuid,
    p_semester uuid,
    p_obligations uuid[],
    p_payment_account uuid,
    p_reference_number text,
    p_proof_file uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
    v_result jsonb;
    v_payment uuid;
    v_total numeric;
    v_reference text;
    v_account public.payment_accounts%rowtype;
begin
    perform public.f_cmd_actor(p_actor);

    v_reference := btrim(p_reference_number);
    if p_semester is null
        or p_payment_account is null
        or p_proof_file is null
        or p_obligations is null
        or cardinality(p_obligations) = 0
        or v_reference is null
        or v_reference = '' then
        raise exception 'Invalid transfer submission request' using errcode = '22023';
    end if;

    v_result := public.f_cmd_begin(
        p_key,
        'submit_transfer_payment',
        p_actor,
        jsonb_build_object(
            'semester', p_semester,
            'obligations', p_obligations,
            'payment_account', p_payment_account,
            'reference_number', v_reference,
            'proof_file', p_proof_file
        )
    );
    if v_result is not null then
        return v_result;
    end if;

    -- Student must be enrolled in the target semester of the selected obligations.
    perform public.f_cmd_student(p_actor, p_semester);

    -- Lock active destination account and capture its immutable snapshot.
    select * into v_account
    from public.payment_accounts
    where id = p_payment_account
      and archived_at is null
    for share;
    if not found then
        raise exception 'Active payment destination account required' using errcode = '22023';
    end if;

    -- Verify private proof file ownership and purpose.
    perform 1
    from public.files
    where id = p_proof_file
      and purpose = 'payment_proof'
      and uploader_id = p_actor
    for share;
    if not found then
        raise exception 'Valid payment proof upload required' using errcode = '22023';
    end if;

    -- Lock selected obligations in deterministic order and validate same-semester,
    -- beneficiary ownership, payable status (unwaived and unsettled), and full sum.
    perform public.f_cmd_lock_obligations(p_obligations);
    v_total := public.f_cmd_item_total(p_obligations, p_actor, p_semester, true);

    insert into public.payments (
        student_id,
        semester_id,
        method,
        status,
        record_status,
        request_key,
        receipt_id,
        is_receipt_record,
        payment_account_id,
        destination_label,
        destination_account_name,
        destination_account_reference,
        reference_number,
        proof_file_id,
        amount,
        submitted_by,
        submitted_at
    )
    values (
        p_actor,
        p_semester,
        'transfer',
        'pending',
        'current',
        p_key,
        null,
        false,
        v_account.id,
        v_account.label,
        v_account.account_name,
        v_account.account_reference,
        v_reference,
        p_proof_file,
        v_total,
        p_actor,
        now()
    )
    returning id into v_payment;

    insert into public.payment_items (
        payment_id,
        obligation_id,
        student_id,
        semester_id,
        amount
    )
    select
        v_payment,
        id,
        student_id,
        semester_id,
        amount
    from public.obligations
    where id = any(p_obligations);

    return public.f_cmd_finish(
        p_key,
        jsonb_build_object(
            'payment_id', v_payment,
            'semester_id', p_semester,
            'amount', v_total,
            'status', 'pending'
        )
    );
end $$;

revoke all on function public.submit_transfer_payment(uuid, uuid, uuid, uuid[], uuid, text, uuid)
    from public, anon, authenticated, service_role;
grant execute on function public.submit_transfer_payment(uuid, uuid, uuid, uuid[], uuid, text, uuid)
    to service_role;

commit;
