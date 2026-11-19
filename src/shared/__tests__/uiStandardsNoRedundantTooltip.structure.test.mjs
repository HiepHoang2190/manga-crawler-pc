import fs from 'node:fs';
import path from 'node:path';

describe('UI Standards: Zero Redundant Tooltip', () => {
  const rootDir = process.cwd();
  const globalTooltipPath = path.resolve(rootDir, 'src/shared/ui/GlobalTooltip.jsx');
  const agentsRulePath = path.resolve(rootDir, 'AGENTS.md');
  const agentAgentsRulePath = path.resolve(rootDir, '.agent/AGENTS.md');

  test('GlobalTooltip.jsx implements built-in safeguard to suppress redundant tooltips matching visible button text', () => {
    expect(fs.existsSync(globalTooltipPath)).toBe(true);
    const content = fs.readFileSync(globalTooltipPath, 'utf8');
    expect(content).toContain('visibleText');
    expect(content).toContain('clone.querySelectorAll');
    expect(content).toMatch(/visibleText\.toLowerCase\(\)\s*===\s*trimmed\.toLowerCase\(\)/);
  });

  test('AGENTS.md and .agent/AGENTS.md document rule prohibiting redundant tooltips that match button label', () => {
    if (fs.existsSync(agentsRulePath)) {
      const content = fs.readFileSync(agentsRulePath, 'utf8');
      expect(content).toContain('CẤM HIỂN THỊ TOOLTIP TRÙNG LẶP VỚI TÊN/TEXT CỦA BUTTON');
    }
    if (fs.existsSync(agentAgentsRulePath)) {
      const content = fs.readFileSync(agentAgentsRulePath, 'utf8');
      expect(content).toContain('CẤM HIỂN THỊ TOOLTIP TRÙNG LẶP VỚI TÊN/TEXT CỦA BUTTON');
    }
  });
});
