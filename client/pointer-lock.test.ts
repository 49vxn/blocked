import { describe, expect, test } from "bun:test";
import { lockHint, nextLockState } from "./pointer-lock";

describe("nextLockState", () => {
	test("a browser that never grants lock falls back on the first error and stays there", () => {
		expect(nextLockState("idle", "error")).toBe("fallback");
		expect(nextLockState("fallback", "error")).toBe("fallback");
		expect(nextLockState("fallback", "released")).toBe("fallback");
	});

	test("Chrome's Esc cooldown errors once after a release; that state keeps retrying", () => {
		expect(nextLockState("locked", "released")).toBe("unlocked");
		expect(nextLockState("unlocked", "error")).toBe("unlocked");
		expect(nextLockState("unlocked", "acquired")).toBe("locked");
	});

	test("acquiring locks from any state, including a fallback that later grants", () => {
		expect(nextLockState("idle", "acquired")).toBe("locked");
		expect(nextLockState("unlocked", "acquired")).toBe("locked");
		expect(nextLockState("fallback", "acquired")).toBe("locked");
	});

	test("a stale error while locked, or a release while unlocked, change nothing", () => {
		expect(nextLockState("locked", "error")).toBe("locked");
		expect(nextLockState("unlocked", "released")).toBe("unlocked");
	});

	test("a release while never locked is a no-op", () => {
		expect(nextLockState("idle", "released")).toBe("idle");
	});
});

describe("lockHint", () => {
	test("only the fallback state explains itself on the HUD", () => {
		expect(lockHint("idle")).toBe("");
		expect(lockHint("locked")).toBe("");
		expect(lockHint("unlocked")).toBe("");
		expect(lockHint("fallback")).not.toBe("");
	});
});
