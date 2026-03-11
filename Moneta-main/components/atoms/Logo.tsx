import React from 'react';
import {
  LOGO_COLOR_HORIZONTAL,
  LOGO_WHITE_HORIZONTAL,
  LOGO_ICON_ONLY,
} from '../../constants';

type LogoVariant = 'color-horizontal' | 'white-horizontal' | 'icon';

interface LogoProps {
  variant: LogoVariant;
  className?: string;
  onClick?: () => void;
}

const LOGO_MAP: Record<LogoVariant, { src: string; alt: string }> = {
  'color-horizontal': {
    src: LOGO_COLOR_HORIZONTAL,
    alt: 'Moneta – Investieren mit Durchblick',
  },
  'white-horizontal': {
    src: LOGO_WHITE_HORIZONTAL,
    alt: 'Moneta Logo',
  },
  'icon': {
    src: LOGO_ICON_ONLY,
    alt: 'Moneta',
  },
};

const Logo: React.FC<LogoProps> = ({ variant, className = '', onClick }) => {
  const { src, alt } = LOGO_MAP[variant];

  const baseClasses = 'w-auto object-contain select-none';
  const interactiveClasses = onClick ? 'cursor-pointer' : '';

  return (
    <img
      src={src}
      alt={alt}
      className={`${baseClasses} ${interactiveClasses} ${className}`.trim()}
      onClick={onClick}
      draggable={false}
    />
  );
};

export default Logo;
