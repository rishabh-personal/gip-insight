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

/** Unique apps across all connectors — for the filter dropdown. */
export const getEnterpriseApps = () =>
  api.get('/enterprises/apps').then((r) => r.data);

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

// ---- Jobs ----
export const getJobSummary = (ssoEnterpriseId: string, params: Record<string, any> = {}) =>
  api.get(`/enterprises/${ssoEnterpriseId}/jobs/summary`, { params }).then((r) => r.data);

/** Async per-enterprise failed count + preview — called per-row on failed jobs page. */
export const getEnterpriseFailedSummary = (ssoEnterpriseId: string, params: Record<string, any> = {}) =>
  api.get(`/enterprises/${ssoEnterpriseId}/jobs/failed-summary`, { params }).then((r) => r.data);

export const getFailedJobs = (params: Record<string, any> = {}) =>
  api.get('/jobs/failed', { params }).then((r) => r.data);

export const getJobDetail = (jobId: string) =>
  api.get(`/jobs/${jobId}`).then((r) => r.data);


// ---- Trace ----
export const traceInvoice = (invoiceId: string, ssoEnterpriseId?: string) =>
  api
    .get('/trace', { params: { invoiceId, ssoEnterpriseId } })
    .then((r) => r.data);
