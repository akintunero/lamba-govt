'use strict';

/** @typedef {import('express').Response} Response */

const ERROR_CODES = {
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE'
};

/**
 * @param {Response} res
 * @param {number} status
 * @param {string} error
 * @param {string} [code]
 * @param {string} [detail]
 */
function sendError(res, status, error, code, detail) {
  const body = { error };
  if (code) body.code = code;
  if (detail) body.detail = detail;
  return res.status(status).json(body);
}

/**
 * @param {Response} res
 * @param {string} [detail]
 */
function badRequest(res, detail) {
  return sendError(res, 400, 'Bad request', ERROR_CODES.BAD_REQUEST, detail);
}

/**
 * @param {Response} res
 * @param {string} [detail]
 */
function unauthorized(res, detail) {
  return sendError(res, 401, 'Authentication required', ERROR_CODES.UNAUTHORIZED, detail);
}

/**
 * @param {Response} res
 * @param {string} [detail]
 */
function forbidden(res, detail) {
  return sendError(res, 403, 'Insufficient privileges', ERROR_CODES.FORBIDDEN, detail);
}

/**
 * @param {Response} res
 * @param {string} [detail]
 */
function notFound(res, detail) {
  return sendError(res, 404, 'Resource not found', ERROR_CODES.NOT_FOUND, detail);
}

/**
 * @param {Response} res
 * @param {string} [detail]
 */
function conflict(res, detail) {
  return sendError(res, 409, 'Resource conflict', ERROR_CODES.CONFLICT, detail);
}

/**
 * @param {Response} res
 * @param {string} [detail]
 */
function validationError(res, detail) {
  return sendError(res, 422, 'Validation failed', ERROR_CODES.VALIDATION_ERROR, detail);
}

/**
 * @param {Response} res
 * @param {string} [detail]
 */
function internalError(res, detail) {
  return sendError(res, 500, 'Internal server error', ERROR_CODES.INTERNAL_ERROR, detail);
}

module.exports = {
  ERROR_CODES,
  sendError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  validationError,
  internalError
};
