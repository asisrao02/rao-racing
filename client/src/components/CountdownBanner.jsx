function CountdownBanner({ text }) {
  if (!text) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
      <div className="rounded-2xl border border-cyan-300/70 bg-slate-900/70 px-10 py-4 font-display text-5xl text-cyan-100 shadow-neon">
        {text}
      </div>
    </div>
  );
}

export default CountdownBanner;
