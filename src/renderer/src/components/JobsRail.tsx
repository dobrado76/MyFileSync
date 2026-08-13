import type { JobSummary } from '@shared/schemas/job'

type JobsRailProps = {
  jobs: JobSummary[]
  activeJobId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onImportIni: () => void
}

export function JobsRail({ jobs, activeJobId, onSelect, onNew, onImportIni }: JobsRailProps) {
  return (
    <aside className="jobs-rail">
      <div className="jobs-rail-header">
        <h2>Jobs</h2>
      </div>
      <ul className="jobs-list">
        {jobs.length === 0 ? (
          <li className="jobs-empty">No jobs yet. Create one below.</li>
        ) : (
          jobs.map((job) => (
            <li key={job.id}>
              <button
                type="button"
                className={`job-item ${job.id === activeJobId ? 'active' : ''}`}
                onClick={() => onSelect(job.id)}
              >
                <span className="job-name">{job.name}</span>
                <span className="job-meta">
                  {job.variant} · {job.enabledPairCount}/{job.pairCount} pairs
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
      <div className="jobs-rail-actions">
        <button type="button" className="button button-block" onClick={onNew}>
          + New job
        </button>
        <button type="button" className="button button-block" onClick={onImportIni}>
          Import INI
        </button>
      </div>
    </aside>
  )
}
