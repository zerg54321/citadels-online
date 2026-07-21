export interface RoomInfoResponse {
  exists: boolean;
  inProgress?: boolean;
  playerCount?: number;
}

export interface StartGameReponse {
  status: 'ok' | 'error';
  message?: string;
}
