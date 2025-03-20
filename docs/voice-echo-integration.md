# Voice Echo Integration

This document describes the implementation of the voice echo service that integrates speech-to-text, LLM processing, and text-to-speech capabilities.

## Overview

The voice echo service processes audio from clients through a 3-step pipeline:

1. **Speech-to-Text**: Using Deepgram to convert user's voice to text
2. **LLM Processing**: Using Google's Gemini to process the transcribed text
3. **Text-to-Speech**: Using Cartesia to convert the LLM response back to audio

## Technical Components

### 1. Deepgram Integration (`DeepgramService.ts`)

The Deepgram service handles converting audio to text:

```typescript
// DeepgramService.ts
import axios from 'axios';

export class DeepgramService {
  private apiKey: string;
  private apiUrl: string;
  
  constructor() {
    this.apiKey = process.env.DEEPGRAM_API_KEY || '';
    this.apiUrl = 'https://api.deepgram.com/v1/listen';
  }
  
  async transcribeAudio(audioData: Buffer): Promise<string> {
    // Send audio to Deepgram for transcription using REST API
    const response = await axios.post(
      `${this.apiUrl}?model=nova-2&smart_format=true&language=en-US`,
      audioData,
      {
        headers: {
          'Authorization': `Token ${this.apiKey}`,
          'Content-Type': 'audio/webm',
        },
      }
    );
    
    return response.data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
  }
}
```

### 2. Gemini Integration (`GeminiService.ts`)

The Gemini service processes transcribed text:

```typescript
// GeminiService.ts
import { GoogleGenerativeAI } from '@google/generative-ai';

export class GeminiService {
  private genAI: GoogleGenerativeAI;
  private model: any;
  
  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
  }
  
  async processText(userInput: string): Promise<string> {
    const prompt = `User said: "${userInput}"
    
    For this echo service, respond briefly to what the user said. Keep your response under 30 words.`;
    
    const result = await this.model.generateContent(prompt);
    return result.response.text();
  }
}
```

### 3. Cartesia Integration (`CartesiaService.ts`)

The Cartesia service converts text to speech:

```typescript
// CartesiaService.ts
import axios from 'axios';

export class CartesiaService {
  private apiKey: string;
  private apiUrl: string;
  
  constructor() {
    this.apiKey = process.env.CARTESIA_API_KEY || '';
    this.apiUrl = process.env.CARTESIA_API_URL || 'https://api.cartesia.ai/v1/text-to-speech';
  }
  
  async textToSpeech(text: string): Promise<Buffer> {
    const requestData = {
      text,
      voice: 'en-US-Neural2-F',
      format: 'webm',
      speed: 1.0,
      pitch: 1.0
    };
    
    const response = await axios.post(this.apiUrl, requestData, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'audio/webm'
      },
      responseType: 'arraybuffer'
    });
    
    return Buffer.from(response.data);
  }
}
```

## Processing Pipeline

The voice service orchestrates these components in a pipeline:

1. Client sends audio data over WebSocket/WebRTC
2. Server buffers audio chunks until "stop-listening" signal
3. Server processes audio through the pipeline:
   - Transcribe audio using Deepgram
   - Process transcribed text with Gemini
   - Convert Gemini's response to audio using Cartesia
4. Server sends speaking-start notification
5. In a full WebRTC implementation, audio would be streamed back to client
6. Server sends speaking-end notification when done

## Configuration

Required environment variables:

```
DEEPGRAM_API_KEY=your_deepgram_api_key
GEMINI_API_KEY=your_gemini_api_key
CARTESIA_API_KEY=your_cartesia_api_key
CARTESIA_API_URL=https://api.cartesia.ai/v1/text-to-speech
```

## Testing the Echo Service

You can test the echo service using the WebSocket API:

1. Connect to the WebSocket endpoint at `/api/v1/voice`
2. Establish a WebRTC connection using the standard WebRTC signaling protocol
3. Send audio data to the server
4. Send a "stop-listening" message to process the audio
5. Receive the processed audio response

Example testing with `wscat` for signaling (audio would be sent over WebRTC):

```bash
# Connect to WebSocket
wscat -c wss://primer.calemcnulty.com/api/v1/voice

# Send WebRTC offer
{"type":"offer","sdp":{...}}

# Receive WebRTC answer
{"type":"answer","sdp":{...}}

# Exchange ICE candidates
{"type":"ice-candidate","candidate":{...}}

# Start listening
{"type":"start-listening"}

# WebRTC would stream audio here

# Stop listening and process audio
{"type":"stop-listening"}

# Receive speaking notifications
{"type":"speaking-start"}
{"type":"speaking-end"}
```

## Future Enhancements

1. **Full WebRTC Audio Implementation**: Currently the implementation has a mock for the actual WebRTC audio transmission
2. **Improved Prompt Engineering**: Refine the Gemini prompts for better responses
3. **Voice Customization**: Allow selecting different voices for the TTS response
4. **Conversation History**: Maintain conversation context between interactions
5. **Real-time Streaming Responses**: Process audio chunks in real-time rather than in batch