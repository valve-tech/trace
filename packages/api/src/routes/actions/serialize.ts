import type { ActionRow } from "../../services/actionsDb.js";

/**
 * Wire-format projection of an ActionRow. Secret values are *never*
 * sent over the wire — only the key names so the UI can render which
 * names are bound. JSONB fields (trigger_config, secrets) come back
 * already parsed from pg.
 */
export function formatAction(action: ActionRow) {
  const secretKeys = Object.keys(action.secrets);

  return {
    id: action.id,
    name: action.name,
    code: action.code,
    chainid: action.chain_id,
    triggerType: action.trigger_type,
    triggerConfig: action.trigger_config,
    secretKeys,
    enabled: action.enabled,
    createdAt: action.created_at,
    updatedAt: action.updated_at,
    webhookUrl:
      action.trigger_type === "webhook"
        ? `/api/actions/webhooks/${action.id}`
        : undefined,
  };
}
