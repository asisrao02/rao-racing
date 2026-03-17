function PrimaryButton({
  children,
  onClick,
  type = "button",
  disabled = false,
  className = "",
  variant = "primary",
}) {
  const variantClasses =
    variant === "secondary"
      ? "bg-slate-800 border-cyan-300/50 text-cyan-100 hover:bg-slate-700"
      : "bg-gradient-to-r from-orange-500 to-red-500 border-orange-300/60 text-white hover:brightness-110";

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl border px-5 py-3 font-display text-sm uppercase tracking-[0.12em] transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${variantClasses} ${className}`}
    >
      {children}
    </button>
  );
}

export default PrimaryButton;
