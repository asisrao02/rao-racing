function ControlButton({ label, onPress, onRelease, className = "" }) {
  return (
    <button
      type="button"
      className={`pointer-events-auto select-none rounded-2xl border border-cyan-200/40 bg-slate-900/65 px-6 py-4 font-display text-lg text-cyan-100 active:scale-95 ${className}`}
      onPointerDown={onPress}
      onPointerUp={onRelease}
      onPointerLeave={onRelease}
      onPointerCancel={onRelease}
    >
      {label}
    </button>
  );
}

function MobileControls({ onControl }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-30 px-3 md:hidden">
      <div className="flex items-end justify-between gap-3">
        <div className="pointer-events-auto flex flex-col gap-2">
          <div className="flex gap-2">
            <ControlButton label="◀" onPress={() => onControl("left", true)} onRelease={() => onControl("left", false)} />
            <ControlButton
              label="▶"
              onPress={() => onControl("right", true)}
              onRelease={() => onControl("right", false)}
            />
          </div>
          <ControlButton
            label="NITRO"
            className="text-base tracking-[0.08em]"
            onPress={() => onControl("nitro", true)}
            onRelease={() => onControl("nitro", false)}
          />
        </div>

        <div className="pointer-events-auto flex flex-col gap-2">
          <ControlButton
            label="ACCEL"
            className="bg-orange-500/40 text-white"
            onPress={() => onControl("throttle", true)}
            onRelease={() => onControl("throttle", false)}
          />
          <ControlButton
            label="BRAKE"
            className="bg-slate-800/85 text-cyan-100"
            onPress={() => onControl("brake", true)}
            onRelease={() => onControl("brake", false)}
          />
        </div>
      </div>
    </div>
  );
}

export default MobileControls;
