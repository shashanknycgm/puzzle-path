/** Module-level flag so the puzzle list knows generation is in progress. */
let _generating = false;

export const generationState = {
  get isGenerating() { return _generating; },
  set isGenerating(v: boolean) { _generating = v; },
};
