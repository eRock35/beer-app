/**
 * Inline line icons in the spirit of SF Symbols. 24px box, 1.8 stroke,
 * currentColor — so they tint with whatever text colour surrounds them.
 * Every icon is decorative; the label next to it carries the meaning.
 */
function Icon({ children, size = 24, strokeWidth = 1.8, className, style, ...rest }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={style}
      {...rest}
    >
      {children}
    </svg>
  );
}

export const MapPinIcon = (p) => (
  <Icon {...p}>
    <path d="M12 21s-6.5-5.7-6.5-11a6.5 6.5 0 0 1 13 0c0 5.3-6.5 11-6.5 11z" />
    <circle cx="12" cy="10" r="2.4" />
  </Icon>
);

export const BookIcon = (p) => (
  <Icon {...p}>
    <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H5.5A1.5 1.5 0 0 1 4 19.5z" />
    <path d="M4 17.5A1.5 1.5 0 0 1 5.5 16H20" />
    <path d="M8.5 7.5h7M8.5 11h5" />
  </Icon>
);

export const TicketIcon = (p) => (
  <Icon {...p}>
    <path d="M3 9V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2.5 2.5 0 0 0 0 5v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2.5 2.5 0 0 0 0-5z" />
    <path d="M14 5v14" strokeDasharray="2 2.5" />
  </Icon>
);

export const SignpostIcon = (p) => (
  <Icon {...p}>
    <path d="M12 3v3M12 12v9M8 21h8" />
    <path d="M6 6h11l2.5 3L17 12H6z" />
  </Icon>
);

export const EllipsisCircleIcon = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="8" cy="12" r="0.6" fill="currentColor" />
    <circle cx="12" cy="12" r="0.6" fill="currentColor" />
    <circle cx="16" cy="12" r="0.6" fill="currentColor" />
  </Icon>
);

export const BarrelIcon = (p) => (
  <Icon {...p}>
    <path d="M7 3h10c1 2.5 1.5 5.5 1.5 9s-.5 6.5-1.5 9H7c-1-2.5-1.5-5.5-1.5-9S6 5.5 7 3z" />
    <path d="M5.8 8.5h12.4M5.8 15.5h12.4M12 3v18" />
  </Icon>
);

export const BubblesIcon = (p) => (
  <Icon {...p}>
    <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h7A2.5 2.5 0 0 1 16 6.5v4a2.5 2.5 0 0 1-2.5 2.5H9l-3.5 3v-3H6.5A2.5 2.5 0 0 1 4 10.5z" />
    <path d="M16 9h1.5A2.5 2.5 0 0 1 20 11.5v4a2.5 2.5 0 0 1-2.5 2.5H17v3l-3.5-3H12" />
  </Icon>
);

export const AntennaIcon = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="11" r="2" />
    <path d="M12 13v8M8.5 7.5a5 5 0 0 0 0 7M15.5 7.5a5 5 0 0 1 0 7" />
    <path d="M5.5 4.5a9 9 0 0 0 0 13M18.5 4.5a9 9 0 0 1 0 13" />
  </Icon>
);

export const SparkleIcon = (p) => (
  <Icon {...p}>
    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
    <path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" />
  </Icon>
);

export const PersonIcon = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4.5 20.5c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5" />
  </Icon>
);

export const SearchIcon = (p) => (
  <Icon {...p}>
    <circle cx="10.5" cy="10.5" r="6" />
    <path d="M15.5 15.5L20 20" />
  </Icon>
);

export const LocationIcon = (p) => (
  <Icon {...p}>
    <path d="M20 4L4 11l7 2 2 7z" />
  </Icon>
);

export const SlidersIcon = (p) => (
  <Icon {...p}>
    <path d="M4 7h10M18 7h2M4 12h3M11 12h9M4 17h12M20 17h0" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="9" cy="12" r="2" />
    <circle cx="18" cy="17" r="2" />
  </Icon>
);

export const CameraIcon = (p) => (
  <Icon {...p}>
    <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7H8l1.2-2h5.6L16 7h2.5A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" />
    <circle cx="12" cy="13" r="3.2" />
  </Icon>
);

export const PlusIcon = (p) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const ArrowUpIcon = (p) => (
  <Icon strokeWidth={2.4} {...p}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </Icon>
);

export const ChevronRightIcon = (p) => (
  <Icon {...p}>
    <path d="M9 6l6 6-6 6" />
  </Icon>
);

export const ChevronDownIcon = (p) => (
  <Icon {...p}>
    <path d="M6 9l6 6 6-6" />
  </Icon>
);

export const CloseIcon = (p) => (
  <Icon strokeWidth={2.2} {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);

export const CheckIcon = (p) => (
  <Icon strokeWidth={2.2} {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Icon>
);

export const StarIcon = ({ filled, ...p }) => (
  <Icon {...p}>
    <path
      d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.9l-5.3 2.8 1.1-5.9-4.3-4.1 5.9-.8z"
      fill={filled ? 'currentColor' : 'none'}
    />
  </Icon>
);

export const LockIcon = (p) => (
  <Icon {...p}>
    <rect x="5" y="10" width="14" height="10" rx="2" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </Icon>
);

export const AlertIcon = (p) => (
  <Icon {...p}>
    <path d="M12 3.5l9 16h-18z" />
    <path d="M12 9.5v4.5M12 17h0" />
  </Icon>
);

export const InfoIcon = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h0" />
  </Icon>
);

export const SunIcon = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
  </Icon>
);

export const MoonIcon = (p) => (
  <Icon {...p}>
    <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
  </Icon>
);

export const CircleHalfIcon = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" />
  </Icon>
);

export const GlassIcon = (p) => (
  <Icon {...p}>
    <path d="M7 3h10l-.8 12.5a4.2 4.2 0 0 1-8.4 0z" />
    <path d="M7.3 8h9.4M12 20v1M9 21h6" />
  </Icon>
);

export const CheersIcon = (p) => (
  <Icon {...p}>
    <path d="M4 5h6l-.7 9.5a2.8 2.8 0 0 1-5.6 0zM14 5h6l-.7 9.5a2.8 2.8 0 0 1-5.6 0z" />
    <path d="M4.3 9h5.4M14.3 9h5.4M7 18v3M17 18v3M5 21h4M15 21h4" />
  </Icon>
);

export const PhoneIcon = (p) => (
  <Icon {...p}>
    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />
  </Icon>
);

export const GlobeIcon = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
  </Icon>
);

export const ArrowUpRightIcon = (p) => (
  <Icon {...p}>
    <path d="M7 17L17 7M9 7h8v8" />
  </Icon>
);

export const CalendarIcon = (p) => (
  <Icon {...p}>
    <rect x="4" y="5" width="16" height="15" rx="2" />
    <path d="M4 10h16M8 3v4M16 3v4" />
  </Icon>
);

export const ClockIcon = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Icon>
);

export const TrashIcon = (p) => (
  <Icon {...p}>
    <path d="M5 7h14M10 7V5h4v2M7 7l.8 12h8.4L17 7M10 11v5M14 11v5" />
  </Icon>
);

export const PencilIcon = (p) => (
  <Icon {...p}>
    <path d="M4 20l4.5-1 10-10-3.5-3.5-10 10z" />
    <path d="M13.5 7l3.5 3.5" />
  </Icon>
);

export const FactoryIcon = (p) => (
  <Icon {...p}>
    <path d="M4 20V9l5 3V9l5 3V9l6 3.5V20z" />
    <path d="M8 20v-3M12 20v-3M16 20v-3" />
  </Icon>
);

export const SignOutIcon = (p) => (
  <Icon {...p}>
    <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M15 8l4 4-4 4M19 12H9" />
  </Icon>
);

export const CompassIcon = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M15.5 8.5l-2 5-5 2 2-5z" />
  </Icon>
);
