const branch = 'automation/update-catalog';

function isEligibleUpdate(pr, run, files, repository, defaultBranch) {
  return run.event === 'workflow_dispatch'
    && run.conclusion === 'success'
    && run.head_branch === branch
    && run.head_repository?.full_name === repository
    && run.actor?.login === 'github-actions[bot]'
    && run.actor?.type === 'Bot'
    && pr.state === 'open'
    && !pr.draft
    && pr.user?.login === 'github-actions[bot]'
    && pr.user?.type === 'Bot'
    && pr.head?.repo?.full_name === repository
    && pr.head?.ref === branch
    && pr.head?.sha === run.head_sha
    && pr.base?.ref === defaultBranch
    && pr.base?.repo?.full_name === repository
    && files.length > 0
    && files.length === pr.changed_files
    && files.every(file => file.status === 'modified' && /^catalog\/[a-z][a-z0-9-]*\.json$/.test(file.filename));
}

async function mergeCatalog({ github, context, core }) {
  const run = context.payload.workflow_run;
  const repository = `${context.repo.owner}/${context.repo.repo}`;
  const defaultBranch = context.payload.repository.default_branch;
  const { data: workflow } = await github.rest.actions.getWorkflow({ ...context.repo, workflow_id: 'validate.yml' });
  if (run.workflow_id !== workflow.id) throw new Error('Unexpected validation workflow');
  const prs = await github.paginate(github.rest.pulls.list, {
    ...context.repo, state: 'open', head: `${context.repo.owner}:${branch}`, base: defaultBranch, per_page: 100,
  });
  if (prs.length !== 1) return core.info('No unique catalog update PR to merge');
  const { data: pr } = await github.rest.pulls.get({ ...context.repo, pull_number: prs[0].number });
  const files = await github.paginate(github.rest.pulls.listFiles, { ...context.repo, pull_number: pr.number, per_page: 100 });
  if (!isEligibleUpdate(pr, run, files, repository, defaultBranch)) return core.info('PR is not an eligible generated catalog update');
  const jobs = await github.paginate(github.rest.actions.listJobsForWorkflowRun, { ...context.repo, run_id: run.id, filter: 'latest', per_page: 100 });
  if (!jobs.some(job => job.name === 'Catalog validation' && job.conclusion === 'success' && job.head_sha === pr.head.sha)) {
    throw new Error('Catalog validation did not pass for the current PR head');
  }
  const { data: comparison } = await github.rest.repos.compareCommitsWithBasehead({
    ...context.repo, basehead: `${pr.base.sha}...${pr.head.sha}`,
  });
  if (comparison.behind_by !== 0) return core.info('Update branch is behind the base; wait for the next updater run');
  const { data: result } = await github.rest.pulls.merge({
    ...context.repo, pull_number: pr.number, sha: pr.head.sha, merge_method: 'squash',
  });
  if (!result.merged) throw new Error(`Catalog update was not merged: ${result.message}`);
  core.info(`Merged catalog update #${pr.number} at ${result.sha}`);
}

module.exports = { mergeCatalog, isEligibleUpdate };
