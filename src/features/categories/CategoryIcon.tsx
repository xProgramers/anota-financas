import {
  Briefcase, Car, Circle, GraduationCap, HeartPulse, Home, Laptop, Plane, Popcorn, Receipt, Repeat, ShoppingBag,
  Tag, TrendingUp, Utensils, Coffee, Gift, PawPrint, Baby, Dumbbell, Wrench, Smartphone,
  type LucideIcon,
} from 'lucide-react';

export const ICONS: Record<string, LucideIcon> = {
  utensils: Utensils,
  car: Car,
  home: Home,
  receipt: Receipt,
  'shopping-bag': ShoppingBag,
  'heart-pulse': HeartPulse,
  popcorn: Popcorn,
  'graduation-cap': GraduationCap,
  repeat: Repeat,
  plane: Plane,
  circle: Circle,
  briefcase: Briefcase,
  laptop: Laptop,
  'trending-up': TrendingUp,
  tag: Tag,
  coffee: Coffee,
  gift: Gift,
  'paw-print': PawPrint,
  baby: Baby,
  dumbbell: Dumbbell,
  wrench: Wrench,
  smartphone: Smartphone,
};

export function CategoryIcon({ icon, color, size = 'md' }: { icon?: string | null; color?: string | null; size?: 'sm' | 'md' }) {
  const Icon = ICONS[icon ?? 'circle'] ?? Circle;
  const box = size === 'sm' ? 'size-7' : 'size-9';
  const glyph = size === 'sm' ? 'size-3.5' : 'size-4';
  return (
    <span
      className={`${box} inline-flex shrink-0 items-center justify-center rounded-full`}
      style={{ backgroundColor: `${color ?? '#868e96'}1f`, color: color ?? '#868e96' }}
      aria-hidden
    >
      <Icon className={glyph} strokeWidth={2} />
    </span>
  );
}
