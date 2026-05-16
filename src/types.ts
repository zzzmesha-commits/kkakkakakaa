export interface User {
  displayName: string;
  username: string;
  robux: number;
  avatarUrl?: string;
  email?: string;
  theme?: 'light' | 'dark';
  friends?: Friend[];
}

export interface Friend {
  display: string;
  username: string;
  avatarLetter: string;
  avatarUrl?: string;
}
