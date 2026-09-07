import type { HanjaCandidate } from './hanja-dictionary.ts';

export type AddCardField = 'reading' | 'meaning';

export interface AddCardAutofillState {
  protected: Record<AddCardField, boolean>;
  dirty: Record<AddCardField, boolean>;
  autoFilled: Record<AddCardField, boolean>;
}

export function codePointLength(value: string): number {
  return [...value].length;
}

export function isSingleHanja(value: string): boolean {
  return codePointLength(value.trim()) === 1 && /^\p{Script=Han}$/u.test(value.trim());
}

export function createAutofillState(initial: Record<AddCardField, string>): AddCardAutofillState {
  return {
    protected: {
      reading: initial.reading.trim().length > 0,
      meaning: initial.meaning.trim().length > 0,
    },
    dirty: { reading: false, meaning: false },
    autoFilled: { reading: false, meaning: false },
  };
}

export function markFieldDirty(state: AddCardAutofillState, field: AddCardField): void {
  state.dirty[field] = true;
  state.autoFilled[field] = false;
}

export function canApplyCandidate(
  state: AddCardAutofillState,
  field: AddCardField,
  currentValue: string,
): boolean {
  if (state.protected[field] || state.dirty[field]) return false;
  return currentValue.trim().length === 0 || state.autoFilled[field];
}

export function candidateValue(candidate: HanjaCandidate, field: AddCardField): string {
  return field === 'reading' ? candidate.reading : candidate.meaning;
}

export function shouldAcceptDictionaryResponse(
  responseSession: number,
  currentSession: number,
  responseRequest: number,
  currentRequest: number,
  responseFront: string,
  currentFront: string,
): boolean {
  return responseSession === currentSession
    && responseRequest === currentRequest
    && responseFront === currentFront;
}

export function applyCandidateToValues(
  state: AddCardAutofillState,
  values: Record<AddCardField, string>,
  candidate: HanjaCandidate,
): Record<AddCardField, string> {
  const next = { ...values };
  for (const field of ['reading', 'meaning'] as const) {
    if (!canApplyCandidate(state, field, values[field])) continue;
    const value = candidateValue(candidate, field);
    if (!value) continue;
    next[field] = value;
    state.autoFilled[field] = true;
  }
  return next;
}

export function prepareValuesForFrontChange(
  state: AddCardAutofillState,
  values: Record<AddCardField, string>,
  existing: Partial<Record<AddCardField, string>>,
): { state: AddCardAutofillState; values: Record<AddCardField, string> } {
  const nextState: AddCardAutofillState = {
    protected: { reading: false, meaning: false },
    dirty: { ...state.dirty },
    autoFilled: { reading: false, meaning: false },
  };
  const nextValues = { ...values };

  for (const field of ['reading', 'meaning'] as const) {
    const existingValue = existing[field]?.trim() ?? '';
    if (state.dirty[field]) {
      continue;
    }
    if (existingValue) {
      nextValues[field] = existingValue;
      nextState.protected[field] = true;
      continue;
    }
    if (state.autoFilled[field] || state.protected[field]) nextValues[field] = '';
  }

  return { state: nextState, values: nextValues };
}
