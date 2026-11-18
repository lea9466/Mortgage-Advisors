-- Many clients use kosher phones that cannot receive text messages. The adviser
-- marks whether the main phone receives SMS, so messages are only sent where
-- they can arrive. Unknown until marked, so the default is false.

alter table public.clients
  add column phone_receives_sms boolean not null default false;
