import { describe, it, expect, vi } from "vitest";
import PkgOptResolver from "../../lib/pkg-opt-resolver";

describe("pkg-opt-resolver watch event runningScript filtering", () => {
  it("filters out items when runningScript is set on OptDepData", () => {
    const resolver = Object.create(PkgOptResolver.prototype);
    resolver.setupQ();

    const watchListener = (resolver._promiseQ as any).listeners("watch")[0];
    expect(watchListener).toBeDefined();

    const items: any = {
      watched: [
        { item: { item: { name: "pkg-a", resolved: "1.0.0" }, runningScript: true } },
        { item: { item: { name: "pkg-b", resolved: "1.0.0" } } },
      ],
      still: [
        { item: { item: { name: "pkg-c", resolved: "1.0.0" }, runningScript: true } },
        { item: { item: { name: "pkg-d", resolved: "1.0.0" } } },
      ],
    };

    watchListener(items);

    expect(items.watched).toHaveLength(1);
    expect(items.watched[0].item.item.name).toBe("pkg-b");
    expect(items.still).toHaveLength(1);
    expect(items.still[0].item.item.name).toBe("pkg-d");
    expect(items.total).toBe(2);
  });

  it("filters out items when runningScript is set on inner OptDepItem", () => {
    const resolver = Object.create(PkgOptResolver.prototype);
    resolver.setupQ();

    const watchListener = (resolver._promiseQ as any).listeners("watch")[0];
    expect(watchListener).toBeDefined();

    const items: any = {
      watched: [
        { item: { item: { name: "pkg-a", resolved: "1.0.0", runningScript: true } } },
        { item: { item: { name: "pkg-b", resolved: "1.0.0" } } },
      ],
      still: [],
    };

    watchListener(items);

    expect(items.watched).toHaveLength(1);
    expect(items.watched[0].item.item.name).toBe("pkg-b");
    expect(items.total).toBe(1);
  });
});
