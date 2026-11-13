create index if not exists idx_notifications_recipient_created
  on public.notifications (recipient_id, created_at desc);

create index if not exists idx_notifications_unread
  on public.notifications (recipient_id)
  where read_at is null;
