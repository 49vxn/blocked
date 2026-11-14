// Pointer-lock state, pure so bun test can run it without a DOM. Some managed laptops and
// hardened browsers refuse requestPointerLock; break/place already work unlocked (the
// crosshair is fixed at the view centre), so a refusal must not leave the player unable to
// look. Two failure modes need telling apart:
// - a browser that never grants lock (policy) errors on the first request from "idle" and
//   sticks in "fallback": stop asking, plain mousemove movementX/Y drives the camera;
// - Chrome errors once when a lock is re-requested inside its Esc-exit cooldown. A state
//   that has locked before never enters "fallback" — it just tries again on the next click.

export type LockState = "idle" | "locked" | "unlocked" | "fallback";
export type LockEvent = "acquired" | "error" | "released";

/** Next state after a pointer-lock event. "idle" has never locked this session; "unlocked"
 * has locked before but is not locked right now; "fallback" is sticky until a lock lands. */
export function nextLockState(state: LockState, event: LockEvent): LockState {
	switch (event) {
		case "acquired":
			return "locked";
		case "error":
			return state === "idle" ? "fallback" : state;
		case "released":
			return state === "locked" ? "unlocked" : state;
	}
}

/** Short HUD hint for the state; "" when nothing needs saying. */
export function lockHint(state: LockState): string {
	return state === "fallback" ? "pointer lock refused - mouse look active" : "";
}
