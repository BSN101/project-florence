-- Duplicates notifications_recipient_idx (recipient_id, created_at desc) from the base structure.
drop index if exists public.idx_notifications_recipient_created;
