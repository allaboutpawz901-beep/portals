'use client';
/**
 * CustomerQueueScreen — the Customer Queue sidebar screen (task 4-c).
 * A thin wrapper around the shared ConversationInbox scoped to the
 * customer-facing channels (web_form + email + chat — all of them here),
 * with the full REPLY / ASSIGN / RESOLVE loop.
 */
import ConversationInbox from './ConversationInbox';

export default function CustomerQueueScreen({ onToast }: { onToast: (m: string) => void }) {
  return (
    <ConversationInbox
      onToast={onToast}
      title="Customer queue"
      subtitle="Every customer conversation — reply, assign, resolve."
      defaultChannelFilter="customer"
    />
  );
}
