import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { parse } from "yaml";

type WorkflowStep = {
  uses?: string;
  if?: string;
  with?: Record<string, string | boolean>;
};

type ForkWorkflow = {
  on: {
    push: { branches: string[] };
    workflow_dispatch: unknown;
  };
  permissions: Record<string, string>;
  jobs: {
    build: {
      steps: WorkflowStep[];
    };
  };
};

const workflow = parse(
  fs.readFileSync(path.join(process.cwd(), ".github/workflows/build-fork.yml"), "utf8")
) as ForkWorkflow;
const build = workflow.jobs.build.steps.find((step) =>
  step.uses?.startsWith("docker/build-push-action@")
);
const login = workflow.jobs.build.steps.find((step) =>
  step.uses?.startsWith("docker/login-action@")
);

test("fork image compilation explicitly uses the validated 8 GiB webpack build profile", () => {
  assert.ok(build?.with);
  const args = Object.fromEntries(
    String(build.with["build-args"] ?? "")
      .split("\n")
      .filter(Boolean)
      .map((line) => line.trim().split("="))
  );
  assert.equal(args.OMNIROUTE_BUILD_MEMORY_MB, "8192");
  assert.equal(args.OMNIROUTE_BUILD_WORKERS, "2", "keep one page-data worker");
  assert.equal(args.OMNIROUTE_USE_TURBOPACK, "0");
  assert.equal(build.with.target, "runner-base");
  assert.equal(build.with.platforms, "linux/amd64");
});

test("fork tags always use the current repository owner's GHCR namespace", () => {
  assert.ok(build?.with);
  assert.deepEqual(
    String(build.with.tags).trim().split("\n"),
    [
      "ghcr.io/${{ github.repository_owner }}/omniroute:patches-latest",
      "ghcr.io/${{ github.repository_owner }}/omniroute:patches-${{ github.sha }}",
    ],
    "do not hard-code either an upstream owner or a contributor's fork"
  );
});

test("manual validation does not authenticate to GHCR or publish an image", () => {
  assert.ok(build?.with);
  assert.ok(login);
  assert.equal(build.with.push, "${{ github.event_name == 'push' }}");
  assert.equal(login.if, "${{ github.event_name == 'push' }}");
  assert.deepEqual(workflow.on.push.branches, ["chatlabel/patches"]);
  assert.ok(Object.hasOwn(workflow.on, "workflow_dispatch"));
  assert.deepEqual(workflow.permissions, { contents: "read" });
});

test("pull requests targeting patches receive the full CI instead of an empty check board", () => {
  const ci = parse(
    fs.readFileSync(path.join(process.cwd(), ".github/workflows/ci.yml"), "utf8")
  ) as { on: { pull_request: { branches: string[] } } };
  assert.deepEqual(ci.on.pull_request.branches, ["main", "chatlabel/patches"]);
});
