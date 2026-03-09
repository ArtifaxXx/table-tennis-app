import React from 'react';

const PageHeader = ({ title, subtitle, right, className = '' }) => {
  return (
    <div className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${className}`.trim()}>
      <div>
        <h2 className="text-2xl font-bold text-gray-800">{title}</h2>
        {subtitle ? <div className="text-sm text-gray-600 mt-1">{subtitle}</div> : null}
      </div>
      {right ? <div className="flex flex-wrap gap-2">{right}</div> : null}
    </div>
  );
};

export default PageHeader;
