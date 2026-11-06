import { cn } from "@/lib/utils";

/**
 * 平台品牌字标：复用原型 01 的星芒 Logo（纯 CSS 绘制，无位图素材）。
 * 灵犀 / LUMI 双行字标，尺寸由 rail-logo 的 CSS 变量控制。
 */
export function BrandWordmark({
  className,
  large = false,
}: {
  className?: string;
  large?: boolean;
}) {
  return (
    <span
      className={cn("inline-flex min-w-0 items-center gap-[9px]", large && "brand-wordmark--lg", className)}
      aria-label="灵犀 Lumi"
    >
      <span className="rail-logo" aria-hidden="true" />
      <span className="rail-brand-copy">
        <strong>灵犀</strong>
        <small>LUMI</small>
      </span>
    </span>
  );
}
