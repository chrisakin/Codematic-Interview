// utils/swagger.ts
import { validationMetadatasToSchemas } from 'class-validator-jsonschema';
import { getFromContainer, MetadataStorage } from 'class-validator';
import { SchemaObject } from 'openapi3-ts';

export function generateSchemasFromDTOs() {
  return validationMetadatasToSchemas({
    classTransformerMetadataStorage: (getFromContainer(MetadataStorage) as any),
  });
}

export function createRequestBodySchema(dto: any): { requestBody: any } {
  return {
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: { $ref: `#/components/schemas/${dto.name}` },
        },
      },
    },
  };
}
