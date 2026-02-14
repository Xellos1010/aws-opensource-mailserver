export class CmsError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly detail?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    statusCode = 400,
    detail?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'CmsError';
    this.code = code;
    this.statusCode = statusCode;
    this.detail = detail;
  }
}

export class AuthError extends CmsError {
  constructor(message = 'Unauthorized') {
    super('UNAUTHORIZED', message, 401);
    this.name = 'AuthError';
  }
}

export class ForbiddenError extends CmsError {
  constructor(message = 'Forbidden') {
    super('FORBIDDEN', message, 403);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends CmsError {
  constructor(entity: string, id?: string) {
    super(
      'NOT_FOUND',
      id ? `${entity} not found: ${id}` : `${entity} not found`,
      404,
      id ? { entity, id } : { entity }
    );
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends CmsError {
  constructor(message: string, detail?: Record<string, unknown>) {
    super('VALIDATION_ERROR', message, 400, detail);
    this.name = 'ValidationError';
  }
}

export class PolicyBlockedError extends CmsError {
  constructor(message: string, detail: Record<string, unknown>) {
    super('POLICY_BLOCKED', message, 403, detail);
    this.name = 'PolicyBlockedError';
  }
}
