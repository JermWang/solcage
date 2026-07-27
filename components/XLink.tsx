import { SOLCAGE_X_HANDLE, SOLCAGE_X_URL } from "@/lib/site";

type XLinkProps = {
  className?: string;
  /** Show the @handle next to the mark (footer treatment). */
  withHandle?: boolean;
};

export function XLink({ className = "", withHandle = false }: XLinkProps) {
  return (
    <a
      className={`x-link${withHandle ? " has-handle" : ""}${className ? ` ${className}` : ""}`}
      href={SOLCAGE_X_URL}
      target="_blank"
      rel="noopener noreferrer"
      title={`@${SOLCAGE_X_HANDLE} on X`}
      aria-label={`SolCage on X, @${SOLCAGE_X_HANDLE} (opens in a new tab)`}
    >
      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
      {withHandle && <span>@{SOLCAGE_X_HANDLE}</span>}
    </a>
  );
}
