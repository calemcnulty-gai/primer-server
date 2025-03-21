interface MediaStream {
  id: string;
  active: boolean;
  addTrack(track: MediaStreamTrack): void;
  removeTrack(track: MediaStreamTrack): void;
  getTracks(): MediaStreamTrack[];
  getAudioTracks(): MediaStreamTrack[];
  getVideoTracks(): MediaStreamTrack[];
  clone(): MediaStream;
}

interface MediaStreamTrack {
  enabled: boolean;
  id: string;
  kind: string;
  label: string;
  muted: boolean;
  readyState: string;
  clone(): MediaStreamTrack;
  stop(): void;
} 