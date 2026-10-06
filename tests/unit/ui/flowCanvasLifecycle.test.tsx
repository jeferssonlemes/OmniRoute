// @vitest-environment jsdom
import React, { act } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fitView } = vi.hoisted(() => ({ fitView: vi.fn(async () => true) }));

vi.mock("@xyflow/react", async () => {
  const { useEffect } = await import("react");
  return {
    ReactFlow: ({
      onInit,
      children,
    }: {
      onInit: (instance: { fitView: typeof fitView }) => void;
      children: React.ReactNode;
    }) => {
      useEffect(() => {
        onInit({ fitView });
      }, [onInit]);
      return <>{children}</>;
    },
    Controls: () => null,
  };
});

import FlowCanvas from "@/shared/components/flow/FlowCanvas";

describe("FlowCanvas deferred refit lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fitView.mockClear();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      }
    );
  });

  afterEach(() => {
    cleanup();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("still fits a canvas that remains mounted", () => {
    render(<FlowCanvas nodes={[]} edges={[]} />);
    act(() => {
      vi.advanceTimersByTime(80);
    });
    expect(fitView).toHaveBeenCalled();
  });

  it("does not touch a disposed ReactFlow instance after unmount", () => {
    const view = render(<FlowCanvas nodes={[]} edges={[]} />);
    view.unmount();
    act(() => {
      vi.advanceTimersByTime(80);
    });
    expect(fitView).not.toHaveBeenCalled();
  });
});
