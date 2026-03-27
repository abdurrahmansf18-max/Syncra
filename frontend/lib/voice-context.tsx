"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { WS_BASE_URL } from "@/lib/constants";
import type { VoiceParticipant } from "@/lib/types";

interface VoiceContextType {
  currentChannelId: string | null;
  currentChannelName: string | null; // We might need to fetch this or pass it
  participants: VoiceParticipant[];
  joined: boolean;
  loading: boolean;
  error: string | null;
  speakingUsers: Record<string, boolean>;
  locallyMutedUsers: Record<string, boolean>;
  micMuted: boolean;
  joinChannel: (channelId: string, channelName?: string) => Promise<void>;
  leaveChannel: () => Promise<void>;
  toggleMicMute: () => void;
  toggleLocalMuteForUser: (userId: string) => void;
  isMutedByModerator: boolean;
  muteRemainingText: string;
}

const VoiceContext = createContext<VoiceContextType | undefined>(undefined);

interface IceServerResponse {
  ice_servers: RTCIceServer[];
}

export function VoiceProvider({ children }: { children: ReactNode }) {
  const { user, token } = useAuth();

  // State
  const [currentChannelId, setCurrentChannelId] = useState<string | null>(null);
  const [currentChannelName, setCurrentChannelName] = useState<string | null>(null);
  const [participants, setParticipants] = useState<VoiceParticipant[]>([]);
  const [speakingUsers, setSpeakingUsers] = useState<Record<string, boolean>>({});
  const [locallyMutedUsers, setLocallyMutedUsers] = useState<Record<string, boolean>>({});
  const [micMuted, setMicMuted] = useState(false);
  const [joined, setJoined] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [iceServers, setIceServers] = useState<RTCIceServer[]>([
    { urls: "stun:stun.l.google.com:19302" },
  ]);

  // Refs for WebRTC & WebSocket
  const wsRef = useRef<WebSocket | null>(null);
  const keepAliveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const lastPongAtRef = useRef<number>(Date.now());
  
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  // We'll manage audio elements via state or refs. 
  // Ideally, valid remote streams should be in state so we can render <audio> elements in the return.
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());

  const speakingStopFnsRef = useRef<Map<string, () => void>>(new Map());
  const forcedMuteByModeratorRef = useRef(false);

  // Computed
  const myParticipant = participants.find((p) => p.id === user?.id);
  const isMutedByModerator =
    !!myParticipant?.mute_until && new Date(myParticipant.mute_until).getTime() > Date.now();

  const getRemainingMuteText = () => {
    if (!myParticipant?.mute_until) return "";
    const totalMs = new Date(myParticipant.mute_until).getTime() - Date.now();
    if (totalMs <= 0) return "";
    const totalMinutes = Math.ceil(totalMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0) return `${hours}s ${minutes}d`;
    return `${minutes}d`;
  };

  // --- Audio / Speaking Detection Logic ---
  const stopSpeakingDetection = useCallback((userId: string) => {
    const stop = speakingStopFnsRef.current.get(userId);
    if (stop) {
      stop();
      speakingStopFnsRef.current.delete(userId);
    }
    setSpeakingUsers((prev) => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });
  }, []);

  const startSpeakingDetection = useCallback((userId: string, stream: MediaStream) => {
    stopSpeakingDetection(userId);

    const AudioCtx =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const audioContext = new AudioCtx();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.8
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    let active = true;

    const intervalId = window.setInterval(() => {
      if (!active) return;
      analyser.getByteFrequencyData(dataArray);
      const avg = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
      const isSpeaking = avg > 18;
      setSpeakingUsers((prev) => {
        if (prev[userId] === isSpeaking) return prev;
        return { ...prev, [userId]: isSpeaking };
      });
    }, 180);

    const stop = () => {
      active = false;
      window.clearInterval(intervalId);
      source.disconnect();
      analyser.disconnect();
      void audioContext.close().catch(() => undefined);
    };

    speakingStopFnsRef.current.set(userId, stop);
  }, [stopSpeakingDetection]);


  // --- WebRTC Management ---
  const cleanupPeerConnection = useCallback((peerUserId: string) => {
    const peer = peerConnectionsRef.current.get(peerUserId);
    if (peer) {
      peer.close();
      peerConnectionsRef.current.delete(peerUserId);
    }
    remoteStreamsRef.current.delete(peerUserId);
    setRemoteStreams(new Map(remoteStreamsRef.current));
    stopSpeakingDetection(peerUserId);
  }, [stopSpeakingDetection]);

  const cleanupAllConnections = useCallback(() => {
    peerConnectionsRef.current.forEach((peer) => peer.close());
    peerConnectionsRef.current.clear();
    remoteStreamsRef.current.clear();
    setRemoteStreams(new Map());
    speakingStopFnsRef.current.forEach((stop) => stop());
    speakingStopFnsRef.current.clear();
    setSpeakingUsers({});
  }, []);

  const stopLocalMedia = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    if (user?.id) {
      stopSpeakingDetection(user.id);
    }
    setMicMuted(false);
  }, [stopSpeakingDetection, user?.id]);

  const closeWebSocket = useCallback(() => {
    if (keepAliveTimerRef.current) {
      clearInterval(keepAliveTimerRef.current);
      keepAliveTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  // --- API Calls ---
  const fetchPresence = useCallback(async () => {
    if (!currentChannelId) return;
    try {
      const data = await api.get<VoiceParticipant[]>(`/channels/${currentChannelId}/presence`);
      setParticipants(data);
      if (user) {
        // Correct joined state based on presence if needed, but we track it locally mostly
        // setJoined(data.some((p) => p.id === user.id)); 
      }
    } catch {
      // setParticipants([]);
    }
  }, [currentChannelId, user]);

  const fetchIceServers = useCallback(async () => {
    try {
      const data = await api.get<IceServerResponse>("/webrtc/ice-servers");
      if (Array.isArray(data?.ice_servers) && data.ice_servers.length > 0) {
        setIceServers(data.ice_servers);
      }
    } catch {
      // fallback
    }
  }, []);

  // --- Signaling ---
  const sendSignal = useCallback((signalType: "offer" | "answer" | "candidate", payload: Record<string, unknown>) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: signalType, payload }));
  }, []);

  const createPeerConnection = useCallback((targetUserId: string) => {
    let peer = peerConnectionsRef.current.get(targetUserId);
    if (peer) return peer;

    peer = new RTCPeerConnection({ iceServers });

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        peer?.addTrack(track, localStreamRef.current as MediaStream);
      });
    }

    peer.onicecandidate = (event) => {
      if (!event.candidate) return;
      sendSignal("candidate", { target_user_id: targetUserId, candidate: event.candidate });
    };

    peer.ontrack = (event) => {
      const [stream] = event.streams;
      if (!stream) return;
      remoteStreamsRef.current.set(targetUserId, stream);
      setRemoteStreams(new Map(remoteStreamsRef.current));
      startSpeakingDetection(targetUserId, stream);
    };

    peer.onconnectionstatechange = () => {
      if (["failed", "closed", "disconnected"].includes(peer?.connectionState || "")) {
        cleanupPeerConnection(targetUserId);
      }
    };

    peerConnectionsRef.current.set(targetUserId, peer);
    return peer;
  }, [cleanupPeerConnection, iceServers, sendSignal, startSpeakingDetection]);

  const createOfferForPeer = useCallback(async (targetUserId: string) => {
    const peer = createPeerConnection(targetUserId);
    if (peer.signalingState !== "stable") return;
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    sendSignal("offer", { target_user_id: targetUserId, sdp: offer });
  }, [createPeerConnection, sendSignal]);

  const handleSignalMessage = useCallback(async (raw: string) => {
    if (!user) return;
    try {
      const parsed = JSON.parse(raw);
      if (parsed.type !== "webrtc_signal") return;

      const signalType = parsed?.data?.signal_type as "offer" | "answer" | "candidate";
      const senderId = String(parsed?.data?.sender_id || "");
      const payload = parsed?.data?.payload || {};
      const targetId = payload?.target_user_id ? String(payload.target_user_id) : null;

      if (!senderId || senderId === user.id) return;
      if (targetId && targetId !== user.id) return;

      if (signalType === "offer") {
        const peer = createPeerConnection(senderId);
        if (payload?.sdp) {
          await peer.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          sendSignal("answer", { target_user_id: senderId, sdp: answer });
        }
        return;
      }
      if (signalType === "answer") {
        const peer = createPeerConnection(senderId);
        if (payload?.sdp) {
          await peer.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        }
        return;
      }
      if (signalType === "candidate") {
        const peer = createPeerConnection(senderId);
        if (payload?.candidate) {
          await peer.addIceCandidate(new RTCIceCandidate(payload.candidate));
        }
      }
    } catch {
      return;
    }
  }, [createPeerConnection, sendSignal, user]);

  // --- Effects ---

  // Initial setup
  useEffect(() => {
    void fetchIceServers();
  }, [fetchIceServers]);

  // Periodic presence fetch for active channel
  useEffect(() => {
    if (!joined || !currentChannelId) return;
    fetchPresence();
    const interval = setInterval(fetchPresence, 3000);
    return () => clearInterval(interval);
  }, [joined, currentChannelId, fetchPresence]);

  // WebSocket Connection Logic
  useEffect(() => {
    if (!joined || !currentChannelId || !token) return;

    let stopped = false;
    const clearReconnect = () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    const connect = () => {
      const ws = new WebSocket(`${WS_BASE_URL}/ws/channel/${currentChannelId}?token=${encodeURIComponent(token)}`);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptRef.current = 0;
        lastPongAtRef.current = Date.now();
        if (keepAliveTimerRef.current) clearInterval(keepAliveTimerRef.current);
        keepAliveTimerRef.current = setInterval(() => {
          if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
          if (Date.now() - lastPongAtRef.current > 65000) { // 65s timeout
             wsRef.current.close();
             return;
          }
          wsRef.current.send(JSON.stringify({ type: "ping" }));
        }, 25000); // 25s ping
      };

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (parsed?.type === "pong") {
             lastPongAtRef.current = Date.now();
             return;
          }
        } catch {}
        void handleSignalMessage(event.data);
      };

      ws.onerror = () => ws.close();
      ws.onclose = (evt) => {
        if (keepAliveTimerRef.current) {
          clearInterval(keepAliveTimerRef.current);
          keepAliveTimerRef.current = null;
        }
        if (stopped) return;
        if (evt.code === 4003 || evt.code === 4001) {
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("auth:unauthorized"));
          }
          return; 
        }
        // Reconnect logic
        const delay = Math.min(1000 * 2 ** reconnectAttemptRef.current, 8000);
        reconnectAttemptRef.current += 1;
        clearReconnect();
        reconnectTimerRef.current = setTimeout(connect, delay);
      };
    };

    connect();

    // CLEANUP only if channel or joined changes
    return () => {
      stopped = true;
      clearReconnect();
      closeWebSocket();
    };
  }, [currentChannelId, joined, token, closeWebSocket, handleSignalMessage]);

  // Initiate Offers to peers
  useEffect(() => {
    if (!joined || !user) return;
    const participantIds = participants.map((p) => p.id).filter((id) => id !== user.id);
    
    // Cleanup old
    const existingPeerIds = Array.from(peerConnectionsRef.current.keys());
    existingPeerIds.forEach((peerId) => {
      if (!participantIds.includes(peerId)) {
        cleanupPeerConnection(peerId);
      }
    });

    // Create new
    participantIds.forEach((peerId) => {
      const shouldInitiate = user.id > peerId;
      if (shouldInitiate) {
        void createOfferForPeer(peerId);
      }
    });
  }, [joined, participants, user, cleanupPeerConnection, createOfferForPeer]);

  // Mute logic
  const toggleMicMute = useCallback(() => {
    if (!localStreamRef.current) return;
    if (isMutedByModerator) return;
    const next = !micMuted;
    localStreamRef.current.getAudioTracks().forEach((track) => {
      track.enabled = !next;
    });
    setMicMuted(next);
    if (user?.id && next) {
      setSpeakingUsers((prev) => ({ ...prev, [user.id]: false }));
    }
  }, [micMuted, isMutedByModerator, user?.id]);

  useEffect(() => {
    if (!localStreamRef.current) return;
    const audioTracks = localStreamRef.current.getAudioTracks();
    if (audioTracks.length === 0) return;

    if (isMutedByModerator) {
      if (!micMuted) forcedMuteByModeratorRef.current = true;
      audioTracks.forEach((track) => (track.enabled = false));
      setMicMuted(true);
      if (user?.id) setSpeakingUsers((prev) => ({ ...prev, [user.id]: false }));
      return;
    }

    if (forcedMuteByModeratorRef.current) {
      audioTracks.forEach((track) => (track.enabled = true));
      setMicMuted(false);
      forcedMuteByModeratorRef.current = false;
    }
  }, [isMutedByModerator, micMuted, user?.id]);

  const toggleLocalMuteForUser = useCallback((targetUserId: string) => {
    setLocallyMutedUsers((prev) => ({
      ...prev,
      [targetUserId]: !prev[targetUserId],
    }));
  }, []);

  // --- Public Methods ---

  const joinChannel = async (channelId: string, channelName?: string) => {
    if (currentChannelId === channelId && joined) return; // Already joined
    if (joined) {
       await leaveChannel(); // Leave current first
    }

    setLoading(true);
    setError(null);
    setCurrentChannelId(channelId);
    if(channelName) setCurrentChannelName(channelName);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      if (user?.id) startSpeakingDetection(user.id, stream);

      await api.post(`/channels/${channelId}/join`);
      setJoined(true);
      await fetchPresence(); // Fetch immediately
    } catch (err) {
      stopLocalMedia();
      setError(err instanceof Error ? err.message : "Ses kanalına katılamadınız.");
      setCurrentChannelId(null);
      setCurrentChannelName(null);
    } finally {
      setLoading(false);
    }
  };

  const leaveChannel = async () => {
    if (!currentChannelId || !joined) return;
    setLoading(true);
    try {
      await api.post(`/channels/${currentChannelId}/leave`);
    } catch (err) {
        console.error("Leave error", err);
    } finally {
      setJoined(false);
      setCurrentChannelId(null);
      setCurrentChannelName(null);
      closeWebSocket();
      cleanupAllConnections();
      stopLocalMedia();
      setParticipants([]);
      setLoading(false);
    }
  };

  return (
    <VoiceContext.Provider
      value={{
        currentChannelId,
        currentChannelName,
        participants,
        joined,
        loading,
        error,
        speakingUsers,
        locallyMutedUsers,
        micMuted,
        joinChannel,
        leaveChannel,
        toggleMicMute,
        toggleLocalMuteForUser,
        isMutedByModerator,
        muteRemainingText: getRemainingMuteText(),
      }}
    >
      {/* Hidden Audio Elements for remote streams */}
      {Array.from(remoteStreams.entries()).map(([userId, stream]) => (
        <audio
          key={userId}
          autoPlay
          ref={(audioEl) => {
            if (audioEl && audioEl.srcObject !== stream) {
              audioEl.srcObject = stream;
              audioEl.muted = Boolean(locallyMutedUsers[userId]);
              audioEl.play().catch(() => {});
            } else if (audioEl) {
               // Update mute state if ref exists and stream unchanged
               audioEl.muted = Boolean(locallyMutedUsers[userId]);
            }
          }}
        />
      ))}
      {children}
    </VoiceContext.Provider>
  );
}

export function useVoice() {
  const context = useContext(VoiceContext);
  if (context === undefined) {
    throw new Error("useVoice must be used within a VoiceProvider");
  }
  return context;
}
