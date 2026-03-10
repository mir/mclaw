export interface SessionStartedEvent {
  type: 'session_started';
  sessionId: string;
}

export interface AssistantTextEvent {
  type: 'assistant_text';
  text: string;
}

export interface ProgressEvent {
  type: 'progress';
  stage: 'session' | 'tool' | 'task';
  message: string;
}

export interface TurnCompleteEvent {
  type: 'turn_complete';
  result: string | null;
}

export interface ErrorEvent {
  type: 'error';
  error: string;
}

export type ContainerStreamEvent =
  | SessionStartedEvent
  | AssistantTextEvent
  | ProgressEvent
  | TurnCompleteEvent
  | ErrorEvent;
