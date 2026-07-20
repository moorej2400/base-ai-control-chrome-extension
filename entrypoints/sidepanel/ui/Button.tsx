import type { ButtonHTMLAttributes, ReactNode } from 'react';
import Icon, { type IconName } from './Icon';

type Variant = 'default' | 'primary' | 'accent-soft' | 'danger-ghost';

/** Text/label button with optional leading icon. Variants map to style.css. */
export function Button({
  variant = 'default',
  small,
  block,
  icon,
  children,
  className,
  ...rest
}: {
  variant?: Variant;
  small?: boolean;
  block?: boolean;
  icon?: IconName;
  children?: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const cls = [
    'btn',
    variant === 'primary' && 'btn-primary',
    variant === 'accent-soft' && 'btn-accent-soft',
    variant === 'danger-ghost' && 'btn-danger-ghost',
    small && 'btn-sm',
    block && 'btn-block',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button type="button" className={cls} {...rest}>
      {icon && <Icon name={icon} size={small ? 12 : 13} />}
      {children}
    </button>
  );
}

/** Square icon-only button (header nav, inline message actions). */
export function IconButton({
  name,
  size = 17,
  variant,
  title,
  ariaLabel,
  iconColor,
  className,
  ...rest
}: {
  name: IconName;
  size?: number;
  variant?: 'sm' | 'back';
  iconColor?: string;
  ariaLabel?: string;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const cls = ['icon-btn', variant === 'sm' && 'sm', variant === 'back' && 'back', className]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type="button"
      className={cls}
      title={title}
      aria-label={ariaLabel ?? title}
      {...rest}
    >
      <Icon name={name} size={size} color={iconColor} />
    </button>
  );
}
