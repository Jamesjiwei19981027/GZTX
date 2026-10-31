import assert from 'node:assert/strict';
import {
  createChannelSummary,
  createConversationSummary,
  createCallSession,
  endCallSession,
  uploadCallRecording,
  transcribeCallSession,
  summarizeCallSession,
} from '../src/api/shell';

for (const fn of [
  createChannelSummary,
  createConversationSummary,
  createCallSession,
  endCallSession,
  uploadCallRecording,
  transcribeCallSession,
  summarizeCallSession,
]) assert.equal(typeof fn, 'function');

assert.equal(typeof createCallSession, 'function');
console.log('Communication API contract assertions PASSED');
