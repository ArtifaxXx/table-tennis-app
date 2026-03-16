import React from 'react';
import { useDivisionContext } from '../context/DivisionContext';

const DivisionSelector = ({ className = '', selectClassName = '' }) => {
  const {
    divisions,
    selectedDivisionId,
    loading,
    setSelectedDivisionId,
  } = useDivisionContext();

  return (
    <div className={`flex items-center gap-2 ${className}`.trim()}>
      <span className="text-sm text-gray-600">Division</span>
      <select
        className={`input ${selectClassName}`.trim()}
        value={selectedDivisionId}
        onChange={(e) => setSelectedDivisionId(e.target.value)}
        disabled={loading}
      >
        {loading && (
          <option value="">Loading divisions...</option>
        )}
        {!loading && divisions.length === 0 && (
          <option value="">No divisions</option>
        )}
        {divisions.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
    </div>
  );
};

export default DivisionSelector;
