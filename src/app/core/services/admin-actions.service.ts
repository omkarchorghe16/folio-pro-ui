import { HttpClient, HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { AdminAction } from '../models/admin-actions';

export interface AdminActionResult {
  ok: boolean;
  /** HTTP status; 0 when the service could not be reached. */
  status: number;
  /** Response body, pretty-printed when it is JSON. */
  body: string;
  finishedAt: Date;
  durationMs: number;
}

/** Sends an Admin page action and always emits a result (failures included) instead of erroring. */
@Injectable({ providedIn: 'root' })
export class AdminActionsService {
  constructor(private readonly http: HttpClient) {}

  run(action: AdminAction): Observable<AdminActionResult> {
    const started = performance.now();
    const finish = (ok: boolean, status: number, body: string): AdminActionResult => ({
      ok, status, body, finishedAt: new Date(), durationMs: Math.round(performance.now() - started),
    });
    return this.http.request(action.method, action.url, { observe: 'response', responseType: 'text' }).pipe(
      map((response: HttpResponse<string>) => finish(true, response.status, formatBody(response.body))),
      catchError((error: unknown) => {
        if (error instanceof HttpErrorResponse) {
          const body = error.status === 0
            ? `Could not reach ${action.service}. Is it running?`
            : formatBody(typeof error.error === 'string' ? error.error : error.message);
          return of(finish(false, error.status, body));
        }
        return of(finish(false, 0, String(error)));
      }),
    );
  }
}

function formatBody(body: string | null): string {
  const text = (body ?? '').trim();
  if (!text) {
    return '(empty response)';
  }
  if (/^<!doctype html/i.test(text)) {
    return 'Got the app\'s HTML instead of an API response: the dev server is not proxying this path. '
      + 'Add it to proxy.conf.json and restart ng serve.';
  }
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}
