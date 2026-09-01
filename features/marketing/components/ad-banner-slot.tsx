type AdBannerSlotProps = {
  placement: "header" | "footer";
};

function AdBannerSlot({ placement }: AdBannerSlotProps) {
  return (
    <div
      className={`ad-banner-slot ad-banner-slot-${placement}`}
      aria-label={`Advertising space reserved — ${placement}`}
      data-ad-slot={placement}
    >
      <span className="ad-banner-slot-label">Advertising space reserved</span>
    </div>
  );
}

export { AdBannerSlot };
