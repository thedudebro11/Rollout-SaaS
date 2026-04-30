-- Add operator's personal mobile number for SMS command authentication.
-- Stored as E.164 (+1XXXXXXXXXX). When twilio-inbound receives a message
-- from this number, it routes to the operator command handler instead of
-- the subscriber state machine.
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS operator_phone_number text;
