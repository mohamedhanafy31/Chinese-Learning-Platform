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
  constructor(private readonly schema?: ZodType) {}

  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    const schema =
      this.schema ??
      (hasZodSchema(metadata.metatype) ? metadata.metatype.schema : undefined);
    if (!schema) {
      return value;
    }

    const result = schema.safeParse(value);

    if (!result.success) {
      throw new BadRequestException({
        message: 'Validation failed',
        issues: result.error.issues,
      });
    }

    return result.data;
  }
}
