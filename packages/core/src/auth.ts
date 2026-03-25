import { Service } from './service';
import { Entity } from './entity';
import { ConflictError, NotFoundError, ForbiddenError } from './errors';
import type { HttpDriver } from './drivers/http';
import type { Preset } from './presets/types';

// --- Types ---

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthState {
  userId: string;
  email: string;
  userName?: string;
  role?: string;
  token: string;
  refreshToken?: string;
  expiresAt?: number;
}

export interface AuthContext {
  userId: string;
  userName?: string;
}

const LS_AUTH_KEY = 'fauxbase:auth';

// --- AuthService ---

export abstract class AuthService<T extends Entity> extends Service<T> {
  private authState: AuthState | null = null;
  private saveState: ((state: AuthState | null) => void) | null = null;
  private httpDriver: HttpDriver | null = null;
  private authChangeListeners: Array<() => void> = [];
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private _isRefreshing: Promise<void> | null = null;

  /** @internal — called by createClient to wire persistence */
  _initAuth(
    loadState: () => AuthState | null,
    saveState: (state: AuthState | null) => void,
  ): void {
    this.saveState = saveState;
    this.authState = loadState();

    // Schedule refresh if we have a token with expiry
    if (this.authState?.expiresAt) {
      this.scheduleRefresh();
    }
  }

  /** @internal — called by createClient when using HttpDriver */
  _setHttpMode(driver: HttpDriver): void {
    this.httpDriver = driver;
  }

  async login(credentials: LoginCredentials): Promise<T> {
    if (this.httpDriver) {
      return this.httpLogin(credentials);
    }
    return this.localLogin(credentials);
  }

  async register(data: Partial<T>): Promise<T> {
    if (this.httpDriver) {
      return this.httpRegister(data);
    }
    return this.localRegister(data);
  }

  logout(): void {
    this.clearRefreshTimer();
    this.authState = null;
    this.persistState();
  }

  /** Manually refresh the token. Returns the new token. */
  async refresh(): Promise<string> {
    if (!this.authState?.refreshToken) {
      throw new ForbiddenError('No refresh token available');
    }

    if (this.httpDriver) {
      return this.httpRefresh();
    }
    return this.localRefresh();
  }

  /**
   * Ensure the token is valid before making a request.
   * If expired, auto-refreshes. Safe to call concurrently.
   */
  async ensureValidToken(): Promise<void> {
    if (!this.authState) return;
    if (!this.authState.expiresAt) return;

    // Refresh if expires within 30 seconds
    const buffer = 30 * 1000;
    if (Date.now() + buffer >= this.authState.expiresAt) {
      if (!this._isRefreshing) {
        this._isRefreshing = this.refresh().then(() => {}).finally(() => {
          this._isRefreshing = null;
        });
      }
      await this._isRefreshing;
    }
  }

  get currentUser(): T | null {
    return this.authState ? ({ id: this.authState.userId, email: this.authState.email } as unknown as T) : null;
  }

  get isLoggedIn(): boolean {
    return this.authState !== null;
  }

  get token(): string | null {
    return this.authState?.token ?? null;
  }

  get refreshToken(): string | null {
    return this.authState?.refreshToken ?? null;
  }

  get expiresAt(): number | null {
    return this.authState?.expiresAt ?? null;
  }

  get isExpired(): boolean {
    if (!this.authState?.expiresAt) return false;
    return Date.now() >= this.authState.expiresAt;
  }

  hasRole(role: string): boolean {
    return this.authState?.role === role;
  }

  getAuthContext(): AuthContext | null {
    if (!this.authState) return null;
    return {
      userId: this.authState.userId,
      userName: this.authState.userName,
    };
  }

  // --- Local mode ---

  private async localLogin(credentials: LoginCredentials): Promise<T> {
    const { items } = await this.list({ filter: { email: credentials.email } });
    if (items.length === 0) {
      throw new NotFoundError('Invalid email or password');
    }

    const user = items[0] as any;
    if (user.password !== credentials.password) {
      throw new ForbiddenError('Invalid email or password');
    }

    const expiresAt = Date.now() + 60 * 60 * 1000; // 1 hour
    this.authState = {
      userId: user.id,
      email: user.email,
      userName: user.name || user.email,
      role: user.role,
      token: this.generateToken(user, expiresAt),
      refreshToken: this.generateRefreshToken(user),
      expiresAt,
    };
    this.persistState();
    this.scheduleRefresh();
    return user;
  }

  private async localRegister(data: Partial<T>): Promise<T> {
    const email = (data as any).email;
    if (email) {
      const { items } = await this.list({ filter: { email } });
      if (items.length > 0) {
        throw new ConflictError('Email already registered');
      }
    }

    const { data: user } = await this.create(data);
    const u = user as any;

    const expiresAt = Date.now() + 60 * 60 * 1000;
    this.authState = {
      userId: u.id,
      email: u.email,
      userName: u.name || u.email,
      role: u.role,
      token: this.generateToken(u, expiresAt),
      refreshToken: this.generateRefreshToken(u),
      expiresAt,
    };
    this.persistState();
    this.scheduleRefresh();
    return user;
  }

  private async localRefresh(): Promise<string> {
    // Decode refresh token to get user info
    const payload = JSON.parse(atob(this.authState!.refreshToken!));
    const expiresAt = Date.now() + 60 * 60 * 1000;

    this.authState = {
      ...this.authState!,
      token: this.generateToken(payload, expiresAt),
      refreshToken: this.generateRefreshToken(payload),
      expiresAt,
    };
    this.persistState();
    this.scheduleRefresh();
    return this.authState!.token;
  }

  // --- HTTP mode ---

  private async httpLogin(credentials: LoginCredentials): Promise<T> {
    const preset = (this.httpDriver as any).preset as Preset;
    const baseUrl = (this.httpDriver as any).baseUrl as string;
    const url = `${baseUrl}${preset.auth.loginUrl}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      if (response.status === 401 || response.status === 403) {
        throw new ForbiddenError(body.message ?? 'Invalid email or password');
      }
      if (response.status === 404) {
        throw new NotFoundError(body.message ?? 'Invalid email or password');
      }
      throw new ForbiddenError(body.message ?? 'Login failed');
    }

    const body = await response.json();
    this.setAuthFromResponse(body, preset, credentials.email);
    const unwrapped = this.unwrapBody(body);
    return (unwrapped[preset.auth.userField] ?? unwrapped) as T;
  }

  private async httpRegister(data: Partial<T>): Promise<T> {
    const preset = (this.httpDriver as any).preset as Preset;
    const baseUrl = (this.httpDriver as any).baseUrl as string;
    const url = `${baseUrl}${preset.auth.registerUrl}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      if (response.status === 409) {
        throw new ConflictError(body.message ?? 'Email already registered');
      }
      throw new ForbiddenError(body.message ?? 'Registration failed');
    }

    const body = await response.json();
    this.setAuthFromResponse(body, preset, (data as any).email);
    const unwrapped = this.unwrapBody(body);
    return (unwrapped[preset.auth.userField] ?? unwrapped) as T;
  }

  private async httpRefresh(): Promise<string> {
    const preset = (this.httpDriver as any).preset as Preset;
    const baseUrl = (this.httpDriver as any).baseUrl as string;
    const refreshUrl = preset.auth.refreshUrl;

    if (!refreshUrl) {
      throw new ForbiddenError('Refresh URL not configured in preset');
    }

    const response = await fetch(`${baseUrl}${refreshUrl}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: this.authState!.refreshToken }),
    });

    if (!response.ok) {
      // Refresh failed — force logout
      this.logout();
      throw new ForbiddenError('Session expired. Please log in again.');
    }

    const body = await response.json();
    const unwrapped = this.unwrapBody(body);
    const token = unwrapped[preset.auth.tokenField];
    const refreshToken = preset.auth.refreshTokenField
      ? unwrapped[preset.auth.refreshTokenField]
      : this.authState!.refreshToken;

    const expiresIn = preset.auth.expiresInField ? unwrapped[preset.auth.expiresInField] : null;
    const expiresAt = expiresIn ? Date.now() + expiresIn * 1000 : undefined;

    this.authState = {
      ...this.authState!,
      token,
      refreshToken,
      expiresAt,
    };
    this.persistState();
    this.scheduleRefresh();
    return token;
  }

  private unwrapBody(body: any): any {
    // Support wrapped responses like { success: true, data: { token, user, ... } }
    if (body.data && typeof body.data === 'object' && !Array.isArray(body.data)) {
      return body.data;
    }
    return body;
  }

  private setAuthFromResponse(body: any, preset: Preset, fallbackEmail: string): void {
    const unwrapped = this.unwrapBody(body);
    const token = unwrapped[preset.auth.tokenField];
    const user = unwrapped[preset.auth.userField] ?? unwrapped;
    const refreshToken = preset.auth.refreshTokenField
      ? unwrapped[preset.auth.refreshTokenField]
      : undefined;
    const expiresIn = preset.auth.expiresInField ? unwrapped[preset.auth.expiresInField] : null;
    const expiresAt = expiresIn ? Date.now() + expiresIn * 1000 : undefined;

    this.authState = {
      userId: user.id,
      email: user.email ?? fallbackEmail,
      userName: user.name || user.email || fallbackEmail,
      role: user.role,
      token,
      refreshToken,
      expiresAt,
    };
    this.persistState();
    this.scheduleRefresh();
  }

  // --- Token generation (local mode) ---

  private generateToken(user: any, expiresAt: number): string {
    return btoa(JSON.stringify({
      userId: user.id ?? user.userId,
      email: user.email,
      role: user.role,
      iat: Date.now(),
      exp: expiresAt,
    }));
  }

  private generateRefreshToken(user: any): string {
    return btoa(JSON.stringify({
      userId: user.id ?? user.userId,
      email: user.email,
      role: user.role,
      type: 'refresh',
      iat: Date.now(),
    }));
  }

  // --- Refresh scheduling ---

  private scheduleRefresh(): void {
    this.clearRefreshTimer();
    if (!this.authState?.expiresAt) return;

    // Refresh 60 seconds before expiry
    const delay = this.authState.expiresAt - Date.now() - 60 * 1000;
    if (delay <= 0) return;

    this.refreshTimer = setTimeout(() => {
      this.refresh().catch(() => {
        // Silent fail — next request will trigger ensureValidToken
      });
    }, delay);
  }

  private clearRefreshTimer(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /** @internal — called by createClient to listen for auth state changes */
  _onAuthChange(listener: () => void): void {
    this.authChangeListeners.push(listener);
  }

  private persistState(): void {
    if (this.saveState) {
      this.saveState(this.authState);
    }
    for (const listener of this.authChangeListeners) {
      listener();
    }
  }
}
