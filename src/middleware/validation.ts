import { Request, Response, NextFunction } from 'express';
import { validate } from 'class-validator';
import { plainToClass } from 'class-transformer';
import { AppError } from '@/utils/errors';

export const validateDto = (dtoClass: any, source: 'body' | 'query' | 'params' = 'body') => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dto = plainToClass(dtoClass, req[source]);
      const errors = await validate(dto);

      if (errors.length > 0) {
        const errorMessages = errors.map(error => {
          const constraints = error.constraints;
          return constraints ? Object.values(constraints).join(', ') : 'Validation error';
        });

        throw new AppError(`Validation failed: ${errorMessages.join('; ')}`, 400);
      }

      // Replace the request data with the validated DTO
      req[source] = dto;
      next();
    } catch (error) {
      next(error);
    }
  };
};