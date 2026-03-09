import React, { useEffect, useMemo, useState } from 'react';

const BuildInfoWidget = () => {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch('/build-info.json', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (mounted) setInfo(data);
      } catch (e) {
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const label = useMemo(() => {
    if (info?.sha) return `build ${info.sha}`;
    return 'dev';
  }, [info]);

  return (
    <>
      <button
        type="button"
        className="fixed bottom-4 right-4 z-40 rounded-full border border-gray-200 bg-white/90 px-3 py-1 text-xs font-medium text-gray-700 shadow-sm hover:bg-white"
        onClick={() => setOpen(true)}
        title={info?.builtAt ? `Built ${new Date(info.builtAt).toLocaleString()}` : 'Build info'}
      >
        {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-black/30"
            onClick={() => setOpen(false)}
            aria-label="Close"
          />
          <div className="absolute bottom-16 right-4 w-[calc(100%-2rem)] max-w-md rounded-xl border border-gray-200 bg-white shadow-lg">
            <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-gray-900">Build info</div>
                <div className="text-xs text-gray-600">
                  {info?.branch ? `${info.branch} · ` : ''}
                  {info?.sha || label}
                  {info?.builtAt ? ` · ${new Date(info.builtAt).toLocaleString()}` : ''}
                </div>
              </div>
              <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto px-4 py-3">
              {Array.isArray(info?.changes) && info.changes.length > 0 ? (
                <div className="space-y-2">
                  {info.changes.map((c) => (
                    <div key={c.hash} className="rounded-lg bg-gray-50 px-3 py-2">
                      <div className="text-xs font-medium text-gray-900">
                        {c.hash}
                        {c.date ? ` · ${c.date}` : ''}
                      </div>
                      <div className="text-sm text-gray-800">{c.subject}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-600">No recent changes found.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default BuildInfoWidget;
