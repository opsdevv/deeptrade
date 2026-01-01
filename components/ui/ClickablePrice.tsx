'use client';

import { useState } from 'react';
import { formatPrice } from '@/lib/utils/price-format';

interface ClickablePriceProps {
  price: number | null | undefined;
  instrument: string;
  className?: string;
  showTooltip?: boolean;
}

export default function ClickablePrice({
  price,
  instrument,
  className = '',
  showTooltip = true,
}: ClickablePriceProps) {
  const [copied, setCopied] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (price === null || price === undefined) {
      return;
    }

    const priceString = price.toString();
    
    try {
      await navigator.clipboard.writeText(priceString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy price:', err);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = priceString;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (fallbackErr) {
        console.error('Fallback copy failed:', fallbackErr);
      }
      document.body.removeChild(textArea);
    }
  };

  if (price === null || price === undefined) {
    return <span className={className}>N/A</span>;
  }

  const formattedPrice = formatPrice(price, instrument);

  return (
    <span className="relative inline-block group">
      <button
        onClick={handleClick}
        className={`cursor-pointer hover:bg-blue-600/20 active:bg-blue-600/30 rounded px-1 transition-all duration-150 select-none ${className}`}
        title={showTooltip ? 'Click to copy price' : undefined}
      >
        {formattedPrice}
      </button>
      {copied && (
        <span className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-green-600 text-white text-xs px-2 py-1 rounded shadow-lg z-50 whitespace-nowrap pointer-events-none">
          Copied!
        </span>
      )}
    </span>
  );
}

