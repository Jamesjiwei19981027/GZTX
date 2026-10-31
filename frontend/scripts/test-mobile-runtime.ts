import assert from 'node:assert/strict';
import { parseNativeRuntime, getBrowserDefaultRuntime } from '../src/mobile/runtime/nativeBridge';
import { NativeRuntime } from '../src/mobile/runtime/runtimeTypes';

console.log('--- Testing parseNativeRuntime invalid and edge cases ---');

// 1. Primitive and non-object inputs
assert.equal(parseNativeRuntime(null), null, 'null input should return null');
assert.equal(parseNativeRuntime(undefined), null, 'undefined input should return null');
assert.equal(parseNativeRuntime(''), null, 'empty string should return null');
assert.equal(parseNativeRuntime(123), null, 'number should return null');
assert.equal(parseNativeRuntime(true), null, 'boolean should return null');
assert.equal(parseNativeRuntime([]), null, 'array should return null');
assert.equal(parseNativeRuntime({}), null, 'empty object should return null');

// 2. Version mismatch
assert.equal(parseNativeRuntime({ v: 999 }), null, 'unsupported version 999 should return null');
assert.equal(parseNativeRuntime({ v: 2 }), null, 'unsupported version 2 should return null');
assert.equal(parseNativeRuntime({ v: 0 }), null, 'unsupported version 0 should return null');
assert.equal(parseNativeRuntime({ v: '1' }), null, 'string version should return null');

// 3. Platform invalid
assert.equal(parseNativeRuntime({ v: 1, platform: 'unknown' }), null, 'unknown platform should return null');
assert.equal(parseNativeRuntime({ v: 1, platform: 'windows' }), null, 'windows platform should return null');
assert.equal(parseNativeRuntime({ v: 1, platform: 'macos' }), null, 'macos platform should return null');

// 4. Incomplete or invalid schema fields
const baseValid: NativeRuntime = {
  v: 1,
  platform: 'ios',
  surface: 'app',
  colorScheme: 'light',
  textSizes: {
    body: 17,
    caption: 13,
    navTitle: 17,
    displayTitle: 28,
  },
  safeAreaOwner: 'native',
  reduceMotion: false,
  reduceTransparency: false,
  capabilities: {
    haptics: true,
    nativeBack: true,
  },
};

// Test valid
const parsed = parseNativeRuntime(baseValid);
assert.notEqual(parsed, null, 'baseValid should parse successfully');
assert.equal(parsed?.v, 1);
assert.equal(parsed?.platform, 'ios');
assert.equal(parsed?.surface, 'app');
assert.equal(parsed?.safeAreaOwner, 'native');
assert.equal(parsed?.textSizes.body, 17);
assert.equal(parsed?.capabilities.haptics, true);
assert.equal(parseNativeRuntime({ ...baseValid, keyboardInset: 312 })?.keyboardInset, 312);
assert.equal(parseNativeRuntime({ ...baseValid, keyboardInset: 0 })?.keyboardInset, 0);
for (const keyboardInset of [-1, Infinity, NaN, '312']) {
  assert.equal(parseNativeRuntime({ ...baseValid, keyboardInset }), null, 'invalid keyboard inset must not alter layout');
}

// Test surface invalid
assert.equal(parseNativeRuntime({ ...baseValid, surface: 'electron' }), null, 'invalid surface');

// Test colorScheme invalid
assert.equal(parseNativeRuntime({ ...baseValid, colorScheme: 'auto' }), null, 'invalid colorScheme');

// Test safeAreaOwner invalid
assert.equal(parseNativeRuntime({ ...baseValid, safeAreaOwner: 'both' }), null, 'invalid safeAreaOwner');

// Test reduceMotion invalid
assert.equal(parseNativeRuntime({ ...baseValid, reduceMotion: 'no' }), null, 'non-boolean reduceMotion');
assert.equal(parseNativeRuntime({ ...baseValid, reduceTransparency: 0 }), null, 'non-boolean reduceTransparency');

// 5. Test textSizes boundaries
assert.equal(parseNativeRuntime({ ...baseValid, textSizes: null }), null, 'null textSizes');
assert.equal(
  parseNativeRuntime({
    ...baseValid,
    textSizes: { body: -1, caption: 13, navTitle: 17, displayTitle: 28 },
  }),
  null,
  'negative body size should fail',
);
assert.equal(
  parseNativeRuntime({
    ...baseValid,
    textSizes: { body: 0, caption: 13, navTitle: 17, displayTitle: 28 },
  }),
  null,
  'zero body size should fail',
);
assert.equal(
  parseNativeRuntime({
    ...baseValid,
    textSizes: { body: Number.NaN, caption: 13, navTitle: 17, displayTitle: 28 },
  }),
  null,
  'NaN body size should fail',
);
assert.equal(
  parseNativeRuntime({
    ...baseValid,
    textSizes: { body: Number.POSITIVE_INFINITY, caption: 13, navTitle: 17, displayTitle: 28 },
  }),
  null,
  'Infinity body size should fail',
);
assert.equal(
  parseNativeRuntime({
    ...baseValid,
    textSizes: { body: '17', caption: 13, navTitle: 17, displayTitle: 28 },
  }),
  null,
  'string body size should fail',
);
assert.equal(
  parseNativeRuntime({
    ...baseValid,
    textSizes: { body: 17, caption: 13, navTitle: 17 } as unknown as Record<string, number>,
  }),
  null,
  'missing displayTitle should fail',
);

// 6. Test capabilities boundaries
assert.equal(parseNativeRuntime({ ...baseValid, capabilities: null }), null, 'null capabilities');
assert.equal(
  parseNativeRuntime({
    ...baseValid,
    capabilities: { haptics: 'true', nativeBack: true },
  }),
  null,
  'string haptics should fail',
);
assert.equal(
  parseNativeRuntime({
    ...baseValid,
    capabilities: { haptics: true } as unknown as { haptics: boolean; nativeBack: boolean },
  }),
  null,
  'missing nativeBack should fail',
);

// 7. Extra property stripping/safety
const withExtra = {
  ...baseValid,
  extraField: 'should-not-pollute',
};
const parsedExtra = parseNativeRuntime(withExtra);
assert.notEqual(parsedExtra, null);
assert.equal('extraField' in (parsedExtra as object), false, 'extra fields should not be returned');

// 8. Test getBrowserDefaultRuntime
const defaultRuntime = getBrowserDefaultRuntime();
assert.equal(defaultRuntime.v, 1);
assert.ok(['web', 'android', 'ios'].includes(defaultRuntime.platform));
assert.ok(['browser', 'app'].includes(defaultRuntime.surface));
assert.ok(defaultRuntime.textSizes.body > 0);
assert.ok(defaultRuntime.textSizes.caption > 0);
assert.ok(defaultRuntime.textSizes.navTitle > 0);
assert.ok(defaultRuntime.textSizes.displayTitle > 0);
assert.ok(['native', 'web'].includes(defaultRuntime.safeAreaOwner));

console.log('All 26 parseNativeRuntime and getBrowserDefaultRuntime test assertions PASSED!');
