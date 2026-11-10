import {
  BadRequestException,
  Injectable,
  type ArgumentMetadata,
  type PipeTransform,
} from '@nestjs/common';
import type { ZodType } from 'zod';

interface ZodDtoConstructor {
  schema: ZodType;
}

function hasZodSchema(value: unknown): value is ZodDtoConstructor {
  return (
    typeof value === 'function' &&
    'schema' in value &&
    typeof value.schema === 'object'
  );
}

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    if (!hasZodSchema(metadata.metatype)) {
      return value;
    }

    const result = metadata.metatype.schema.safeParse(value);

    if (!result.success) {
      throw new BadRequestException({
        message: 'Validation failed',
        issues: result.error.issues,
      });
    }

    return result.data;
  }
}
