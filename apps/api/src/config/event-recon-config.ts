/**
 * Event-level reconciliation configuration.
 *
 * Maps an EventCatalog.eventCode → the Zwing MySQL source table to query for
 * source transaction counts.  When an outbound event has an entry here, the
 * /enterprises/:id/event-recon endpoint will:
 *
 *   1. Query the configured Zwing MySQL table for source transaction count
 *      in the requested date window.
 *   2. Compare that count against GIP dipJobs to compute missing / gap.
 *
 * The sync-gap module also uses this config to drive its MySQL queries and
 * generic reconciliation logic — no event type is hardcoded in the service layer.
 *
 * ─── Adding a new event ──────────────────────────────────────────────────────
 * 1. Find the exact eventCode in the `events` MongoDB collection.
 * 2. Identify the Zwing MySQL table that holds the source records for that event.
 * 3. Identify the column in that table that equals dipJobs.refDocNo.
 * 4. Add an entry below.
 *
 * Example:
 *   'crm.credit-note.created.v1': {
 *     label: 'Credit Notes',
 *     tableName: 'credit_notes',
 *     refDocField: 'credit_note_id',
 *     dateField: 'created_at',
 *     extraWhere: "status = 'ISSUED'",
 *     selectFields: ['credit_note_id', 'store_id', 'status', 'created_at'],
 *   },
 * ─────────────────────────────────────────────────────────────────────────────
 */
export interface EventSourceConfig {
  /** Human-readable label shown in the UI (e.g. "Invoices", "Credit Notes"). */
  label: string;

  /** MySQL table name to query for source records. */
  tableName: string;

  /**
   * Column in that table whose value is stored as dipJobs.refDocNo.
   * Used to join source records with GIP jobs when needed.
   */
  refDocField: string;

  /**
   * Date column used in the BETWEEN :from AND :to filter.
   * Typically 'created_at'.
   */
  dateField: string;

  /**
   * Optional extra SQL WHERE conditions (without a leading AND).
   * Example: "channel_id != 3 AND status = 'SUCCESS'"
   */
  extraWhere?: string;

  /**
   * Columns to SELECT from the source table.
   * When omitted the service falls back to SELECT *.
   * Specifying explicit columns keeps response payloads lean and avoids
   * accidental exposure of sensitive columns.
   */
  selectFields?: string[];
}

/** Default event code used when no eventCode is provided to sync-gap endpoints. */
export const DEFAULT_INVOICE_EVENT_CODE = 'zpos-inventory.invoice.created';
export const DEFAULT_APPROVAL_REQUEST_EVENT_CODE = 'pos-core.approval-request.created';

/**
 * Keyed by EventCatalog.eventCode (exact string match).
 */
export const EVENT_SOURCE_CONFIGS: Record<string, EventSourceConfig> = {
  // ── Invoice events ────────────────────────────────────────────────────────
  [DEFAULT_INVOICE_EVENT_CODE]: {
    label: 'Invoices',
    tableName: 'invoices',
    refDocField: 'invoice_id',
    dateField: 'created_at',
    extraWhere: "channel_id != 3 AND status = 'SUCCESS'",
    selectFields: [
      'invoice_id',
      'store_id',
      'transaction_type',
      'transaction_sub_type',
      'status',
      'created_at',
    ],
  },

  // ── Credit note events ───────────────────────────────────────────────────
  // 'crm.credit-note.otp.share.v1': {
  //   label: 'Credit Notes',
  //   tableName: 'credit_notes',
  //   refDocField: 'credit_note_id',
  //   dateField: 'created_at',
  //   selectFields: ['credit_note_id', 'store_id', 'status', 'created_at'],
  // },

  // ── Add more entries here ────────────────────────────────────────────────

 
    [DEFAULT_APPROVAL_REQUEST_EVENT_CODE]: {
    label: 'Approval Request',
    tableName: 'approval_workflow_requests',
    refDocField: 'ulid',
    dateField: 'created_at',
    extraWhere: "",
    selectFields: [  
      'ulid',
      'status',
      'stage',
      'created_at',],
  },
};
