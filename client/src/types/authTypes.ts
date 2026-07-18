export type AuthUser = {
  id: string;
  username: string;
  displayName: string;
};

export type AuthResponse = {
  status: 'ok' | 'error';
  token?: string;
  user?: AuthUser;
  message?: string;
};
