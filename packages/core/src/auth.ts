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
}

export interface AuthContext {
  userId: string;
  userName?: string;
}

// --- AuthService ---

export abstract class AuthService<T extends Entity> extends Service<T> {
  private authState: AuthState | null = null;
  private saveState: ((state: AuthState | null) => void) | null = null;
  private httpDriver: HttpDriver | null = null;
  private authChangeListeners: Array<() => void> = [];

  /** @internal — called by createClient to wire persistence */
  _initAuth(
    loadState: () => AuthState | null,
    saveState: (state: AuthState | null) => void,
  ): void {
    this.saveState = saveState;
    this.authState = loadState();
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
    this.authState = null;
    this.persistState();
  }

  get currentUser(): T | null {
    // Return a shallow proxy — not the full entity, but enough for display
    return this.authState ? ({ id: this.authState.userId, email: this.authState.email } as unknown as T) : null;
  }

  get isLoggedIn(): boolean {
    return this.authState !== null;
  }

  get token(): string | null {
    return this.authState?.token ?? null;
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

  // --- Local mode (original implementation) ---

  private async localLogin(credentials: LoginCredentials): Promise<T> {
    const { items } = await this.list({ filter: { email: credentials.email } });
    if (items.length === 0) {
      throw new NotFoundError('Invalid email or password');
    }

    const user = items[0] as any;
    if (user.password !== credentials.password) {
      throw new ForbiddenError('Invalid email or password');
    }

    this.authState = {
      userId: user.id,
      email: user.email,
      userName: user.name || user.email,
      role: user.role,
      token: this.generateToken(user),
    };
    this.persistState();
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

    this.authState = {
      userId: u.id,
      email: u.email,
      userName: u.name || u.email,
      role: u.role,
      token: this.generateToken(u),
    };
    this.persistState();
    return user;
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
    const token = body[preset.auth.tokenField];
    const user = body[preset.auth.userField] ?? body;

    this.authState = {
      userId: user.id,
      email: user.email ?? credentials.email,
      userName: user.name || user.email || credentials.email,
      role: user.role,
      token,
    };
    this.persistState();
    return user as T;
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
    const token = body[preset.auth.tokenField];
    const user = body[preset.auth.userField] ?? body;

    this.authState = {
      userId: user.id,
      email: user.email ?? (data as any).email,
      userName: user.name || user.email || (data as any).email,
      role: user.role,
      token,
    };
    this.persistState();
    return user as T;
  }

  private generateToken(user: any): string {
    return btoa(JSON.stringify({
      userId: user.id,
      email: user.email,
      role: user.role,
      iat: Date.now(),
      exp: Date.now() + 24 * 60 * 60 * 1000,
    }));
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
