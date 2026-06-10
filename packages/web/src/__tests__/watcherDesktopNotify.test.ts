import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  shouldShowDesktop,
  isDesktopNotifyEnabled,
  setDesktopNotifyEnabled,
  notificationsSupported,
  notificationPermission,
  requestNotificationPermission,
  showDesktopNotification,
  type NotifyPermission,
} from "../lib/watcher/desktopNotify";

/**
 * Desktop notify has two gates — a localStorage preference and the browser
 * permission — ANDed by the pure `shouldShowDesktop`. We test that predicate
 * exhaustively, the preference roundtrip, and stub a fake `Notification` global
 * to cover the supported/permission paths without a real platform API.
 */

const NOTIF = globalThis as unknown as { Notification?: unknown };
const original = NOTIF.Notification;

class FakeNotification {
  static permission: NotificationPermission = "granted";
  static requestPermission = vi.fn(
    async (): Promise<NotificationPermission> => FakeNotification.permission,
  );
  static instances: FakeNotification[] = [];
  /** Settable by the SUT; invoked by tests to simulate a user click. */
  onclick: (() => void) | null = null;
  close = vi.fn();
  constructor(
    public title: string,
    public opts?: NotificationOptions,
  ) {
    FakeNotification.instances.push(this);
  }
}

beforeEach(() => {
  localStorage.clear();
  FakeNotification.instances = [];
  FakeNotification.permission = "granted";
  FakeNotification.requestPermission.mockClear();
});

afterEach(() => {
  if (original === undefined) delete NOTIF.Notification;
  else NOTIF.Notification = original;
});

describe("watcher/desktopNotify — shouldShowDesktop", () => {
  const cases: Array<[boolean, NotifyPermission, boolean]> = [
    [true, "granted", true],
    [false, "granted", false],
    [true, "denied", false],
    [true, "default", false],
    [true, "unsupported", false],
  ];
  it.each(cases)(
    "enabled=%s permission=%s → %s",
    (enabled, permission, expected) => {
      expect(shouldShowDesktop(enabled, permission)).toBe(expected);
    },
  );
});

describe("watcher/desktopNotify — preference", () => {
  it("defaults off and roundtrips through localStorage", () => {
    expect(isDesktopNotifyEnabled()).toBe(false);
    setDesktopNotifyEnabled(true);
    expect(isDesktopNotifyEnabled()).toBe(true);
    setDesktopNotifyEnabled(false);
    expect(isDesktopNotifyEnabled()).toBe(false);
  });
});

describe("watcher/desktopNotify — platform gates", () => {
  it("reports unsupported when there is no Notification API", () => {
    delete NOTIF.Notification;
    expect(notificationsSupported()).toBe(false);
    expect(notificationPermission()).toBe("unsupported");
  });

  it("reflects the browser permission when supported", () => {
    NOTIF.Notification = FakeNotification;
    FakeNotification.permission = "default";
    expect(notificationsSupported()).toBe(true);
    expect(notificationPermission()).toBe("default");
  });

  it("requestNotificationPermission returns 'unsupported' with no API", async () => {
    delete NOTIF.Notification;
    expect(await requestNotificationPermission()).toBe("unsupported");
  });

  it("requestNotificationPermission proxies the browser result", async () => {
    NOTIF.Notification = FakeNotification;
    FakeNotification.permission = "granted";
    expect(await requestNotificationPermission()).toBe("granted");
    expect(FakeNotification.requestPermission).toHaveBeenCalledOnce();
  });
});

describe("watcher/desktopNotify — showDesktopNotification", () => {
  it("fires a Notification only when enabled AND granted", () => {
    NOTIF.Notification = FakeNotification;
    FakeNotification.permission = "granted";
    setDesktopNotifyEnabled(true);

    const fired = showDesktopNotification({
      title: "Address activity",
      body: "0xabc… sent 1.5 → 0xdef…",
      tag: "m1",
    });

    expect(fired).toBe(true);
    expect(FakeNotification.instances).toHaveLength(1);
    expect(FakeNotification.instances[0]!.title).toBe("Address activity");
    expect(FakeNotification.instances[0]!.opts).toMatchObject({ tag: "m1" });
  });

  it("does NOT fire when the preference is off, even if granted", () => {
    NOTIF.Notification = FakeNotification;
    FakeNotification.permission = "granted";
    setDesktopNotifyEnabled(false);

    expect(showDesktopNotification({ title: "x", body: "y" })).toBe(false);
    expect(FakeNotification.instances).toHaveLength(0);
  });

  it("does NOT fire when enabled but permission is not granted", () => {
    NOTIF.Notification = FakeNotification;
    FakeNotification.permission = "denied";
    setDesktopNotifyEnabled(true);

    expect(showDesktopNotification({ title: "x", body: "y" })).toBe(false);
    expect(FakeNotification.instances).toHaveLength(0);
  });

  it("wires onClick to focus the tab, run the action, then dismiss", () => {
    NOTIF.Notification = FakeNotification;
    FakeNotification.permission = "granted";
    setDesktopNotifyEnabled(true);
    const focus = vi.spyOn(window, "focus").mockImplementation(() => {});
    const onClick = vi.fn();

    showDesktopNotification({ title: "x", body: "y", onClick });

    const instance = FakeNotification.instances[0]!;
    expect(instance.onclick).toBeTypeOf("function");
    expect(onClick).not.toHaveBeenCalled(); // not until clicked

    instance.onclick!();
    expect(focus).toHaveBeenCalledOnce();
    expect(onClick).toHaveBeenCalledOnce();
    expect(instance.close).toHaveBeenCalledOnce();
    focus.mockRestore();
  });

  it("leaves onclick unset when no onClick is supplied", () => {
    NOTIF.Notification = FakeNotification;
    FakeNotification.permission = "granted";
    setDesktopNotifyEnabled(true);

    showDesktopNotification({ title: "x", body: "y" });
    expect(FakeNotification.instances[0]!.onclick).toBeNull();
  });

  it("still focuses + dismisses when window.focus throws", () => {
    NOTIF.Notification = FakeNotification;
    FakeNotification.permission = "granted";
    setDesktopNotifyEnabled(true);
    const focus = vi.spyOn(window, "focus").mockImplementation(() => {
      throw new Error("no focus in this context");
    });
    const onClick = vi.fn();

    showDesktopNotification({ title: "x", body: "y", onClick });
    const instance = FakeNotification.instances[0]!;
    instance.onclick!();

    // focus threw, but the swallow keeps navigation + dismiss on track.
    expect(onClick).toHaveBeenCalledOnce();
    expect(instance.close).toHaveBeenCalledOnce();
    focus.mockRestore();
  });
});
