import { expect, test } from "bun:test";
import { isEligibleUpdate, mergeCatalog } from "../.github/scripts/merge-catalog.cjs";

const repository = "osuki-dev/agent-command-catalog";
const run = {
  event: "workflow_dispatch", conclusion: "success", head_branch: "automation/update-catalog",
  head_sha: "validated-sha", head_repository: { full_name: repository },
  actor: { login: "github-actions[bot]", type: "Bot" },
  workflow_id: 10, id: 20,
};
const pr = {
  state: "open", draft: false, user: { login: "github-actions[bot]", type: "Bot" }, changed_files: 1,
  head: { ref: "automation/update-catalog", sha: "validated-sha", repo: { full_name: repository } },
  base: { ref: "main", sha: "base-sha", repo: { full_name: repository } },
};
const files = [{ status: "modified", filename: "catalog/claude-code.json" }];

test("automatic merge admits only the validated bot catalog update", () => {
  expect(isEligibleUpdate(pr, run, files, repository, "main")).toBe(true);
  for (const changed of [
    { user: { login: "maintainer", type: "User" } },
    { draft: true }, { state: "closed" }, { changed_files: 2 },
    { head: { ...pr.head, sha: "new-unvalidated-sha" } },
    { head: { ...pr.head, ref: "other-branch" } },
    { head: { ...pr.head, repo: { full_name: "attacker/fork" } } },
    { base: { ...pr.base, ref: "other-base" } },
  ]) expect(isEligibleUpdate({ ...pr, ...changed }, run, files, repository, "main")).toBe(false);
  for (const changed of [
    { conclusion: "failure" }, { event: "pull_request" }, { head_branch: "other-branch" },
    { head_repository: { full_name: "attacker/fork" } },
    { actor: { login: "maintainer", type: "User" } },
  ]) expect(isEligibleUpdate(pr, { ...run, ...changed }, files, repository, "main")).toBe(false);
});

test("automatic merge refuses source, workflow, renamed, deleted, and new files", () => {
  for (const filename of ["scripts/catalog.ts", ".github/workflows/validate.yml", "catalog/code.js", "catalog/subdir/data.json", "catalog/../package.json"]) {
    expect(isEligibleUpdate(pr, run, [{ status: "modified", filename }], repository, "main")).toBe(false);
  }
  for (const status of ["added", "removed", "renamed"]) {
    expect(isEligibleUpdate(pr, run, [{ ...files[0], status }], repository, "main")).toBe(false);
  }
  expect(isEligibleUpdate({ ...pr, changed_files: 0 }, run, [], repository, "main")).toBe(false);
});

function mergeFixture({ workflowId = 10, jobConclusion = "success", jobSha = "validated-sha", behindBy = 0, merged = true } = {}) {
  const mergedHeads: string[] = [];
  const github = {
    paginate: async (method: () => Promise<unknown[]>) => method(),
    rest: {
      actions: {
        getWorkflow: async () => ({ data: { id: workflowId } }),
        listJobsForWorkflowRun: async () => [{ name: "Catalog validation", conclusion: jobConclusion, head_sha: jobSha }],
      },
      pulls: {
        list: async () => [{ number: 1 }],
        get: async () => ({ data: { ...pr, number: 1 } }),
        listFiles: async () => files,
        merge: async ({ sha }: { sha: string }) => { mergedHeads.push(sha); return { data: { merged, sha: "merged-sha", message: "Merge refused" } }; },
      },
      repos: { compareCommitsWithBasehead: async () => ({ data: { behind_by: behindBy } }) },
    },
  };
  return {
    mergedHeads,
    args: {
      github,
      context: { repo: { owner: "osuki-dev", repo: "agent-command-catalog" }, payload: { workflow_run: run, repository: { default_branch: "main" } } },
      core: { info: () => {} },
    },
  };
}

test("automatic merge checks validation provenance and uses the exact validated SHA", async () => {
  const success = mergeFixture();
  await mergeCatalog(success.args);
  expect(success.mergedHeads).toEqual(["validated-sha"]);
  for (const options of [{ workflowId: 99 }, { jobConclusion: "failure" }, { jobSha: "old-sha" }]) {
    const rejected = mergeFixture(options);
    await expect(mergeCatalog(rejected.args)).rejects.toThrow();
    expect(rejected.mergedHeads).toEqual([]);
  }
  const outdated = mergeFixture({ behindBy: 1 });
  await mergeCatalog(outdated.args);
  expect(outdated.mergedHeads).toEqual([]);
  await expect(mergeCatalog(mergeFixture({ merged: false }).args)).rejects.toThrow(/not merged/);
});
