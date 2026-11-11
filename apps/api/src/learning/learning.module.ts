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
import { ProgressController } from '../progress/progress.controller';
import { ProgressService } from '../progress/progress.service';

@Module({
  controllers: [
    AdminStudentsController,
    MyLevelsController,
    LevelAccessController,
    ProgressController,
  ],
  providers: [
    AdminStudentsService,
    ContentAccessPolicy,
    EnrollmentService,
    LearningReadService,
    ProgressService,
  ],
  exports: [ContentAccessPolicy, EnrollmentService, ProgressService],
})
export class LearningModule {}
