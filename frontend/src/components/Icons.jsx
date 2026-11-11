// small stroke icons, sized by font-size (1em) and colored by currentColor

function Icon({ children, className = "", ...props }) {
  return (
    <svg
      className={`icon ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function PlayIcon(props) {
  return (
    <Icon {...props}>
      <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5Z" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function PauseIcon(props) {
  return (
    <Icon {...props}>
      <rect x="5.5" y="4" width="4.5" height="16" rx="1.2" fill="currentColor" stroke="none" />
      <rect x="14" y="4" width="4.5" height="16" rx="1.2" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function SpinnerIcon({ className = "", ...props }) {
  return (
    <Icon className={`spin ${className}`} {...props}>
      <path d="M12 3a9 9 0 1 0 9 9" />
    </Icon>
  );
}

// circular arrows with "10" inside - skip back/forward 10 seconds
export function Back10Icon(props) {
  return (
    <Icon {...props}>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
      <path d="M3 3.5v4h4" />
      <text x="12.3" y="15.6" fontSize="8.5" fontWeight="700" textAnchor="middle" fill="currentColor" stroke="none" fontFamily="system-ui, sans-serif">10</text>
    </Icon>
  );
}

export function Forward10Icon(props) {
  return (
    <Icon {...props}>
      <path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1" />
      <path d="M21 3.5v4h-4" />
      <text x="11.7" y="15.6" fontSize="8.5" fontWeight="700" textAnchor="middle" fill="currentColor" stroke="none" fontFamily="system-ui, sans-serif">10</text>
    </Icon>
  );
}

export function DownloadIcon(props) {
  return (
    <Icon {...props}>
      <path d="M12 4v11" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 20h14" />
    </Icon>
  );
}

export function HeadphonesIcon(props) {
  return (
    <Icon {...props}>
      <path d="M4 15v-3a8 8 0 0 1 16 0v3" />
      <rect x="3" y="14" width="4.5" height="7" rx="1.5" />
      <rect x="16.5" y="14" width="4.5" height="7" rx="1.5" />
    </Icon>
  );
}

export function CircleIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8" />
    </Icon>
  );
}

export function LineIcon(props) {
  return (
    <Icon {...props}>
      <path d="M3 12h18" />
      <circle cx="13" cy="12" r="2.5" fill="currentColor" />
    </Icon>
  );
}

export function RefreshIcon(props) {
  return (
    <Icon {...props}>
      <path d="M20 12a8 8 0 1 1-2.34-5.66" />
      <path d="M20 4v4.5h-4.5" />
    </Icon>
  );
}

export function EditIcon(props) {
  return (
    <Icon {...props}>
      <path d="M4 20h4L19 9a2.83 2.83 0 0 0-4-4L4 16v4Z" />
      <path d="m13.5 6.5 4 4" />
    </Icon>
  );
}

export function TrashIcon(props) {
  return (
    <Icon {...props}>
      <path d="M4 7h16" />
      <path d="M10 11v6M14 11v6" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
      <path d="M9 7V4h6v3" />
    </Icon>
  );
}

export function OpenIcon(props) {
  return (
    <Icon {...props}>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </Icon>
  );
}

export function RetryIcon(props) {
  return (
    <Icon {...props}>
      <path d="M4 12a8 8 0 1 0 2.34-5.66" />
      <path d="M4 4v4.5h4.5" />
    </Icon>
  );
}

export function UploadIcon(props) {
  return (
    <Icon {...props}>
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </Icon>
  );
}

export function LinkIcon(props) {
  return (
    <Icon {...props}>
      <path d="M10 14a4.5 4.5 0 0 0 6.36 0l3.18-3.18a4.5 4.5 0 0 0-6.36-6.36L11.5 6.1" />
      <path d="M14 10a4.5 4.5 0 0 0-6.36 0l-3.18 3.18a4.5 4.5 0 0 0 6.36 6.36l1.68-1.64" />
    </Icon>
  );
}

export function FileAudioIcon(props) {
  return (
    <Icon {...props}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
      <path d="M14 3v5h5" />
      <path d="M10 17.5V12l4-1v5" />
      <circle cx="9" cy="17.5" r="1.3" />
      <circle cx="13" cy="16" r="1.3" />
    </Icon>
  );
}
