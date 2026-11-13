import fs from 'node:fs';
import path from 'node:path';
import parser from '@babel/parser';
import traversePkg from '@babel/traverse';

const traverse = traversePkg.default || traversePkg;

describe('WorkflowInspector i18n and t scope validation', () => {
  const inspectorPath = path.resolve(process.cwd(), 'src/features/workflow/components/WorkflowInspector.jsx');

  test('FolderPickerInput declares and defines t from useI18n', () => {
    const code = fs.readFileSync(inspectorPath, 'utf8');
    const funcMatch = code.match(/function FolderPickerInput\([\s\S]*?\)\s*\{([\s\S]*?)return/);
    expect(funcMatch).not.toBeNull();
    const funcBody = funcMatch[1];
    expect(funcBody).toContain('useI18n()');
  });

  test('WorkflowInspector has zero undefined references to t', () => {
    const code = fs.readFileSync(inspectorPath, 'utf8');
    const ast = parser.parse(code, {
      sourceType: 'module',
      plugins: ['jsx'],
    });

    const undefinedTReferences = [];
    traverse(ast, {
      Identifier(astPath) {
        if (astPath.node.name === 't' && astPath.isReferencedIdentifier()) {
          const binding = astPath.scope.getBinding('t');
          if (!binding) {
            undefinedTReferences.push({
              line: astPath.node.loc?.start?.line,
              col: astPath.node.loc?.start?.column,
            });
          }
        }
      },
    });

    expect(undefinedTReferences).toEqual([]);
  });

  test('complies with UI standards: no native title and no underline', () => {
    const code = fs.readFileSync(inspectorPath, 'utf8');
    expect(code).not.toMatch(/<button[^>]*?\btitle\s*=/);
    expect(code).not.toMatch(/\bhover:underline\b/);
    expect(code).not.toMatch(/\bunderline\b/);
  });
});

