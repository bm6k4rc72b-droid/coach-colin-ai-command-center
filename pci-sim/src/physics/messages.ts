export type MsgLevel = 'info' | 'ok' | 'warn' | 'danger';

export interface Msg {
  level: MsgLevel;
  text: string;
}
