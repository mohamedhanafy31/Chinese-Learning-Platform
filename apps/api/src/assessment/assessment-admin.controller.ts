import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseInterceptors,
} from '@nestjs/common';
import {
  Role,
  type AdminQuestion,
  type AdminQuizDetail,
  type AdminQuizSummary,
  type AdminQuizzesResponse,
  type PublicUser,
} from '@app/shared';

import { AssessmentAdminService } from './assessment-admin.service';
import {
  CreateQuizDto,
  QuestionDto,
  QuizReorderDto,
  UpdateQuizDto,
} from './assessment.dto';
import {
  ADMIN_CACHE_CONTROL,
  CacheControlInterceptor,
} from '../catalog/cache-control.interceptor';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';

const uuid = () => new ParseUUIDPipe();

@Controller('admin')
@Roles(Role.ADMIN)
@UseInterceptors(new CacheControlInterceptor(ADMIN_CACHE_CONTROL))
export class AssessmentAdminController {
  constructor(
    @Inject(AssessmentAdminService)
    private readonly assessment: AssessmentAdminService,
  ) {}

  @Get('lessons/:lessonId/quizzes')
  list(
    @Param('lessonId', uuid()) lessonId: string,
  ): Promise<AdminQuizzesResponse> {
    return this.assessment.listQuizzes(lessonId);
  }

  @Post('lessons/:lessonId/quizzes')
  create(
    @Param('lessonId', uuid()) lessonId: string,
    @Body(new ZodValidationPipe(CreateQuizDto.schema)) input: CreateQuizDto,
    @CurrentUser() admin: PublicUser,
  ): Promise<AdminQuizSummary> {
    return this.assessment.createQuiz(lessonId, input, admin.id);
  }

  @Put('lessons/:lessonId/quizzes/order')
  reorder(
    @Param('lessonId', uuid()) lessonId: string,
    @Body(new ZodValidationPipe(QuizReorderDto.schema)) input: QuizReorderDto,
    @CurrentUser() admin: PublicUser,
  ): Promise<AdminQuizzesResponse> {
    return this.assessment.reorderQuizzes(lessonId, input.ids, admin.id);
  }

  @Get('quizzes/:id')
  get(@Param('id', uuid()) id: string): Promise<AdminQuizDetail> {
    return this.assessment.getQuiz(id);
  }

  @Patch('quizzes/:id')
  update(
    @Param('id', uuid()) id: string,
    @Body(new ZodValidationPipe(UpdateQuizDto.schema)) input: UpdateQuizDto,
    @CurrentUser() admin: PublicUser,
  ): Promise<AdminQuizSummary> {
    return this.assessment.updateQuiz(id, input, admin.id);
  }

  @Post('quizzes/:id/archive')
  @HttpCode(HttpStatus.OK)
  archive(
    @Param('id', uuid()) id: string,
    @CurrentUser() admin: PublicUser,
  ): Promise<AdminQuizSummary> {
    return this.assessment.archiveQuiz(id, admin.id);
  }

  @Post('quizzes/:id/restore')
  @HttpCode(HttpStatus.OK)
  restore(
    @Param('id', uuid()) id: string,
    @CurrentUser() admin: PublicUser,
  ): Promise<AdminQuizSummary> {
    return this.assessment.restoreQuiz(id, admin.id);
  }

  @Delete('quizzes/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id', uuid()) id: string,
    @CurrentUser() admin: PublicUser,
  ): Promise<void> {
    return this.assessment.deleteQuiz(id, admin.id);
  }

  @Post('quizzes/:id/questions')
  createQuestion(
    @Param('id', uuid()) id: string,
    @Body(new ZodValidationPipe(QuestionDto.schema)) input: QuestionDto,
    @CurrentUser() admin: PublicUser,
  ): Promise<AdminQuestion> {
    return this.assessment.createQuestion(id, input, admin.id);
  }

  @Put('quizzes/:id/questions/order')
  reorderQuestions(
    @Param('id', uuid()) id: string,
    @Body(new ZodValidationPipe(QuizReorderDto.schema)) input: QuizReorderDto,
    @CurrentUser() admin: PublicUser,
  ): Promise<AdminQuizDetail> {
    return this.assessment.reorderQuestions(id, input.ids, admin.id);
  }

  @Put('questions/:id')
  replaceQuestion(
    @Param('id', uuid()) id: string,
    @Body(new ZodValidationPipe(QuestionDto.schema)) input: QuestionDto,
    @CurrentUser() admin: PublicUser,
  ): Promise<AdminQuestion> {
    return this.assessment.replaceQuestion(id, input, admin.id);
  }

  @Delete('questions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeQuestion(
    @Param('id', uuid()) id: string,
    @CurrentUser() admin: PublicUser,
  ): Promise<void> {
    return this.assessment.deleteQuestion(id, admin.id);
  }
}
