import type { Role } from "@class-feedback/contracts";

export class PermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermissionError";
  }
}

export interface Permission {
  action: string;
  roles: Role[];
}

const permissions: Record<string, Permission> = {
  // Course
  "course:create": { action: "course:create", roles: ["instructor"] },
  "course:read": { action: "course:read", roles: ["instructor", "student_assistant", "student"] },
  "course:update": { action: "course:update", roles: ["instructor"] },
  "course:archive": { action: "course:archive", roles: ["instructor"] },

  // Roster
  "roster:import": { action: "roster:import", roles: ["instructor"] },
  "roster:read": { action: "roster:read", roles: ["instructor", "student_assistant"] },
  "roster:claim": { action: "roster:claim", roles: ["student"] },

  // Template
  "template:create": { action: "template:create", roles: ["instructor", "student_assistant"] },
  "template:read": { action: "template:read", roles: ["instructor", "student_assistant"] },
  "template:update": { action: "template:update", roles: ["instructor"] },

  // Form
  "form:read": { action: "form:read", roles: ["instructor", "student_assistant", "student"] },
  "form:submit": { action: "form:submit", roles: ["student"] },

  // Submission
  "submission:read_own": { action: "submission:read_own", roles: ["student"] },
  "submission:read_all": {
    action: "submission:read_all",
    roles: ["instructor", "student_assistant"],
  },
  "submission:invalidate": { action: "submission:invalidate", roles: ["instructor"] },
  "submission:flag": { action: "submission:flag", roles: ["student_assistant"] },

  // Question
  "question:read_own": { action: "question:read_own", roles: ["student"] },
  "question:read_all": { action: "question:read_all", roles: ["instructor", "student_assistant"] },
  "question:add": { action: "question:add", roles: ["student"] },

  // Backlog
  "backlog:read": { action: "backlog:read", roles: ["instructor", "student_assistant"] },
  "backlog:create": { action: "backlog:create", roles: ["instructor"] },
  "backlog:update": { action: "backlog:update", roles: ["instructor"] },
  "backlog:assign": { action: "backlog:assign", roles: ["instructor", "student_assistant"] },

  // Private Answer
  "private_answer:send": {
    action: "private_answer:send",
    roles: ["instructor", "student_assistant"],
  },
  "private_answer:read": {
    action: "private_answer:read",
    roles: ["instructor", "student_assistant"],
  },

  // Public Q&A
  "public_qa:create": {
    action: "public_qa:create",
    roles: ["instructor", "student_assistant"],
  },
  "public_qa:approve": { action: "public_qa:approve", roles: ["instructor"] },
  "public_qa:publish": { action: "public_qa:publish", roles: ["instructor"] },
  "public_qa:read": { action: "public_qa:read", roles: ["student"] },

  // Export
  "export:bonus": { action: "export:bonus", roles: ["instructor"] },
  "export:responses": { action: "export:responses", roles: ["instructor"] },

  // Audit
  "audit:read": { action: "audit:read", roles: ["instructor"] },

  // User Management
  "user:add_instructor": { action: "user:add_instructor", roles: ["instructor"] },
  "user:add_student_assistant": { action: "user:add_student_assistant", roles: ["instructor"] },
};

export function hasPermission(role: Role, action: string): boolean {
  const permission = permissions[action];
  if (!permission) {
    return false;
  }
  return permission.roles.includes(role);
}

export function requirePermission(role: Role, action: string): void {
  if (!hasPermission(role, action)) {
    throw new PermissionError(`User with role '${role}' cannot perform action '${action}'`);
  }
}

export function canPerform(role: Role, action: string): boolean {
  return hasPermission(role, action);
}

export { permissions };
