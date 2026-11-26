export function Logo({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 40 40" className="h-9 w-9 shrink-0" aria-hidden>
        <rect width="40" height="40" rx="10" fill="#008C48" />
        <path d="M9 28V12l7 9 4-5 4 5 7-9v16" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="31" cy="12" r="2.6" fill="#B8E6C9" />
      </svg>
      {!compact && (
        <div className="leading-tight">
          <p className="text-[17px] font-extrabold tracking-tight text-ink">Marktvision</p>
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-brand">Leads IA</p>
        </div>
      )}
    </div>
  );
}
