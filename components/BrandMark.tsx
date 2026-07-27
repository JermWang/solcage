export function BrandMark({ size = 96 }: { size?: number }) {
  return (
    <span className="brand-mark brand-logo" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/solcage-logo.png" alt="" width={size} height={size} />
    </span>
  );
}
