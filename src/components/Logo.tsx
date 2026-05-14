import React from 'react';

export function Logo({ className = "w-12 h-12", src }: { className?: string, src?: string }) {
  const [imgError, setImgError] = React.useState(false);

  // If we have a URL, tried to render it and it didn't error, show the image
  if (src && !imgError) {
    return (
      <div className={`${className} flex items-center justify-center overflow-hidden`}>
        <img 
          key={src} // Force re-render if src changes to avoid showing old img while loading new
          src={src} 
          alt="Logo" 
          className="w-full h-full object-contain" 
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
        />
      </div>
    );
  }

  // Fallback SVG if no src is provided or if the image fails to load
  return (
    <div className={`${className} flex items-center justify-center`}>
      <svg viewBox="0 0 100 100" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Shield Shape */}
        <path 
          d="M50 5 L85 15 L85 45 C85 65 70 85 50 95 C30 85 15 65 15 45 L15 15 L50 5Z" 
          fill="black" 
          stroke="white" 
          strokeWidth="2"
        />
        {/* Banner area */}
        <rect x="20" y="30" width="60" height="40" rx="4" fill="white" />
        {/* Text */}
        <text 
          x="50" 
          y="25" 
          textAnchor="middle" 
          fill="white" 
          fontSize="8" 
          fontWeight="bold" 
          fontFamily="sans-serif"
        >
          MECÂNICA
        </text>
        <text 
          x="50" 
          y="50" 
          textAnchor="middle" 
          fill="black" 
          fontSize="14" 
          fontWeight="900" 
          fontFamily="sans-serif"
        >
          ROTA
        </text>
        <text 
          x="50" 
          y="65" 
          textAnchor="middle" 
          fill="black" 
          fontSize="20" 
          fontWeight="900" 
          fontFamily="sans-serif"
        >
          430
        </text>
      </svg>
    </div>
  );
}
