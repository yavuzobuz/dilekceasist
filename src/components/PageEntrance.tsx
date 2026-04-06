import React, { useEffect, useState } from 'react';

interface PageEntranceProps {
  children: React.ReactNode;
  className?: string;
  withAtmosphere?: boolean;
}

export const PageEntrance: React.FC<PageEntranceProps> = ({
  children,
  className = '',
  withAtmosphere = true,
}) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setIsVisible(true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <div className={`relative ${className}`.trim()}>
      {withAtmosphere && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div
            className="absolute top-1/4 left-1/4 h-96 w-96 rounded-full bg-red-600/10 blur-3xl animate-pulse"
            style={{ animationDuration: '4s' }}
          />
          <div
            className="absolute right-1/4 bottom-1/4 h-96 w-96 rounded-full bg-red-500/10 blur-3xl animate-pulse"
            style={{ animationDuration: '6s', animationDelay: '1s' }}
          />
        </div>
      )}
      <div
        className={`relative z-10 transition-all duration-1000 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}
      >
        {children}
      </div>
    </div>
  );
};

export default PageEntrance;
