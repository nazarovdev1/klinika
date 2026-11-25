import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2, type LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control border font-medium transition-colors duration-150 disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'border-primary bg-primary text-white hover:border-primary-hover hover:bg-primary-hover',
        outline: 'border-line bg-surface text-ink hover:bg-row-hover',
        ghost: 'border-transparent bg-transparent text-ink-2 hover:bg-row-hover hover:text-ink',
        danger: 'border-line bg-surface text-danger-text hover:bg-danger-soft',
      },
      size: {
        md: 'h-9 px-3.5 text-[14px]',
        sm: 'h-8 px-2.5 text-[13px]',
      },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  icon?: LucideIcon;
  loading?: boolean;
}

export function Button({
  className,
  variant,
  size,
  icon: Icon,
  loading,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <Loader2 size={16} className="animate-spin" aria-hidden />
      ) : Icon ? (
        <Icon size={16} aria-hidden />
      ) : null}
      {children}
    </button>
  );
}
