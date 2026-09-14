-- Compass — remember an unresolved client link suggestion.
--
-- When a conversation names an organization that resembles an existing client,
-- Compass raises a confirm-before-link prompt rather than merging on its own.
-- That prompt was previously carried only on the response stream, so a refresh
-- lost it: the conversation stayed unlinked with nothing left to resolve it.
--
-- The pending decision is state, so it lives here. Cleared the moment the
-- consultant answers, in either direction.
--
-- Safe to re-run.

alter table compass.conversations
  add column if not exists pending_client_link jsonb;

comment on column compass.conversations.pending_client_link is
  'Unresolved link suggestion: { proposed: {name, industry, size, notes}, existingClientId }. Null once confirmed either way.';

-- Partial index: only the handful of conversations actually awaiting an answer.
create index if not exists conversations_pending_link_idx
  on compass.conversations (id)
  where pending_client_link is not null;
