/** Server-rendered fallback while a page's client view hydrates. */
export function PageSkeleton() {
  return (
    <main className="content">
      <div className="page-head">
        <div className="skeleton" style={{ height: 26, width: 260 }} />
      </div>
      <div className="kpi-row">
        {Array.from({ length: 6 }).map((_, index) => (
          <div className="skeleton" key={index} style={{ height: 118 }} />
        ))}
      </div>
      <div className="grid chart-row">
        {Array.from({ length: 3 }).map((_, index) => (
          <div className="skeleton" key={index} style={{ height: 260 }} />
        ))}
      </div>
    </main>
  );
}
