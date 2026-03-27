// === Enums ===
export type UserStatus = "active" | "disabled";
export type MemberRole = "admin" | "mod" | "member";
export type ChannelType = "text" | "voice";
export type ReportStatus = "open" | "reviewing" | "resolved" | "rejected";

// === User ===
export interface User {
  id: string;
  username: string;
  email: string;
  status: UserStatus;
  avatar_url?: string;
}

// === Server ===
export interface Server {
  id: string;
  owner_id: string;
  name: string;
  handle: string;
  is_published: boolean;
  invite_min_role: MemberRole;
  created_at: string;
  updated_at: string;
}

// === Membership ===
export interface Membership {
  server_id: string;
  user_id: string;
  role: MemberRole;
  is_banned: boolean;
  mute_until: string | null;
  is_online: boolean;
  last_seen_at: string;
  user?: User;
}

// === Invite ===
export interface Invite {
  code: string;
  server_id: string;
  server_name?: string | null;
  assigned_role: MemberRole;
  uses_count: number;
  max_uses: number | null;
  expires_at: string | null;
}

// === Category ===
export interface Category {
  id: string;
  server_id: string;
  name: string;
  position: number;
  is_published: boolean;
  created_at: string;
}

// === Channel ===
export interface Channel {
  id: string;
  server_id: string;
  name: string;
  type: ChannelType;
  category_id: string | null;
  min_role_to_view: MemberRole;
  min_role_to_post: MemberRole;
  is_published: boolean;
  created_at: string;
}

// === Message ===
export interface Message {
  id: string;
  author_id: string;
  content: string;
  created_at: string;
  is_deleted: boolean;
  author?: User;
}

// === Report ===
export interface Report {
  id: string;
  server_id: string;
  message_id: string;
  created_at: string;
  reporter_id: string | null;
  status: ReportStatus;
  reason: string | null;
  resolution_note?: string | null;
  reporter?: User;
  reported_user?: User;
  message_content?: string | null;
}

export interface MyReportsResponse {
  submitted: Report[];
  received: Report[];
}

// === Voice ===
export interface VoiceState {
  user_id: string;
  channel_id: string;
}

export interface VoiceParticipant extends User {
  mute_until: string | null;
}

// === Poll ===
export interface PollOption {
  id: string;
  poll_id: string;
  label: string;
  position: number;
  vote_count: number;
  vote_percent: number;
}

export interface Poll {
  id: string;
  server_id: string;
  channel_id: string;
  created_by: string;
  question: string;
  is_closed: boolean;
  closes_at: string | null;
  created_at: string;
  total_votes: number;
  my_vote_option_id: string | null;
  options: PollOption[];
}

export interface VoteResult {
  poll_id: string;
  voter_id: string;
  option_id: string;
}

// === Stats ===
export interface Stats {
  total_messages: number;
  active_voice_users: number;
  total_members: number;
}

// === Token ===
export interface Token {
  access_token: string;
  token_type: string;
}

// === Bot Help ===
export interface BotCommand {
  command: string;
  description: string;
}

// === Error ===
export interface ErrorDetail {
  code: string;
  message: string;
  details?: unknown;
}

export interface ErrorResponse {
  error: ErrorDetail;
}

export interface UserLimitStatus {
  limits: {
    max_owned_servers_per_user: number;
    max_joined_servers_per_user: number;
    max_text_channels_per_server: number;
    max_voice_channels_per_server: number;
    max_text_channel_ws_connections: number;
    max_voice_channel_users: number;
  };
  usage: {
    owned_servers: number;
    joined_servers: number;
  };
}

export interface ServerLimitUsage {
  limits: {
    max_text_channels: number;
    max_voice_channels: number;
    max_text_channel_connections: number;
    max_voice_channel_users: number;
  };
  usage: {
    text_channels: number;
    voice_channels: number;
    members: number;
    active_text_ws_connections: number;
    active_voice_ws_connections: number;
    active_voice_presence: number;
  };
}
