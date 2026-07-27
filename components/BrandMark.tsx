import Image from "next/image";

export function BrandMark({ size = 96 }: { size?: number }) {
  return (
    <span className="brand-mark brand-logo" aria-hidden="true">
      <Image src="/solcage-logo.png" alt="" width={size} height={size} priority />
    </span>
  );
}
