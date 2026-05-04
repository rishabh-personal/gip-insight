import axios from 'axios';

// Always use relative URLs. Next.js rewrites proxy /api/* to the NestJS backend
// (localhost:3001 in dev, gip-api:3001 in production Docker — see next.config.ts).
export const api = axios.create({
  baseURL: '/api/dashboard',
  timeout: 30000,
});

// ---- Enterprises ----
/** Fast stub list — only enterprises that have apps, no metrics. */
export const getEnterprises = (params: Record<string, any> = {}) =>
  api.get('/enterprises', { params }).then((r) => r.data);

/** Unique connector names across all enterprises — for the pin-as-tab dropdown. */
export const getEnterpriseConnectors = () =>
  api.get('/enterprises/connectors').then((r) => r.data);

/** Async per-enterprise metrics (jobs, sync gap) — call per row. */
export const getEnterpriseMetrics = (ssoEnterpriseId: string, params: Record<string, any> = {}) =>
  api.get(`/enterprises/${ssoEnterpriseId}/metrics`, { params }).then((r) => r.data);

export const getEnterprise = (ssoEnterpriseId: string, params: Record<string, any> = {}) =>
  api.get(`/enterprises/${ssoEnterpriseId}`, { params }).then((r) => r.data);

// ---- Sync Gap ----
export const getSyncGap = (ssoEnterpriseId: string, params: Record<string, any> = {}) =>
  api.get(`/enterprises/${ssoEnterpriseId}/sync-gap`, { params }).then((r) => r.data);

/** Invoices captured by GIP but stuck in pending/processing state. */
export const getPendingInvoices = (ssoEnterpriseId: string, params: Record<string, any> = {}) =>
  api.get(`/enterprises/${ssoEnterpriseId}/sync-gap/pending`, { params }).then((r) => r.data);

/** Re-trigger Debezium events by incrementing sync_status on selected Zwing invoice IDs. */
export const retriggerInvoices = (ssoEnterpriseId: string, invoiceIds: string[]) =>
  api.post(`/enterprises/${ssoEnterpriseId}/sync-gap/retrigger`, { invoiceIds }).then((r) => r.data);

/** Per-invoice timeline: Zwing row + GIP status + sync delay. */
export const getInvoiceTimeline = (ssoEnterpriseId: string, params: Record<string, any> = {}) =>
  api.get(`/enterprises/${ssoEnterpriseId}/sync-gap/timeline`, { params }).then((r) => r.data);

// ---- Jobs ----
/** Async per-enterprise failed count + preview — called per-row on failed jobs page. */
export const getEnterpriseFailedSummary = (ssoEnterpriseId: string, params: Record<string, any> = {}) =>
  api.get(`/enterprises/${ssoEnterpriseId}/jobs/failed-summary`, { params }).then((r) => r.data);

export const getFailedJobs = (params: Record<string, any> = {}) =>
  api.get('/jobs/failed', { params }).then((r) => r.data);

export const getJobDetail = (jobId: string) =>
  api.get(`/jobs/${jobId}`).then((r) => r.data);

/** All / success / failed / pending job listing for an enterprise+connector. */
export const getConnectorJobs = (
  ssoEnterpriseId: string,
  params: Record<string, any> = {},
) =>
  api
    .get(`/enterprises/${ssoEnterpriseId}/jobs/list`, { params })
    .then((r) => r.data);

/** Fetch task input or output payload from Azure Blob Storage via the API proxy. */
export const getBlobContent = (path: string) =>
  api.get('/jobs/blob', { params: { path } }).then((r) => r.data);


// ---- Event Recon ----
/**
 * Per-outbound-event reconciliation: GIP job counts vs Zwing source counts
 * across all connectors for an enterprise.
 */
export const getEventRecon = (ssoEnterpriseId: string, params: Record<string, any> = {}) =>
  api.get(`/enterprises/${ssoEnterpriseId}/event-recon`, { params }).then((r) => r.data);

// ---- Trace ----
export const traceInvoice = (invoiceId: string, ssoEnterpriseId?: string) =>
  api
    .get('/trace', { params: { invoiceId, ssoEnterpriseId } })
    .then((r) => r.data);

// ---- Failure Tracking ----
export const getFailureCategories = (connectorName?: string) =>
  api.get('/failure-tracking/categories', { params: connectorName ? { connectorName } : {} }).then((r) => r.data);

export const createFailureCategory = (data: { name: string; description?: string; color?: string; connectorName?: string | null }) =>
  api.post('/failure-tracking/categories', data).then((r) => r.data);

export const updateFailureCategory = (id: string, data: Record<string, any>) =>
  api.patch(`/failure-tracking/categories/${id}`, data).then((r) => r.data);

export const deleteFailureCategory = (id: string) =>
  api.delete(`/failure-tracking/categories/${id}`).then((r) => r.data);

export const getFailureCases = (params: Record<string, any> = {}) =>
  api.get('/failure-tracking/cases', { params }).then((r) => r.data);

export const createFailureCase = (data: Record<string, any>) =>
  api.post('/failure-tracking/cases', data).then((r) => r.data);

export const updateFailureCase = (id: string, data: Record<string, any>) =>
  api.patch(`/failure-tracking/cases/${id}`, data).then((r) => r.data);

export const incrementFailureOccurrence = (id: string) =>
  api.post(`/failure-tracking/cases/${id}/increment`).then((r) => r.data);

export const deleteFailureCase = (id: string) =>
  api.delete(`/failure-tracking/cases/${id}`).then((r) => r.data);

export const getFailureSummary = () =>
  api.get('/failure-tracking/summary').then((r) => r.data);
