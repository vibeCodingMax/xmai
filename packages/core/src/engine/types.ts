export type AgentEventType =
  | 'thinking'
  | 'text'
  | 'tool_start'
  | 'tool_end'
  | 'hook_start'
  | 'hook_end'
  | 'write_preview'
  | 'git_diff'
  | 'approval_required'
  | 'approval_granted'
  | 'approval_denied'
  | 'error'
  | 'done'

export interface AgentEvent {
  type: AgentEventType
  data: Record<string, unknown>
}

export interface ToolStartEvent extends AgentEvent {
  type: 'tool_start'
  data: { toolName: string; input: Record<string, unknown> }
}

export interface ToolEndEvent extends AgentEvent {
  type: 'tool_end'
  data: { toolName: string; output: string; hookResults?: HookSummary[] }
}

export interface HookSummary {
  command: string
  passed: boolean
  output: string
}

export interface HookStartEvent extends AgentEvent {
  type: 'hook_start'
  data: { command: string; filePath?: string }
}

export interface HookEndEvent extends AgentEvent {
  type: 'hook_end'
  data: { command: string; passed: boolean; output: string }
}

export interface WritePreviewEvent extends AgentEvent {
  type: 'write_preview'
  data: { path: string; isNew: boolean; linesAdded: number; linesRemoved: number; diff: string }
}

export interface GitDiffEvent extends AgentEvent {
  type: 'git_diff'
  data: { diff: string; filesChanged: string[] }
}

export interface ApprovalRequiredEvent extends AgentEvent {
  type: 'approval_required'
  data: { toolName: string; input: Record<string, unknown>; reason: string }
}

export interface TextEvent extends AgentEvent {
  type: 'text'
  data: { text: string }
}

export interface DoneEvent extends AgentEvent {
  type: 'done'
  data: { summary: string; filesChanged: string[] }
}

export interface ErrorEvent extends AgentEvent {
  type: 'error'
  data: { message: string; recoverable: boolean }
}

export const APPROVAL_REQUIRED_TOOLS = [
  'bash_install',
  'delete_file',
  'move_file',
] as const

export type ApprovalRequiredTool = typeof APPROVAL_REQUIRED_TOOLS[number]
