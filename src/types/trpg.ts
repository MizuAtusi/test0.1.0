// TRPG Types for Call of Cthulhu 6th Edition

export interface Room {
  id: string;
  name: string;
  gm_key_hash: string;
  current_background_url?: string;
  theme?: RoomTheme;
  house_rules?: string;
  created_at: string;
}

export interface RoomTheme {
  textWindowBg?: string;
  textWindowOpacity?: number;
  buttonImage?: string;
  fontFamily?: string;
  fontSize?: number;
  lineHeight?: number;
  padding?: number;
  borderColor?: string;
  textColor?: string;
}

export interface Participant {
  id: string;
  room_id: string;
  name: string;
  role: 'PL' | 'GM';
  session_id: string;
  created_at: string;
}

export interface Message {
  id: string;
  room_id: string;
  channel: 'public' | 'secret' | 'chat';
  secret_allow_list: string[];
  type: 'speech' | 'mono' | 'system' | 'dice';
  speaker_name: string;
  speaker_portrait_url?: string;
  text: string;
  dice_payload?: DicePayload;
  created_at: string;
}

export interface DicePayload {
  expression: string;
  rolls: number[];
  total: number;
  threshold?: number;
  skillName?: string;
  result?: 'critical' | 'success' | 'failure' | 'fumble';
}

export interface CharacterStats {
  STR: number;
  CON: number;
  POW: number;
  DEX: number;
  APP: number;
  SIZ: number;
  INT: number;
  EDU: number;
}

export interface CharacterDerived {
  HP: number;
  MP: number;
  SAN: number;
  DB: string;
}

export interface Character {
  id: string;
  room_id: string;
  owner_participant_id?: string;
  name: string;
  is_npc: boolean;
  stats: CharacterStats;
  derived: CharacterDerived;
  skills: Record<string, number>;
  skill_points?: {
    occupation: Record<string, number>;
    interest: Record<string, number>;
    other?: Record<string, number>;
  };
  items: string[];
  memo: string;
  avatar_url?: string;
  avatar_scale?: number;
  avatar_offset_x?: number;
  avatar_offset_y?: number;
  created_at: string;
}

export interface Asset {
  id: string;
  room_id: string;
  character_id?: string;
  kind: 'portrait' | 'background' | 'se' | 'bgm';
  url: string;
  label: string;
  tag: string;
  is_default: boolean;
  layer_order: number;
  scale?: number;
  offset_x?: number;
  offset_y?: number;
  created_at: string;
}

export interface Macro {
  id: string;
  room_id: string;
  title: string;
  text: string;
  scope: 'GM' | 'ALL';
  sort_order?: number;
  created_at: string;
}

export interface StageState {
  id: string;
  room_id: string;
  background_url?: string;
  active_portraits: ActivePortrait[];
  is_secret: boolean;
  secret_allow_list: string[];
  updated_at: string;
}

export interface ActivePortrait {
  characterId: string;
  assetId: string;
  url: string;
  label: string;
  tag: string;
  position: 'left' | 'center' | 'right';
  layerOrder: number;
  scale?: number;
  offsetX?: number;
  offsetY?: number;
}

export interface SessionData {
  sessionId: string;
  participantId?: string;
  roomId?: string;
  role?: 'PL' | 'GM';
  name?: string;
}

// Replay export types
export interface ReplayEvent {
  timestamp: string;
  type: 'message' | 'background' | 'portraits' | 'secret';
  data: any;
}
