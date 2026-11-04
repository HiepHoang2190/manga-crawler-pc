'use strict';

const {
  setPluginConsoleSender,
  emitPluginConsole,
  formatPluginConsoleArgs,
} = require('../../plugins/pluginConsoleBridge');

describe('pluginConsoleBridge', () => {
  afterEach(() => {
    setPluginConsoleSender(null);
  });

  test('formatPluginConsoleArgs joins mixed types', () => {
    expect(formatPluginConsoleArgs(['x', 1, true])).toBe('x 1 true');
    expect(formatPluginConsoleArgs([{ a: 1 }])).toBe('{"a":1}');
  });

  test('emitPluginConsole invokes sender when set', () => {
    const received = [];
    setPluginConsoleSender((p) => received.push(p));
    emitPluginConsole('nettruyen', 'warn', ['hello', 2]);
    expect(received).toHaveLength(1);
    expect(received[0].pluginId).toBe('nettruyen');
    expect(received[0].level).toBe('warn');
    expect(received[0].line).toBe('hello 2');
    expect(typeof received[0].t).toBe('number');
  });

  test('emitPluginConsole no-ops when sender unset', () => {
    expect(() => emitPluginConsole('p', 'info', ['a'])).not.toThrow();
  });
});
