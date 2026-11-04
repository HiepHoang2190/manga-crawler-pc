const connectors = require('../../platform/connectors');
const tester = require('../../platform/connectors/tester');

describe('connectors.testConnector wrapper', () => {
  it('returns the same unknown-id error as the engine', async () => {
    const wrapped_result = await connectors.testConnector('non-existent-site');
    const engine_result = await tester.runConnectorTest('non-existent-site');
    expect(wrapped_result).toEqual(engine_result);
    expect(wrapped_result.ok).toBe(false);
    expect(wrapped_result.error).toContain('không tồn tại');
    expect(wrapped_result.steps).toEqual({});
  });
});
