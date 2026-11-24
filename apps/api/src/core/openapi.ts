import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
  OpenApiGeneratorV31,
} from '@asteasolutions/zod-to-openapi';
import {
  changePasswordRequestSchema,
  createStaffSchema,
  healthResponseSchema,
  loginRequestSchema,
  problemSchema,
  staffDtoSchema,
  tokenResponseSchema,
  updateStaffSchema,
} from '@shifo/contracts';
import { z } from 'zod';

extendZodWithOpenApi(z);

const json = <T extends z.ZodType>(schema: T) => ({ content: { 'application/json': { schema } } });
const problem = { description: 'Problem details', ...json(problemSchema) };

export function buildOpenApiDocument(): object {
  const registry = new OpenAPIRegistry();
  const bearer = registry.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
  });
  const secured = [{ [bearer.name]: [] }];

  registry.registerPath({
    method: 'get',
    path: '/api/v1/health',
    responses: { 200: { description: 'Service health', ...json(healthResponseSchema) } },
  });
  registry.registerPath({
    method: 'post',
    path: '/api/v1/auth/login',
    request: { body: json(loginRequestSchema) },
    responses: { 200: { description: 'Tokens', ...json(tokenResponseSchema) }, 401: problem },
  });
  registry.registerPath({
    method: 'post',
    path: '/api/v1/auth/refresh',
    description: 'Rotates the httpOnly refresh cookie.',
    responses: { 200: { description: 'Tokens', ...json(tokenResponseSchema) }, 401: problem },
  });
  registry.registerPath({
    method: 'post',
    path: '/api/v1/auth/change-password',
    security: secured,
    request: { body: json(changePasswordRequestSchema) },
    responses: { 200: { description: 'Tokens', ...json(tokenResponseSchema) }, 422: problem },
  });
  registry.registerPath({
    method: 'get',
    path: '/api/v1/staff',
    security: secured,
    responses: {
      200: {
        description: 'Staff page',
        ...json(z.object({ items: z.array(staffDtoSchema), nextCursor: z.string().nullable() })),
      },
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/api/v1/staff',
    security: secured,
    request: { body: json(createStaffSchema) },
    responses: { 201: { description: 'Created', ...json(staffDtoSchema) }, 422: problem },
  });
  registry.registerPath({
    method: 'patch',
    path: '/api/v1/staff/{id}',
    security: secured,
    request: { params: z.object({ id: z.uuid() }), body: json(updateStaffSchema) },
    responses: { 200: { description: 'Updated', ...json(staffDtoSchema) }, 409: problem },
  });

  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: { title: 'Shifo API', version: '0.1.0' },
  });
}
