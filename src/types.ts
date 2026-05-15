export interface User {
  displayName: string;
  username: string;
  robux: number;
  avatarUrl?: string;
  theme?: 'light' | 'dark';
}

export interface Friend {
  display: string;
  username: string;
  avatarLetter: string;
  avatarUrl?: string;
}
