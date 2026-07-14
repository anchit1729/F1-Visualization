type FocusTarget = {
  focus: () => void;
};

type FocusRoot = {
  getElementById: (id: string) => FocusTarget | null;
};

let pendingReplayControlId: string | null = null;

export function focusReplayControl(root: FocusRoot, nativeId: string) {
  const target = root.getElementById(nativeId);
  if (!target) {
    return false;
  }

  target.focus();
  return true;
}

export function rememberReplayControl(nativeId: string) {
  pendingReplayControlId = nativeId;
}

export function restoreReplayControl(root: FocusRoot) {
  if (
    !pendingReplayControlId ||
    !focusReplayControl(root, pendingReplayControlId)
  ) {
    return false;
  }

  pendingReplayControlId = null;
  return true;
}
