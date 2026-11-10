import { Module } from '@nestjs/common';

import { AssessmentAdminController } from './assessment-admin.controller';
import { AssessmentAdminService } from './assessment-admin.service';
import { AssessmentLearnerController } from './assessment-learner.controller';
import { AssessmentLearnerService } from './assessment-learner.service';
import { LearningModule } from '../learning/learning.module';

@Module({
  imports: [LearningModule],
  controllers: [AssessmentAdminController, AssessmentLearnerController],
  providers: [AssessmentAdminService, AssessmentLearnerService],
})
export class AssessmentModule {}
