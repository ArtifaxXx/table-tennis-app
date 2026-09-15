import React, { useEffect, useState } from 'react';

const BuildInfoWidget = () => {
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

  if (!info?.version) return null;

  const buildTime = info.builtAt
    ? new Date(info.builtAt).toLocaleString()
    : 'Build time unavailable';

  return (
    <div
      className="fixed bottom-4 right-4 z-40 rounded-full border border-gray-200 bg-white/90 px-3 py-1 text-xs font-medium text-gray-700 shadow-sm"
      title={`Built ${buildTime}`}
      aria-label={`Application version ${info.version}. Built ${buildTime}`}
    >
      v{info.version}
    </div>
  );
};

export default BuildInfoWidget;
