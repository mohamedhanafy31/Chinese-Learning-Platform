import {
  createQuizRequestSchema,
  questionRequestSchema,
  reorderRequestSchema,
  submitAttemptRequestSchema,
  updateQuizRequestSchema,
  type CreateQuizRequest,
  type QuestionRequest,
  type ReorderRequest,
  type SubmitAttemptRequest,
  type UpdateQuizRequest,
} from '@app/shared';

export class CreateQuizDto implements CreateQuizRequest {
  static readonly schema = createQuizRequestSchema;

  declare title: CreateQuizRequest['title'];
  declare description: CreateQuizRequest['description'];
  declare passingScore: CreateQuizRequest['passingScore'];
}

export class UpdateQuizDto implements UpdateQuizRequest {
  static readonly schema = updateQuizRequestSchema;

  declare title?: UpdateQuizRequest['title'];
  declare description?: UpdateQuizRequest['description'];
  declare passingScore?: UpdateQuizRequest['passingScore'];
}

export class QuestionDto implements QuestionRequest {
  static readonly schema = questionRequestSchema;

  declare type: QuestionRequest['type'];
  declare prompt: QuestionRequest['prompt'];
  declare hanzi: QuestionRequest['hanzi'];
  declare imageId: QuestionRequest['imageId'];
  declare explanation: QuestionRequest['explanation'];
  declare points: QuestionRequest['points'];
  declare options: QuestionRequest['options'];
  declare correctAnswer: QuestionRequest['correctAnswer'];
}

export class QuizReorderDto implements ReorderRequest {
  static readonly schema = reorderRequestSchema;

  declare ids: ReorderRequest['ids'];
}

export class SubmitAttemptDto implements SubmitAttemptRequest {
  static readonly schema = submitAttemptRequestSchema;

  declare answers: SubmitAttemptRequest['answers'];
}
