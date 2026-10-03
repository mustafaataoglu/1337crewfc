export type Pos = 'K' | 'S' | 'O' | 'F'
export type Result = 'G' | 'B' | 'M'

export interface Jersey { kind: 'home' | 'away'; img: string; colors: string[]; colorName: string }
export interface Side { name: string; code: string; score: number | null; logo?: string; jersey?: Jersey }

export interface Video {
  id: string
  kind: 'full' | 'part' | 'highlight'
  title: string
  len?: string
  thumb?: string
}

export interface Match {
  id: string
  /** EfendiLig'in kalıcı maç kimliği (adres saat değişince değişir, bu değişmez) */
  eid?: string
  season: string
  seasonShort: string
  date: string
  time: string
  status: 'done' | 'upcoming' | 'live'
  comp: string
  compLabel: string
  week?: number
  home: Side
  away: Side
  us: 'home' | 'away'
  result: Result | null
  videos: Video[]
  mvp?: { name: string; ours: boolean }
  lineup?: { xi: string[]; subs: string[] }
  forfeit?: boolean
  rapor?: string
  onizleme?: string
  scorers?: { slug: string; name: string; n: number }[]
  assisters?: { slug: string; name: string; n: number }[]
}

export interface Line { m: number; g: number; a: number; yc?: number; rc?: number; mvp?: number }

export interface Player {
  slug: string
  name: string
  short: string
  no: string
  pos: Pos
  captain: boolean
  photo?: string
  firstYear?: number
  seasons?: number
  otherClubMatches?: number
  former?: boolean
  birthday?: { day: number; month: number }
  nowClub?: string
  career: Line
  current: Line
  bySeason: ({ label: string } & Line)[]
}

export interface TableRow { rank: number; name: string; code: string; played: number; points: number; gd: number; us: boolean }

export interface FeedItem {
  id: string
  kind: 'birthday' | 'preview' | 'report' | 'video' | 'milestone' | 'streak' | 'table' | 'vote'
  date: string
  title: string
  body: string
  matchId?: string
  playerSlug?: string
  videoId?: string
  thumb?: string
}

export interface SiteData {
  updatedAt: string
  club: {
    name: string
    logo?: string
    founded: number
    coach: string
    captains: string[]
    season: string
    rank: number
    stats: { played: number; wins: number; draws: number; losses: number; gf: number; ga: number; points: number }
    form: Result[]
  }
  table: TableRow[]
  matches: Match[]
  players: Player[]
  extraVideos: Video[]
  gallery: { file: string; kind: 'foto' | 'forma'; date: string; w: number; h: number; src: string }[]
  feed: FeedItem[]
  /** eski oyuncu adresi → güncel adres */
  oyuncuTakma?: Record<string, string>
  /** maçın eski adresi (saat değişmeden önceki) → güncel adres */
  macTakma?: Record<string, string>
}
