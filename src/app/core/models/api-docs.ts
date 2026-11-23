/**
 * Swagger (springdoc) pages of the backends, listed on the Admin page. Both services set
 * springdoc.swagger-ui.path=/swagger-ui.html and serve the OpenAPI document at /v3/api-docs.
 *
 * The links open on each service's own origin, not through the dev proxy: the OpenAPI document's server URL is
 * generated from the request host, so "Try it out" in Swagger UI sends requests straight to that service.
 */
import { environment } from '../../../environments/environment';
import { AdminService } from './admin-actions';

export interface ApiDocsLink {
  service: AdminService;
  description: string;
  swaggerUiUrl: string;
  openApiUrl: string;
}

export const API_DOCS: readonly ApiDocsLink[] = [
  {
    service: 'folio-portfolio-api',
    description: 'Watchlists, favorites, CSV import and export, column preferences and portfolios.',
    swaggerUiUrl: `${environment.apiBaseUrl}/swagger-ui.html`,
    openApiUrl: `${environment.apiBaseUrl}/v3/api-docs`,
  },
  {
    service: 'folio-market-feed-svc',
    description: 'FMP (US) and Tapetide/Upstox (India) market data, symbol lists and news digests.',
    swaggerUiUrl: `${environment.marketFeedBaseUrl}/swagger-ui.html`,
    openApiUrl: `${environment.marketFeedBaseUrl}/v3/api-docs`,
  },
];
