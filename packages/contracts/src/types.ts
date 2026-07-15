export type Role = "instructor" | "student_assistant" | "student";

export type SubmissionStatus = "draft" | "submitted" | "locked";

export type SubmissionValidity = "valid" | "flagged" | "invalid";

export type StudentQuestionInternalStatus = "pending" | "answered" | "will_not_answer";

export type StudentQuestionVisibleStatus = "received" | "answered_privately" | "answered_publicly";

export type BacklogItemStatus =
  "recommended" | "confirmed" | "assigned" | "drafting" | "awaiting_approval" | "answered";

export type PublicQAStatus = "draft" | "awaiting_approval" | "published" | "unpublished";

export type FormInstanceStatus = "scheduled" | "open" | "closed" | "archived";

export type AccountClaimStatus = "pending" | "linked" | "rejected";

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  picture?: string;
}

export interface CourseContext {
  courseId: string;
  userId: string;
  role: Role;
}

export interface FormField {
  id: string;
  type: "text" | "textarea" | "multiple_choice" | "checkbox" | "rating" | "question" | "comment";
  label: string;
  required: boolean;
  options?: string[];
  min?: number;
  max?: number;
}

export interface FormResponse {
  [fieldId: string]: unknown;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}
