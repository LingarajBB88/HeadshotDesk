// Placeholder dashboard. Real jobs CRUD is Feature 2 (Task #14).

export default function JobsPage() {
  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Jobs</h1>
        <button className="btn-primary" disabled>
          New job
        </button>
      </div>

      <div className="mt-10 rounded-card border border-dashed border-muted-200 bg-paper p-10 text-center">
        <p className="text-sm text-muted-600">
          You haven&apos;t created any jobs yet.
        </p>
        <p className="mt-1 text-xs text-muted-600">
          Job creation is the next feature being built. Coming up next session.
        </p>
      </div>
    </div>
  );
}
