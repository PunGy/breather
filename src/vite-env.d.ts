/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

type WebAudioSessionType =
  | "auto"
  | "playback"
  | "transient"
  | "transient-solo"
  | "ambient"
  | "play-and-record";

interface WebAudioSession extends EventTarget {
  type: WebAudioSessionType;
  readonly state: "inactive" | "active" | "interrupted";
}

interface Navigator {
  readonly audioSession?: WebAudioSession;
}
