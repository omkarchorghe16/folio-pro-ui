import { Routes } from '@angular/router';
import { LoginComponent } from './features/login/login.component';
import { RegisterComponent } from './features/register/register.component';
import { PortfolioComponent } from './features/portfolio/portfolio.component';
import { StocksComponent } from './features/stocks/stocks.component';
import { IpoComponent } from './features/ipo/ipo.component';
import { CryptoComponent } from './features/crypto/crypto.component';
import { WatchlistsComponent } from './features/watchlists/watchlists.component';
import { ProfileComponent } from './features/profile/profile.component';
import { SettingsComponent } from './features/settings/settings.component';
import { AdminComponent } from './features/admin/admin.component';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  {
    // Loaded on demand to keep the initial bundle within its budget.
    path: 'dashboard',
    loadComponent: () => import('./features/dashboard/dashboard.component').then((module) => module.DashboardComponent),
    title: 'Dashboard',
  },
  { path: 'portfolio', component: PortfolioComponent },
  { path: 'stocks', component: StocksComponent },
  { path: 'ipo', component: IpoComponent },
  { path: 'crypto', component: CryptoComponent },
  { path: 'watchlists', redirectTo: 'watchlists/us', pathMatch: 'full' },
  { path: 'watchlists/us', component: WatchlistsComponent, data: { market: 'US' }, title: 'US Watchlist' },
  { path: 'watchlists/india', component: WatchlistsComponent, data: { market: 'India' }, title: 'India Watchlist' },
  { path: 'profile', component: ProfileComponent },
  { path: 'settings', component: SettingsComponent },
  { path: 'admin', component: AdminComponent, title: 'Admin' },
  { path: '**', redirectTo: 'login' },
];
