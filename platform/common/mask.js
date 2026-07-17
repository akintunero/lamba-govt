'use strict';

function maskPII(value, visibleStart = 2, visibleEnd = 4) {
  if (!value || typeof value !== 'string') return value;
  if (value.length <= visibleStart + visibleEnd) return value;
  const start = value.slice(0, visibleStart);
  const end = value.slice(-visibleEnd);
  const masked = '*'.repeat(Math.min(value.length - visibleStart - visibleEnd, 10));
  return `${start}${masked}${end}`;
}

function maskPassport(passport) {
  return maskPII(passport, 2, 4);
}

function maskNIN(nin) {
  return maskPII(nin, 2, 4);
}

function maskPhone(phone) {
  return maskPII(phone, 0, 4);
}

function maskEmail(email) {
  if (!email || !email.includes('@')) return email;
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

module.exports = { maskPII, maskPassport, maskNIN, maskPhone, maskEmail };
