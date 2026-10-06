import { z } from 'zod';

export const AgentTypeSchema       = z.enum(['OSINT4ALL', 'CloudSINT', 'HybridCore']);
export const NodeStatusSchema      = z.enum(['active', 'degraded', 'offline']);
export const ExecutionStatusSchema = z.enum(['SUCCESS', 'FAILED', 'TIMEOUT']);
export const AssetSourceSchema     = z.enum(['script', 'stylesheet', 'unknown']);
export const LogLevelSchema        = z.enum(['info', 'warn', 'error', 'success', 'debug']);

export const PermissionSchema = z.enum([
  'aimap:read', 'aimap:route', 'agent:execute', 'osint:query', 'audit:purge',
]);

export const AuditEventSchema = z.enum([
  'user.registered',
  'user.login',
  'user.login_failed',
  'user.logout',
  'session.issued',
  'session.refreshed',
  'session.revoked',
  'session.refresh_reuse_detected',
  'ratelimit.blocked',
  'pipeline.critical_failure',
  'audit.purge_triggered',
  'audit.worm_exported',
]);

export const AIMapNodeSchema = z.object({
  nodeId:    z.string().min(1),
  endpoint:  z.string().url(),
  agentType: AgentTypeSchema,
  status:    NodeStatusSchema,
  latencyMs: z.number().int().nonnegative(),
});

export const VoidSessionTokenSchema = z.object({
  accessToken: z.string().regex(/^va_live_[A-Za-z0-9._-]+$/),
  expiresIn:   z.number().int().positive(),
  issuedAt:    z.number().int().positive(),
  permissions: z.array(PermissionSchema).min(1),
  subject:     z.string().min(1),
});

export const ExecutionResultSchema = z.object({
  nodeId:     z.string(),
  agent:      AgentTypeSchema,
  status:     ExecutionStatusSchema,
  payload:    z.record(z.unknown()),
  timestamp:  z.string().datetime(),
  durationMs: z.number().nonnegative(),
});

export const NodeExecutionResponseSchema = z.object({
  ok:      z.boolean(),
  payload: z.record(z.unknown()),
}).strict();

// ─── Auth ────────────────────────────────────────────────────
export const PasswordSchema = z
  .string()
  .min(12, 'mínimo 12 caracteres')
  .max(128)
  .refine((s) => /[A-Z]/.test(s),      'precisa de maiúscula')
  .refine((s) => /[a-z]/.test(s),      'precisa de minúscula')
  .refine((s) => /[0-9]/.test(s),      'precisa de dígito')
  .refine((s) => /[^A-Za-z0-9]/.test(s), 'precisa de símbolo');

export const RegisterRequestSchema = z.object({
  firstName:      z.string().min(1).max(64),
  lastName:       z.string().min(1).max(64),
  email:          z.string().email().max(254),
  organization:   z.string().min(2).max(128),
  password:       PasswordSchema,
  turnstileToken: z.string().min(1),
}).strict();

export const LoginRequestSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1).max(128),
}).strict();

export const PublicUserSchema = z.object({
  id:           z.string().uuid(),
  email:        z.string().email(),
  firstName:    z.string(),
  lastName:     z.string(),
  organization: z.string(),
  createdAt:    z.number().int(),
});

export const AssetFailureSchema = z.object({
  url:    z.string(),
  source: AssetSourceSchema,
  time:   z.string(),
  detail: z.string().optional(),
});

export const LogEntrySchema = z.object({
  id: z.number().int(), level: LogLevelSchema,
  scope: z.string(), message: z.string(),
  time: z.string(), formatted: z.string(),
});

export type AgentType        = z.infer<typeof AgentTypeSchema>;
export type NodeStatus       = z.infer<typeof NodeStatusSchema>;
export type ExecutionStatus  = z.infer<typeof ExecutionStatusSchema>;
export type AssetSource      = z.infer<typeof AssetSourceSchema>;
export type LogLevel         = z.infer<typeof LogLevelSchema>;
export type Permission       = z.infer<typeof PermissionSchema>;
export type AuditEvent       = z.infer<typeof AuditEventSchema>;
export type AIMapNode        = z.infer<typeof AIMapNodeSchema>;
export type VoidSessionToken = z.infer<typeof VoidSessionTokenSchema>;
export type ExecutionResult  = z.infer<typeof ExecutionResultSchema>;
export type RegisterRequest  = z.infer<typeof RegisterRequestSchema>;
export type LoginRequest     = z.infer<typeof LoginRequestSchema>;
export type PublicUser       = z.infer<typeof PublicUserSchema>;
export type AssetFailure     = z.infer<typeof AssetFailureSchema>;
export type LogEntry         = z.infer<typeof LogEntrySchema>;
