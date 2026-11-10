import { Module } from '@nestjs/common';

import { AdminStudentsController } from './admin-students.controller';
import { AdminStudentsService } from './admin-students.service';
import { ContentAccessPolicy } from './content-access.policy';
import { EnrollmentService } from './enrollment.service';
import { LearningReadService } from './learning-read.service';
import {
  LevelAccessController,
  MyLevelsController,
} from './learner.controller';

@Module({
  controllers: [
    AdminStudentsController,
    MyLevelsController,
    LevelAccessController,
  ],
  providers: [
    AdminStudentsService,
    ContentAccessPolicy,
    EnrollmentService,
    LearningReadService,
  ],
  exports: [ContentAccessPolicy, EnrollmentService],
})
export class LearningModule {}
