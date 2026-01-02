'use client';

import { useState } from 'react';

interface ClickableNumberProps {
  number: string;
  className?: string;
}

function ClickableNumber({ number, className = '' }: ClickableNumberProps) {
  const [copied, setCopied] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Remove commas and format for copying (just the raw number)
    const numberToCopy = number.replace(/,/g, '');
    
    try {
      await navigator.clipboard.writeText(numberToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy number:', err);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = numberToCopy;
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

  return (
    <span className="relative inline-block group">
      <button
        onClick={handleClick}
        className={`cursor-pointer hover:bg-blue-600/20 active:bg-blue-600/30 rounded px-1 transition-all duration-150 select-none ${className}`}
        title="Click to copy number"
      >
        {number}
      </button>
      {copied && (
        <span className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-green-600 text-white text-xs px-2 py-1 rounded shadow-lg z-50 whitespace-nowrap pointer-events-none">
          Copied!
        </span>
      )}
    </span>
  );
}

/**
 * Component that renders text with clickable numbers
 * Numbers are detected and made clickable for easy copying
 */
export function TextWithClickableNumbers({ 
  text, 
  className = '' 
}: { 
  text: string; 
  className?: string;
}) {
  // Regex to match numbers (including decimals and numbers with commas)
  // Matches: 5,432.85, 1,234,567.89, 1234.56, 123, 0.123, etc.
  // Pattern explanation:
  // 1. \d{1,3}(?:,\d{3})+(?:\.\d+)? - numbers with commas (requires at least one comma) and optional decimals
  // 2. \d{1,3}(?:,\d{3})*\.\d+ - numbers that may have commas before the decimal point
  // 3. \d+\.\d+ - decimal numbers without commas
  // 4. \d+ - whole numbers
  const numberRegex = /(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d{1,3}(?:,\d{3})*\.\d+|\d+\.\d+|\d+)/g;
  
  const parts: (string | { type: 'number'; value: string })[] = [];
  let lastIndex = 0;
  let match;
  let hasNumbers = false;

  while ((match = numberRegex.exec(text)) !== null) {
    hasNumbers = true;
    // Add text before the number
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    
    // Add the number as a special object
    parts.push({ type: 'number', value: match[0] });
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }
  
  // If no numbers found, return the text as-is
  if (!hasNumbers) {
    return <span className={className}>{text}</span>;
  }

  return (
    <span className={className}>
      {parts.map((part, index) => {
        if (typeof part === 'string') {
          return <span key={index}>{part}</span>;
        } else {
          return (
            <ClickableNumber 
              key={index} 
              number={part.value}
              className="text-blue-400"
            />
          );
        }
      })}
    </span>
  );
}
