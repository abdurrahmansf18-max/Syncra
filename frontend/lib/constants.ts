export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export const WS_BASE_URL =
  process.env.NEXT_PUBLIC_WS_URL || "ws://127.0.0.1:8000";

export const ROLE_HIERARCHY: Record<string, number> = {
  admin: 3,
  mod: 2,
  member: 1,
};

export const LIMITS = {
  MAX_USERS: 200,
  MAX_OWNED_SERVERS_PER_USER: 2,
  MAX_JOINED_SERVERS_PER_USER: 20,
  MAX_MEMBERS_PER_SERVER: 25,
  MAX_TEXT_CHANNELS_PER_SERVER: 10,
  MAX_VOICE_CHANNELS_PER_SERVER: 3,
  MAX_MESSAGE_LENGTH: 1000,
};