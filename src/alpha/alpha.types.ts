export interface TwitterKolDto {
  twitterHandle: string;
  automatedBy: string | null;
  canDm: boolean | null;
  coverPicture: string | null;
  createdAt: string | null;
  description: string | null;
  favouritesCount: number | null;
  followers: number | null;
  following: number | null;
  isAutomated: boolean | null;
  isBlueVerified: boolean | null;
  isVerified: boolean | null;
  lastUpdated: string | Date | null;
  location: string | null;
  mediaCount: number | null;
  name: string | null;
  profilePicture: string | null;
  protected: boolean | null;
  solanaAddress: string | null;
  statusesCount: number | null;
  twitterId: string;
  url: string | null;
  userName: string | null;
  pnl30d: number | null;
  pnl30dAmount: number | null;
}
