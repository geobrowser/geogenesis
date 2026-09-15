import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

// Execute the actual publication-to-analytics portion of the callback, mocking the proposal boundary.
const source = readFileSync('partials/review/review-changes.tsx', 'utf8');
const start = source.indexOf('    if (!activeSpace) return;', source.indexOf('const handleSubmit'));
const end = source.indexOf('    if (publishSucceeded && selectedBountyIds', start);
const callback = ts.transpileModule(`async function submit() {${source.slice(start, end)}}`, {
  compilerOptions: { target: ts.ScriptTarget.ES2020 },
}).outputText;

describe('publication outcome instrumentation', () => {
  for (const outcome of ['success', 'error', 'throw', 'noop', 'duplicate-callback']) {
    it(`records published_edit only after confirmed success: ${outcome}`, async () => {
      const publishedEdit = vi.fn();
      let complete: () => void = () => {};
      const context = vm.createContext({
        activeSpace: 'space',
        isReadyToPublish: true,
        setIsPublishing: vi.fn(),
        ID: { createEntityId: () => 'proposal' },
        valuesFromSpace: [],
        relationsFromSpace: [],
        proposalName: 'Test',
        canChoosePath: false,
        setProposals: vi.fn(),
        activeSpaceMetadata: { type: 'PERSONAL' },
        publishedEdit,
        makeProposal: vi.fn(
          options =>
            new Promise((resolve, reject) => {
              complete = () => {
                if (outcome === 'throw') reject(new Error('failed'));
                else {
                  if (outcome === 'success' || outcome === 'duplicate-callback') options.onSuccess();
                  if (outcome === 'error' || outcome === 'duplicate-callback') options.onError();
                  resolve(undefined);
                }
              };
            })
        ),
      });
      vm.runInContext(callback, context);
      const pending = vm.runInContext('submit()', context);
      expect(publishedEdit).not.toHaveBeenCalled();
      complete();
      await pending;
      expect(publishedEdit).toHaveBeenCalledTimes(outcome === 'success' || outcome === 'duplicate-callback' ? 1 : 0);
      if (outcome === 'success') expect(publishedEdit.mock.calls[0][0].operation_id).toBe('proposal');
    });
  }
});
