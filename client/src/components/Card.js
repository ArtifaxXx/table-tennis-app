import React from 'react';

const Card = ({ className = '', children }) => {
  return <div className={`card ${className}`.trim()}>{children}</div>;
};

export default Card;
