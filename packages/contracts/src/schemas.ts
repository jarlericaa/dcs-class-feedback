import { z } from "zod";

// Authentication
export const GoogleAuthCallbackSchema = z.object({
  email: z.string().email(),
  name: z.string(),
  picture: z.string().url().optional(),
  googleId: z.string(),
});

// Course
export const CreateCourseSchema = z.object({
  title: z.string().min(1),
  code: z.string().min(1),
  semester: z.string().min(1),
  year: z.number().int().positive(),
  timezone: z.string().default("UTC"),
});

export const UpdateCourseSchema = CreateCourseSchema.partial();

// Roster
export const RosterEntrySchema = z.object({
  studentNumber: z.string(),
  familyName: z.string(),
  firstName: z.string(),
  livedName: z.string().optional(),
  preferredPronoun: z.string().optional(),
  program: z.string().optional(),
  enrollmentStatus: z.string(),
  enlistedDate: z.string().datetime().optional(),
});

export const ImportRosterSchema = z.object({
  courseId: z.string(),
  entries: z.array(RosterEntrySchema),
});

// Account Claim
export const RequestAccountClaimSchema = z.object({
  studentNumber: z.string(),
});

// Template
export const FormFieldSchema = z.object({
  id: z.string().uuid(),
  type: z.enum([
    "text",
    "textarea",
    "multiple_choice",
    "checkbox",
    "rating",
    "question",
    "comment",
  ]),
  label: z.string(),
  required: z.boolean().default(false),
  options: z.array(z.string()).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
});

export const CreateTemplateSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  fields: z.array(FormFieldSchema),
});

export const UpdateTemplateSchema = CreateTemplateSchema.partial();

// Schedule
export const CreateScheduleSchema = z.object({
  templateId: z.string(),
  title: z.string().min(1),
  description: z.string().optional(),
  schedule: z.string(),
  releaseTime: z.string().datetime(),
  deadline: z.string().datetime(),
  bonusPeriodId: z.string().optional(),
});

// Submission
export const SubmitFormSchema = z.object({
  formId: z.string(),
  responses: z.record(z.unknown()),
  questions: z.array(z.string()).optional(),
  comment: z.string().optional(),
});

// Question
export const AddQuestionSchema = z.object({
  submissionId: z.string(),
  question: z.string().min(1),
});

// Submission Validity
export const FlagSubmissionSchema = z.object({
  submissionId: z.string(),
  reason: z.string().min(1),
});

export const ConfirmValiditySchema = z.object({
  submissionId: z.string(),
  status: z.enum(["valid", "invalid"]),
  reason: z.string().optional(),
});

// Bonus Period
export const CreateBonusPeriodSchema = z.object({
  title: z.string().min(1),
  requiredCount: z.number().int().positive(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
});

// Backlog
export const CreateBacklogItemSchema = z.object({
  questionId: z.string(),
  topic: z.string().optional(),
  priority: z.number().int().default(0),
  assignedTo: z.string().optional(),
  targetDate: z.string().datetime().optional(),
});

export const UpdateBacklogItemSchema = CreateBacklogItemSchema.partial();

// Private Answer
export const SendPrivateAnswerSchema = z.object({
  questionId: z.string(),
  content: z.string().min(1),
});

// Public Q&A
export const PublishPublicAnswerSchema = z.object({
  questionIds: z.array(z.string()).min(1),
  displayedQuestion: z.string().min(1),
  answer: z.string().min(1),
  topic: z.string().optional(),
  draftStatus: z.enum(["draft", "awaiting_approval"]).default("draft"),
});

export const ApprovePublicAnswerSchema = z.object({
  entryId: z.string(),
  approved: z.boolean(),
});

// Pagination
export const PaginationSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(10),
});
