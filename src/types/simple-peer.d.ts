declare module 'simple-peer' {
  interface SimplePeerOptions {
    initiator?: boolean;
    channelConfig?: object;
    channelName?: string;
    config?: RTCConfiguration;
    offerOptions?: object;
    answerOptions?: object;
    sdpTransform?: (sdp: string) => string;
    stream?: MediaStream;
    streams?: MediaStream[];
    trickle?: boolean;
    allowHalfTrickle?: boolean;
    objectMode?: boolean;
    wrtc?: object;
  }

  interface SimplePeerData {
    type: string;
    sdp?: string;
    candidate?: RTCIceCandidate;
  }

  interface Instance extends NodeJS.EventEmitter {
    signal(data: SimplePeerData): void;
    send(data: string | Buffer): void;
    addStream(stream: MediaStream): void;
    removeStream(stream: MediaStream): void;
    addTrack(track: MediaStreamTrack, stream: MediaStream): void;
    removeTrack(track: MediaStreamTrack, stream: MediaStream): void;
    destroy(err?: Error): void;
    readonly connected: boolean;
    readonly destroyed: boolean;
    readonly _pc: RTCPeerConnection;
  }

  interface SimplePeerConstructor {
    new(opts?: SimplePeerOptions): Instance;
    (opts?: SimplePeerOptions): Instance;
  }

  const SimplePeer: SimplePeerConstructor;
  export = SimplePeer;
}

interface RTCConfiguration {
  iceServers?: Array<{urls: string | string[]}>;
  iceTransportPolicy?: string;
  bundlePolicy?: string;
  rtcpMuxPolicy?: string;
  sdpSemantics?: string;
}

interface RTCIceCandidate {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
} 