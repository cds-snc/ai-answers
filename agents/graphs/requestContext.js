import { AsyncLocalStorage } from 'async_hooks';

// Shared AsyncLocalStorage to pass client session headers through the graph workflow.
// Each request sets its context before invoking a graph run, allowing downstream
// helpers to retrieve the original fingerprint/cookie headers for internal fetches.
export const graphRequestContext = new AsyncLocalStorage();

export default graphRequestContext;
