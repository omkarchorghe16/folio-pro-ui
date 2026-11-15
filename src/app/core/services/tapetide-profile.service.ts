import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';

/** Raw Tapetide JSON. Only the fields the watchlist uses are typed; everything is optional. */
type Num = number | null | undefined;
type Str = string | null | undefined;

export interface TapetideProfilePayload {
  data?: {
    company?: {
      name?: Str; display_name?: Str; about?: Str; symbol?: Str; nse_symbol?: Str; bse_code?: Str;
      exchange?: Str; isin?: Str; website?: Str; ceo?: Str; employees?: Num; listing_date?: Str;
      sector?: Str; industry?: Str; basic_industry?: Str; macro_sector?: Str; stock_type?: Str;
      is_active?: boolean | null; is_fno?: boolean | null; face_value?: Num;
      pros?: string[] | null; cons?: string[] | null; updated_at?: Str;
    };
    fundamentals?: {
      book_value?: Num; company_classification?: Str; day_rsi14?: Num; debt_to_equity?: Num;
      dividend_yield?: Num; eps?: Num; high_52w?: Num; low_52w?: Num; market_cap?: Num;
      price_to_book?: Num; revenue_growth_1y?: Num; roce?: Num; roe?: Num; stock_pe?: Num;
      volume?: Num; yoy_quarterly_profit_growth?: Num;
    };
    price_metrics?: {
      price?: Num; market_cap?: Num; pe_ttm?: Num; pb?: Num; eps_ttm?: Num; book_value?: Num;
      high_52w?: Num; low_52w?: Num; shares_outstanding?: Num; as_of?: Str;
    };
    quote?: {
      price?: Num; change?: Num; change_pct?: Num; open?: Num; high?: Num; low?: Num;
      prev_close?: Num; volume?: Num; updated_at?: Str;
    };
    quarterly_growth?: {
      latest_quarter?: Str; net_profit_qoq?: Num; net_profit_yoy?: Num; sales_qoq?: Num; sales_yoy?: Num;
    };
    /** e.g. { "Compounded Sales Growth": { "5 Years": "22%" } } */
    growth_metrics?: Record<string, Record<string, string | null> | null>;
    unified_growth_rates?: Record<string, Record<string, Num> | null>;
  };
  ratings?: {
    data?: { buy?: Num; hold?: Num; sell?: Num; percent_buy?: Num; total_ratings?: Num };
  };
  peers?: {
    data?: {
      rows?: Array<{
        symbol?: Str; is_self?: boolean | null; promoter_holding?: Num; roa?: Num;
        net_profit_ttm?: Num; sales_ttm?: Num;
      }> | null;
      median?: { pe?: Num } | null;
    };
  };
}

/** Row returned by news-scheduler-svc (tapetide_stock_datasets). `payload` is Tapetide's JSON. */
export interface TapetideProfileResponse {
  symbol: string;
  dataset: string;
  payload: TapetideProfilePayload;
  updatedDate?: string;
}

/**
 * India stock profiles from news-scheduler-svc (port 8082, reached through the dev proxy at /api/india).
 * The service answers 204 when Tapetide has no data for a symbol; that is returned here as null.
 */
@Injectable({ providedIn: 'root' })
export class TapetideProfileService {
  private readonly profileUrl = '/api/india/tapetide/profile';

  constructor(private readonly http: HttpClient) {}

  getProfile(symbol: string): Observable<TapetideProfileResponse | null> {
    const params = new HttpParams().set('include', 'ratings,peers');
    return this.http.get<TapetideProfileResponse | null>(
      `${this.profileUrl}/${encodeURIComponent(symbol)}`, { params },
    ).pipe(map((response) => response ?? null));
  }
}
