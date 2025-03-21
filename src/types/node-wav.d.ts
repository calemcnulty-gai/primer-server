declare module 'node-wav' {
  export function decode(buffer: Buffer): {
    sampleRate: number;
    channelData: Float32Array[];
  };
  
  export function encode(channelData: Float32Array[], options: {
    sampleRate: number;
    float?: boolean;
  }): Buffer;
} 