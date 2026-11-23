export const environment = {
  apiBaseUrl: 'http://localhost:8081',
  // Data calls to folio-market-feed-svc go through the dev proxy (relative /api/... paths). This host is only
  // used for links that must open on the service itself, such as its Swagger UI.
  marketFeedBaseUrl: 'http://localhost:8082',
  // There is no login yet; every request acts as this user (matches the backend's userId default of 1).
  currentUserId: 1,
};
