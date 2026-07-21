export interface RoomInfoResponse {
  status: 'open' | 'closed' | 'not found' | 'error';
  message?: string;
}

export interface StartGameReponse {
  status: 'ok' | 'error';
  message?: string;
}
