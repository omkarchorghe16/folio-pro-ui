/**
 * Backend calls that the Admin page can trigger. To add one (a new scheduler trigger or any other controller
 * call), add an entry to ADMIN_ACTIONS; the page builds its cards from this list.
 *
 * URLs: news-scheduler-svc (8082) calls use relative paths that the dev proxy forwards (add the path prefix to
 * proxy.conf.json and restart ng serve); invesment-management-svc (8081) calls use environment.apiBaseUrl.
 */
import { environment } from '../../../environments/environment';

export type AdminActionGroup = 'Scheduled jobs' | 'Other actions';
export type AdminService = 'news-scheduler-svc' | 'invesment-management-svc';

export interface AdminAction {
  id: string;
  group: AdminActionGroup;
  service: AdminService;
  name: string;
  description: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  /** When the job runs on its own (application.yml default; an env var can override it). */
  schedule?: string;
  /** If set, the user must confirm this text before the call is sent (for calls with side effects). */
  confirm?: string;
}

export const ADMIN_ACTIONS: readonly AdminAction[] = [
  {
    id: 'daily-digest',
    group: 'Scheduled jobs',
    service: 'news-scheduler-svc',
    name: 'Daily news digest',
    description: 'Builds the daily stock news digest and sends it out, the same as the scheduled run.',
    method: 'POST',
    url: '/api/digest/run',
    schedule: 'Weekdays 09:00 America/Chicago (APP_SCHEDULE_CRON_EXPRESSION)',
    confirm: 'Run the daily digest now? It sends the digest the same way the scheduled job does.',
  },
  {
    id: 'nse-symbol-sync',
    group: 'Scheduled jobs',
    service: 'news-scheduler-svc',
    name: 'NSE symbol list sync',
    description: 'Downloads NSE\'s equity and ETF lists used by the India "Add stocks" search. '
      + 'If the download fails, the previous lists are kept.',
    method: 'POST',
    url: '/api/india/nse/sync',
    schedule: 'Sundays 06:00 Asia/Kolkata (NSE_SCHEDULE_CRON_EXPRESSION)',
  },
  {
    id: 'nasdaq-symbol-sync',
    group: 'Scheduled jobs',
    service: 'news-scheduler-svc',
    name: 'US symbol list sync',
    description: 'Downloads Nasdaq Trader\'s US stock and ETF lists used by the US "Add stocks" search. '
      + 'If the download fails, the previous lists are kept.',
    method: 'POST',
    url: '/api/us/nasdaq/sync',
    schedule: 'Daily 06:00 America/New_York (NASDAQ_SCHEDULE_CRON_EXPRESSION)',
  },
  {
    id: 'news-scheduler-health',
    group: 'Other actions',
    service: 'news-scheduler-svc',
    name: 'News scheduler health check',
    description: 'Checks that news-scheduler-svc is up and reachable through the dev proxy.',
    method: 'GET',
    url: '/api/digest/health',
  },
  {
    id: 'watchlist-service-check',
    group: 'Other actions',
    service: 'invesment-management-svc',
    name: 'Watchlist service check',
    description: 'Lists one India watchlist to confirm invesment-management-svc is up and its database is reachable.',
    method: 'GET',
    url: `${environment.apiBaseUrl}/api/v1/watchlists?market=India&page=0&size=1`,
  },
];
